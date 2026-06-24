import type { QueryFn } from '@plataforma/db';
import { logarAcao } from '../repos';
import { publicar } from '@plataforma/bus';
import { enviarConversao } from './conversoes';
import { dispararWebhooks, leadPayload } from '../integrations/webhooks';
import { buscarConhecimento } from './knowledge';
import {
  criarEventoGoogleCalendarTenant,
  verificarDisponibilidadeGoogleCalendarTenant,
} from '../integrations/google-calendar';

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
  { type: 'function', function: { name: 'consultar_disponibilidade', description: 'Consulta se um horario esta livre antes de oferecer ou confirmar agendamento.',
      parameters: { type: 'object', properties: { datetime: { type: 'string', description: 'ISO 8601' }, duracao_minutos: { type: 'number', description: 'Duracao em minutos. Padrao: 60' } }, required: ['datetime'] } } },
  { type: 'function', function: { name: 'agendar', description: 'Agenda um horario com o lead somente se nao houver conflito na agenda.',
      parameters: { type: 'object', properties: { datetime: { type: 'string', description: 'ISO 8601' }, descricao: { type: 'string' }, duracao_minutos: { type: 'number', description: 'Duracao em minutos. Padrao: 60' } }, required: ['datetime'] } } },
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
  async consultar_disponibilidade(ctx, { datetime, duracao_minutos }) {
    const inicio = new Date(datetime);
    if (Number.isNaN(inicio.getTime())) return { ok: false, motivo: 'datetime invalido' };
    return consultarDisponibilidade(ctx, inicio, normalizarDuracao(duracao_minutos));
  },
  async agendar(ctx, { datetime, descricao, duracao_minutos }) {
    const inicio = new Date(datetime);
    if (Number.isNaN(inicio.getTime())) return { ok: false, motivo: 'datetime invalido' };
    const duracao = normalizarDuracao(duracao_minutos);

    const disponibilidade = await consultarDisponibilidade(ctx, inicio, duracao);
    if (!disponibilidade.available) {
      return {
        ok: false,
        motivo: 'horario_indisponivel',
        conflitos: disponibilidade.conflitos,
        sugestao: 'Pergunte ao cliente por outro dia ou horario antes de tentar agendar novamente.',
      };
    }

    const contato = (await ctx.q(`select nome, telefone from contatos where id=$1`, [ctx.contatoId])).rows[0] || {};
    const fim = new Date(inicio.getTime() + duracao * 60_000);
    const created = await ctx.q(
      `insert into agendamentos (
         tenant_id, projeto_id, conversa_id, contato_id, inicio_em, fim_em, duracao_minutos, descricao, status, provider
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,'pendente',$9)
       returning id, inicio_em, fim_em, duracao_minutos, descricao, status`,
      [
        ctx.tenantId,
        ctx.projetoId,
        ctx.conversaId,
        ctx.contatoId,
        inicio.toISOString(),
        fim.toISOString(),
        duracao,
        descricao ?? null,
        'calendar',
      ],
    );

    const agendamento = created.rows[0];
    try {
      const eventoTenant = await criarEventoGoogleCalendarTenant(ctx.q, ctx.tenantId, {
        summary: `Atendimento ${contato.nome || contato.telefone || 'lead'}`,
        description: [
          descricao || 'Agendamento criado pelo agente.',
          contato.telefone ? `Telefone: ${contato.telefone}` : null,
          `Conversa: ${ctx.conversaId}`,
        ].filter(Boolean).join('\n'),
        startsAt: inicio,
        durationMinutes: duracao,
      });
      if (eventoTenant) {
        await ctx.q(
          `update agendamentos
           set status='sincronizado', provider='google_calendar_oauth', provider_ref=$2,
               metadata=metadata || $3::jsonb, erro=null, atualizado_em=now()
           where id=$1`,
          [agendamento.id, eventoTenant.id, JSON.stringify({ googleCalendar: eventoTenant })],
        );
        return { ok: true, agendamento: { ...agendamento, status: 'sincronizado', provider_ref: eventoTenant.id }, calendar: eventoTenant };
      }
    } catch (e: any) {
      await ctx.q(
        `update agendamentos
         set status='falha', provider='google_calendar_oauth', erro=$2, atualizado_em=now()
         where id=$1`,
        [agendamento.id, e?.message || 'erro desconhecido'],
      );
      return { ok: false, agendamento, motivo: e?.message || 'erro desconhecido' };
    }

    await ctx.q(
      `update agendamentos
          set status='pendente',
              provider='manual',
              erro='Google Calendar do cliente nao conectado em Integracoes',
              atualizado_em=now()
        where id=$1`,
      [agendamento.id],
    );

    return {
      ok: true,
      agendamento: { ...agendamento, provider: 'manual' },
      calendar: null,
      aviso: 'Google Calendar do cliente nao conectado; agendamento salvo somente na agenda interna da Comunora.',
    };
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

function normalizarDuracao(value: unknown) {
  const n = Number(value || 60);
  if (!Number.isFinite(n)) return 60;
  return Math.min(480, Math.max(15, Math.round(n)));
}

async function consultarDisponibilidade(ctx: ToolCtx, inicio: Date, duracao: number) {
  const fim = new Date(inicio.getTime() + duracao * 60_000);
  if (inicio.getTime() < Date.now() - 60_000) {
    return { available: false, conflitos: [{ tipo: 'passado', inicio: inicio.toISOString(), fim: fim.toISOString() }] };
  }

  const local = await ctx.q(
    `select id, inicio_em,
            coalesce(fim_em, inicio_em + make_interval(mins => greatest(15, duracao_minutos))) as fim_em,
            descricao, status
       from agendamentos
      where tenant_id=$1
        and projeto_id=$2
        and status in ('pendente','sincronizado')
        and tstzrange(inicio_em, coalesce(fim_em, inicio_em + make_interval(mins => greatest(15, duracao_minutos))), '[)')
            && tstzrange($3::timestamptz, $4::timestamptz, '[)')
      order by inicio_em asc
      limit 5`,
    [ctx.tenantId, ctx.projetoId, inicio.toISOString(), fim.toISOString()],
  );
  if (local.rows.length > 0) {
    return {
      available: false,
      conflitos: local.rows.map((row: any) => ({
        tipo: 'agenda_local',
        id: row.id,
        inicio: row.inicio_em,
        fim: row.fim_em,
        descricao: row.descricao,
      })),
    };
  }

  const avisos: string[] = [];
  try {
    const googleTenant = await verificarDisponibilidadeGoogleCalendarTenant(ctx.q, ctx.tenantId, {
      startsAt: inicio,
      durationMinutes: duracao,
    });
    if (googleTenant && !googleTenant.available) {
      return {
        available: false,
        conflitos: googleTenant.busy.map((busy) => ({ tipo: 'google_calendar', inicio: busy.start, fim: busy.end })),
      };
    }
    if (!googleTenant) {
      avisos.push('Google Calendar do cliente nao conectado; disponibilidade validada somente na agenda interna.');
    }
  } catch (e: any) {
    return {
      available: false,
      conflitos: [{ tipo: 'google_calendar_erro', motivo: e?.message || 'falha ao consultar disponibilidade' }],
    };
  }

  return {
    available: true,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    duracao_minutos: duracao,
    avisos,
  };
}

export async function executarTool(ctx: ToolCtx, nome: string, args: any): Promise<unknown> {
  const fn = executores[nome];
  const resultado = fn ? await fn(ctx, args) : { ok: false, motivo: 'tool desconhecida' };
  await logarAcao(ctx.q, ctx.tenantId, ctx.conversaId, nome, args, resultado);
  return resultado;
}
