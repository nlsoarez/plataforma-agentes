import type { QueryFn } from '@plataforma/db';
import { logarAcao } from '../repos';
import { publicar } from '@plataforma/bus';
import { enviarConversao } from './conversoes';
import { dispararWebhooks, leadPayload } from '../integrations/webhooks';
import { buscarConhecimento } from './knowledge';

// Contexto que todo executor recebe.
export interface ToolCtx {
  q: QueryFn;
  tenantId: string;
  projetoId: string;
  conversaId: string;
  contatoId: string;
  handoff: boolean; // vira true se a IA passar pra um humano
}

// Schemas no formato function-calling da OpenAI.
export const TOOLS_SCHEMA = [
  { type: 'function', function: { name: 'mover_card', description: 'Move o lead para uma etapa do funil (pipeline).',
      parameters: { type: 'object', properties: { etapa: { type: 'string', description: 'Nome da etapa de destino' } }, required: ['etapa'] } } },
  { type: 'function', function: { name: 'taguear', description: 'Adiciona tags ao contato.',
      parameters: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'] } } },
  { type: 'function', function: { name: 'agendar', description: 'Agenda um horario com o lead.',
      parameters: { type: 'object', properties: { datetime: { type: 'string', description: 'ISO 8601' }, descricao: { type: 'string' } }, required: ['datetime'] } } },
  { type: 'function', function: { name: 'consultar_base', description: 'Consulta a base de conhecimento (RAG).',
      parameters: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] } } },
  { type: 'function', function: { name: 'handoff_humano', description: 'Transfere a conversa para um atendente humano e pausa a IA.',
      parameters: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] } } },
  { type: 'function', function: { name: 'registrar_conversao', description: 'Registra uma conversao do lead (ex: Lead, Agendamento, Compra) de volta no Meta Ads.',
      parameters: { type: 'object', properties: { evento: { type: 'string' }, valor: { type: 'number' }, moeda: { type: 'string' } }, required: ['evento'] } } },
] as const;

type Executor = (ctx: ToolCtx, args: any) => Promise<unknown>;

const executores: Record<string, Executor> = {
  async mover_card(ctx, { etapa }) {
    const r = await ctx.q(`select id from etapas_pipeline where projeto_id=$1 and lower(nome)=lower($2) limit 1`, [ctx.projetoId, etapa]);
    if (!r.rows[0]) return { ok: false, motivo: 'etapa nao encontrada' };
    await ctx.q(`update contatos set etapa_pipeline=$1 where id=$2`, [r.rows[0].id, ctx.contatoId]);
    await publicar(ctx.tenantId, { tipo: 'card', contatoId: ctx.contatoId, etapaId: r.rows[0].id });
    const payload = await leadPayload(ctx.q, ctx.contatoId);
    if (payload) await dispararWebhooks(ctx.q, ctx.tenantId, 'LEAD_KANBAN_UPDATED', { ...payload, column: { id: r.rows[0].id, name: etapa } });
    return { ok: true, etapa };
  },
  async taguear(ctx, { tags }) {
    await ctx.q(
      `update contatos set tags = array(select distinct unnest(tags || $1::text[])) where id=$2`,
      [tags, ctx.contatoId],
    );
    const payload = await leadPayload(ctx.q, ctx.contatoId);
    if (payload) await dispararWebhooks(ctx.q, ctx.tenantId, 'LEAD_TAG_ADDED', { ...payload, tags });
    return { ok: true, tags };
  },
  async agendar(ctx, { datetime, descricao }) {
    const inicio = new Date(datetime);
    if (Number.isNaN(inicio.getTime())) return { ok: false, motivo: 'datetime invalido' };

    const created = await ctx.q(
      `insert into agendamentos (
         tenant_id, projeto_id, conversa_id, contato_id, inicio_em, descricao, status, provider
       )
       values ($1,$2,$3,$4,$5,$6,'pendente',$7)
       returning id, inicio_em, descricao, status`,
      [
        ctx.tenantId,
        ctx.projetoId,
        ctx.conversaId,
        ctx.contatoId,
        inicio.toISOString(),
        descricao ?? null,
        process.env.CALENDAR_WEBHOOK_URL ? 'webhook' : null,
      ],
    );

    const agendamento = created.rows[0];
    if (!process.env.CALENDAR_WEBHOOK_URL) {
      return {
        ok: true,
        agendamento,
        nota: 'agendamento salvo; configure CALENDAR_WEBHOOK_URL para sincronizar com Google Calendar ou outro calendario',
      };
    }

    const payload = JSON.stringify({
      type: 'APPOINTMENT_CREATED',
      tenantId: ctx.tenantId,
      projetoId: ctx.projetoId,
      conversaId: ctx.conversaId,
      contatoId: ctx.contatoId,
      appointmentId: agendamento.id,
      startsAt: agendamento.inicio_em,
      description: agendamento.descricao,
    });

    try {
      const response = await fetch(process.env.CALENDAR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      const text = await response.text().catch(() => '');
      await ctx.q(
        `update agendamentos
         set status=$2, provider_ref=$3, erro=$4, atualizado_em=now()
         where id=$1`,
        [agendamento.id, response.ok ? 'sincronizado' : 'falha', text.slice(0, 500) || null, response.ok ? null : `HTTP ${response.status}`],
      );
      return { ok: response.ok, agendamento: { ...agendamento, status: response.ok ? 'sincronizado' : 'falha' }, status: response.status };
    } catch (e: any) {
      await ctx.q(
        `update agendamentos set status='falha', erro=$2, atualizado_em=now() where id=$1`,
        [agendamento.id, e?.message || 'erro desconhecido'],
      );
      return { ok: false, agendamento, motivo: e?.message || 'erro desconhecido' };
    }
  },
  async consultar_base(_ctx, { consulta }) {
    const query = String(consulta || '').trim();
    if (!query) return { ok: false, motivo: 'consulta vazia' };
    const resultados = await buscarConhecimento(_ctx.q, _ctx.projetoId, query, 5);
    return { ok: true, consulta: query, resultados };
  },
  async handoff_humano(ctx, { motivo }) {
    await ctx.q(`update conversas set ia_pausada=true, status='aguardando' where id=$1`, [ctx.conversaId]);
    ctx.handoff = true;
    return { ok: true, motivo };
  },
  async registrar_conversao(ctx, { evento, valor, moeda }) {
    const r = await ctx.q(`select ctwa_clid from contatos where id=$1`, [ctx.contatoId]);
    const clid = r.rows[0]?.ctwa_clid;
    if (!clid) return { ok: false, motivo: 'contato nao veio de anuncio (sem ctwa_clid)' };
    try { await enviarConversao({ ctwaClid: clid, eventName: evento, valor, moeda }); return { ok: true, evento }; }
    catch (e: any) { return { ok: false, motivo: e.message }; }
  },
};

export async function executarTool(ctx: ToolCtx, nome: string, args: any): Promise<unknown> {
  const fn = executores[nome];
  const resultado = fn ? await fn(ctx, args) : { ok: false, motivo: 'tool desconhecida' };
  await logarAcao(ctx.q, ctx.tenantId, ctx.conversaId, nome, args, resultado);
  return resultado;
}
