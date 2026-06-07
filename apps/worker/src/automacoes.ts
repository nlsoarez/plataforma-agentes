import type { QueryFn } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { dispararWebhooks, leadPayload } from './integrations/webhooks';

const driver = criarDriver();

type AutomationCtx = {
  q: QueryFn;
  tenantId: string;
  projetoId: string;
  contatoId: string;
  conversaId?: string;
  phoneNumberId?: string;
};

export async function executarAutomacoes(ctx: AutomationCtx, gatilho: string) {
  const autos = (await ctx.q(
    `select id, nome, condicoes, acoes
     from automacoes
     where ativo=true
       and gatilho=$1
       and (projeto_id is null or projeto_id=$2)`,
    [gatilho, ctx.projetoId],
  )).rows;

  for (const auto of autos) {
    const resultado: any[] = [];
    const acoes = Array.isArray(auto.acoes) ? auto.acoes : [];
    for (const acao of acoes) {
      resultado.push(await executarAcao(ctx, acao));
    }
    await ctx.q(
      `insert into automacao_execucoes (tenant_id, automacao_id, contato_id, conversa_id, resultado)
       values ($1,$2,$3,$4,$5)`,
      [ctx.tenantId, auto.id, ctx.contatoId, ctx.conversaId || null, JSON.stringify({ gatilho, resultado })],
    );
  }
}

async function executarAcao(ctx: AutomationCtx, acao: any) {
  const tipo = acao?.tipo;
  if (tipo === 'tag') {
    await ctx.q(`update contatos set tags = array(select distinct unnest(tags || array[$1]::text[])) where id=$2`, [acao.tag, ctx.contatoId]);
    return { ok: true, tipo, tag: acao.tag };
  }
  if (tipo === 'mover_kanban') {
    await ctx.q(`update contatos set etapa_pipeline=$1 where id=$2`, [acao.etapaId, ctx.contatoId]);
    return { ok: true, tipo, etapaId: acao.etapaId };
  }
  if (tipo === 'pausar_ia') {
    await ctx.q(`update conversas set ia_pausada=true where contato_id=$1 and status='aberta'`, [ctx.contatoId]);
    return { ok: true, tipo };
  }
  if (tipo === 'mensagem' && ctx.phoneNumberId) {
    const contato = (await ctx.q(`select telefone from contatos where id=$1`, [ctx.contatoId])).rows[0];
    if (!contato) return { ok: false, tipo, motivo: 'contato nao encontrado' };
    const sent = await driver.enviarTexto(ctx.phoneNumberId, contato.telefone, acao.texto || '');
    return { ok: true, tipo, messageId: sent.messageId };
  }
  if (tipo === 'webhook') {
    const payload = await leadPayload(ctx.q, ctx.contatoId);
    await dispararWebhooks(ctx.q, ctx.tenantId, acao.evento || 'AUTOMATION_TRIGGERED', payload || {});
    return { ok: true, tipo };
  }
  return { ok: false, tipo, motivo: 'acao desconhecida' };
}
