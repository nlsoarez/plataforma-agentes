import type { QueryFn } from '@plataforma/db';

export async function upsertContato(q: QueryFn, tenantId: string, projetoId: string, telefone: string): Promise<{ id: string; criado: boolean }> {
  const r = await q(
    `insert into contatos (tenant_id, projeto_id, telefone, ultima_interacao, unread_messages)
     values ($1,$2,$3,now(),1)
     on conflict (projeto_id, telefone) do update
       set telefone = excluded.telefone,
           ultima_interacao = now(),
           unread_messages = contatos.unread_messages + 1
     returning id, (xmax = 0) as criado`,
    [tenantId, projetoId, telefone],
  );
  return { id: r.rows[0].id, criado: r.rows[0].criado };
}

export async function acharOuCriarConversa(q: QueryFn, tenantId: string, projetoId: string, contatoId: string) {
  const aberta = await q(
    `select id, ia_pausada from conversas where contato_id=$1 and status='aberta' order by atualizada_em desc limit 1`,
    [contatoId],
  );
  if (aberta.rows[0]) return aberta.rows[0] as { id: string; ia_pausada: boolean };
  const nova = await q(
    `insert into conversas (tenant_id, projeto_id, contato_id) values ($1,$2,$3) returning id, ia_pausada`,
    [tenantId, projetoId, contatoId],
  );
  return nova.rows[0] as { id: string; ia_pausada: boolean };
}

export async function gravarMensagem(
  q: QueryFn, tenantId: string, conversaId: string,
  m: {
    direcao: 'inbound' | 'outbound';
    autor: string;
    conteudo: string;
    metaMessageId?: string;
    tokensIn?: number;
    tokensOut?: number;
    midia?: { tipo?: string; url?: string; mime?: string; raw?: unknown };
  },
) {
  await q(
    `insert into mensagens (
       tenant_id, conversa_id, direcao, autor, conteudo, meta_message_id, tokens_in, tokens_out,
       midia_tipo, midia_url, midia_mime, midia_meta
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict do nothing`,
    [
      tenantId, conversaId, m.direcao, m.autor, m.conteudo, m.metaMessageId ?? null, m.tokensIn ?? null, m.tokensOut ?? null,
      m.midia?.tipo ?? null, m.midia?.url ?? null, m.midia?.mime ?? null, JSON.stringify(m.midia?.raw ?? {}),
    ],
  );
  await q(`update conversas set atualizada_em = now() where id=$1`, [conversaId]);
}

export async function carregarAgente(q: QueryFn, projetoId: string) {
  const r = await q(
    `select a.id, a.prompt_sistema,
            coalesce(nullif(a.modelo, ''), s.default_model, 'gpt-4o-mini') as modelo,
            a.provider,
            a.byok_key_ref,
            a.funcoes,
            a.status,
            a.horario_ativo,
            to_char(a.horario_inicio, 'HH24:MI') as horario_inicio,
            to_char(a.horario_fim, 'HH24:MI') as horario_fim,
            a.horario_timezone,
            s.encrypted_api_key,
            s.default_model,
            s.embedding_model,
            s.input_cost_per_1m,
            s.output_cost_per_1m
     from agentes a
     left join ai_provider_settings s
       on s.tenant_id=a.tenant_id
      and s.provider=a.provider
      and s.ativo=true
     where a.projeto_id=$1 and a.status in ('ativo','pausado')
     order by case when a.status='ativo' then 0 else 1 end, a.id
     limit 1`,
    [projetoId],
  );
  return r.rows[0] ?? null;
}

export async function carregarHistorico(q: QueryFn, conversaId: string, limite = 12) {
  const r = await q(
    `select autor, conteudo from mensagens where conversa_id=$1 order by criada_em desc limit $2`,
    [conversaId, limite],
  );
  return (r.rows as { autor: string; conteudo: string }[]).reverse();
}

export async function logarAcao(q: QueryFn, tenantId: string, conversaId: string, funcao: string, argumentos: unknown, resultado: unknown) {
  await q(
    `insert into acoes_ia (tenant_id, conversa_id, funcao, argumentos, resultado) values ($1,$2,$3,$4,$5)`,
    [tenantId, conversaId, funcao, JSON.stringify(argumentos), JSON.stringify(resultado)],
  );
}

export async function logarEventoOperacional(
  q: QueryFn,
  tenantId: string,
  projetoId: string,
  origem: string,
  nivel: 'info' | 'warn' | 'error',
  evento: string,
  mensagem: string,
  payload: unknown = {},
) {
  await q(
    `insert into eventos_operacionais (tenant_id, projeto_id, origem, nivel, evento, mensagem, payload)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, projetoId, origem, nivel, evento, mensagem, JSON.stringify(payload ?? {})],
  );
}
