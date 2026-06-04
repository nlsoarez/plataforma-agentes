import type { QueryFn } from '@plataforma/db';
import { logarAcao } from '../repos';
import { publicar } from '@plataforma/bus';

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
] as const;

type Executor = (ctx: ToolCtx, args: any) => Promise<unknown>;

const executores: Record<string, Executor> = {
  async mover_card(ctx, { etapa }) {
    const r = await ctx.q(`select id from etapas_pipeline where projeto_id=$1 and lower(nome)=lower($2) limit 1`, [ctx.projetoId, etapa]);
    if (!r.rows[0]) return { ok: false, motivo: 'etapa nao encontrada' };
    await ctx.q(`update contatos set etapa_pipeline=$1 where id=$2`, [r.rows[0].id, ctx.contatoId]);
    await publicar(ctx.tenantId, { tipo: 'card', contatoId: ctx.contatoId, etapaId: r.rows[0].id });
    return { ok: true, etapa };
  },
  async taguear(ctx, { tags }) {
    await ctx.q(
      `update contatos set tags = array(select distinct unnest(tags || $1::text[])) where id=$2`,
      [tags, ctx.contatoId],
    );
    return { ok: true, tags };
  },
  async agendar(_ctx, { datetime, descricao }) {
    // TODO: integrar Google Calendar via MCP. Por ora registra a intencao.
    return { ok: true, agendado: datetime, descricao: descricao ?? null, nota: 'integracao Calendar pendente' };
  },
  async consultar_base(_ctx, { consulta }) {
    // TODO: RAG real (embeddings + base de conhecimento). Stub honesto por enquanto.
    return { ok: true, consulta, resultado: 'base de conhecimento ainda nao indexada' };
  },
  async handoff_humano(ctx, { motivo }) {
    await ctx.q(`update conversas set ia_pausada=true, status='aguardando' where id=$1`, [ctx.conversaId]);
    ctx.handoff = true;
    // TODO: notificar o departamento via pub/sub pro inbox ao vivo.
    return { ok: true, motivo };
  },
};

export async function executarTool(ctx: ToolCtx, nome: string, args: any): Promise<unknown> {
  const fn = executores[nome];
  const resultado = fn ? await fn(ctx, args) : { ok: false, motivo: 'tool desconhecida' };
  await logarAcao(ctx.q, ctx.tenantId, ctx.conversaId, nome, args, resultado);
  return resultado;
}
