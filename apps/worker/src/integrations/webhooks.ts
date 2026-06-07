import type { QueryFn } from '@plataforma/db';
import { createHmac } from 'crypto';

function assinarWebhook(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function retryConfig() {
  return {
    attempts: Math.max(1, Number(process.env.WEBHOOK_OUT_MAX_ATTEMPTS ?? 3)),
    baseDelayMs: Math.max(100, Number(process.env.WEBHOOK_OUT_RETRY_BASE_DELAY_MS ?? 750)),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enviarComRetry(url: string, init: RequestInit) {
  const cfg = retryConfig();
  let lastError = '';
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      lastStatus = response.status;
      if (response.ok) return { ok: true, status: response.status, attempts: attempt, error: null };
      lastError = `HTTP ${response.status}: ${await response.text().catch(() => '')}`;
    } catch (err: any) {
      lastError = err?.message || 'erro desconhecido';
    }

    if (attempt < cfg.attempts) {
      await sleep(cfg.baseDelayMs * attempt);
    }
  }

  return { ok: false, status: lastStatus, attempts: cfg.attempts, error: lastError };
}

export async function dispararWebhooks(q: QueryFn, tenantId: string, evento: string, payload: any) {
  const subs = (await q(
    `select id, url, secret
     from webhook_subscriptions
     where ativo=true and $1 = any(eventos)`,
    [evento],
  )).rows;

  for (const sub of subs) {
    const body = JSON.stringify({ type: evento, ...payload, timestamp: new Date().toISOString() });
    const delivery = await q(
      `insert into webhook_deliveries (tenant_id, subscription_id, evento, payload, status)
       values ($1,$2,$3,$4,'enviando')
       returning id`,
      [tenantId, sub.id, evento, body],
    );
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sub.secret) headers['x-attende-signature'] = assinarWebhook(sub.secret, body);

    const result = await enviarComRetry(sub.url, { method: 'POST', headers, body });
    await q(
      `update webhook_deliveries
       set status=$2,
           status_code=$3,
           erro=$4,
           tentativas=tentativas+$5,
           enviado_em=case when $2='enviado' then now() else enviado_em end
       where id=$1`,
      [delivery.rows[0].id, result.ok ? 'enviado' : 'falha', result.status, result.error, result.attempts],
    );
  }
}

export async function leadPayload(q: QueryFn, contatoId: string) {
  const r = await q(
    `select c.id, c.nome, c.telefone, c.tags, c.notes, c.metadata, c.unread_messages,
            c.ai_response_block_until, c.ultima_interacao, c.criado_em,
            c.etapa_pipeline as column_id, c.responsavel_id as assigned_to_user,
            c.departamento_id as assigned_to_team, p.phone_number_id, p.nome as attendant_name
     from contatos c
     join projetos p on p.id=c.projeto_id
     where c.id=$1`,
    [contatoId],
  );
  const lead = r.rows[0];
  if (!lead) return null;
  return {
    lead: {
      id: lead.id,
      name: lead.nome,
      wa_id: lead.telefone,
      last_interaction: lead.ultima_interacao,
      conversation_expires_in: null,
      created_at: lead.criado_em,
      ai_response_block_until: lead.ai_response_block_until,
      tags: lead.tags,
      unread_messages: lead.unread_messages,
      column_id: lead.column_id,
      notes: lead.notes,
      metadata: lead.metadata,
      assigned_to_user: lead.assigned_to_user,
      assigned_to_team: lead.assigned_to_team,
    },
    attendant: {
      meta_number_id: lead.phone_number_id,
      name: lead.attendant_name,
    },
  };
}
