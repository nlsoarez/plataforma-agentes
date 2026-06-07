import { comTenant, resolverProjetoPorNumero, statusTenant } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { publicar } from '@plataforma/bus';
import {
  upsertContato, acharOuCriarConversa, gravarMensagem,
  carregarAgente, carregarHistorico, logarEventoOperacional,
} from '../repos';
import { rodarAgente } from '../agent/agente';
import { executarAutomacoes } from '../automacoes';
import { dispararWebhooks, leadPayload } from '../integrations/webhooks';

const driver = criarDriver();

export async function tratarMensagemRecebida(ev: {
  phoneNumberId: string; de: string; conteudo: string; metaId: string;
  midia?: { tipo?: string; url?: string; mime?: string; raw?: unknown };
  referral?: { ctwaClid?: string; sourceId?: string };
}) {
  const rota = await resolverProjetoPorNumero(ev.phoneNumberId);
  if (!rota) { console.warn('[rota] projeto ativo nao encontrado para', ev.phoneNumberId); return; }
  const { tenant_id: tenantId, projeto_id: projetoId } = rota;

  if ((await statusTenant(tenantId)) === 'suspended') {
    console.warn('[billing] tenant suspenso, ignorando atendimento', tenantId);
    return;
  }

  await comTenant(tenantId, async (q) => {
    const contato = await upsertContato(q, tenantId, projetoId, ev.de);
    const contatoId = contato.id;
    if (ev.referral?.ctwaClid) {
      await q(`update contatos set ctwa_clid=$1, origem='ctwa' where id=$2`, [ev.referral.ctwaClid, contatoId]);
    }
    const conversa = await acharOuCriarConversa(q, tenantId, projetoId, contatoId);

    await gravarMensagem(q, tenantId, conversa.id, {
      direcao: 'inbound', autor: 'contato', conteudo: ev.conteudo, metaMessageId: ev.metaId, midia: ev.midia,
    });
    await publicar(tenantId, { tipo: 'mensagem', conversaId: conversa.id, autor: 'contato', conteudo: ev.conteudo });
    const payload = await leadPayload(q, contatoId);
    if (contato.criado && payload) await dispararWebhooks(q, tenantId, 'LEAD_CREATED', payload);
    if (payload) await dispararWebhooks(q, tenantId, 'LEAD_INTERACTION', { ...payload, message: { from: ev.de, text: ev.conteudo, direction: 'inbound' } });
    await executarAutomacoes({ q, tenantId, projetoId, conversaId: conversa.id, contatoId, phoneNumberId: ev.phoneNumberId }, contato.criado ? 'lead_criado' : 'mensagem_recebida');

    if (conversa.ia_pausada) return; // humano cuida

    try {
      const agente = await carregarAgente(q, projetoId);
      if (!agente) {
        await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'warn', 'AGENTE_AUSENTE', 'Nenhum agente ativo no projeto', { conversaId: conversa.id });
        console.warn('[agente] nenhum agente ativo no projeto', projetoId);
        return;
      }

      const historico = await carregarHistorico(q, conversa.id);
      const resultado = await rodarAgente({
        agente, historico,
        ctx: { q, tenantId, projetoId, conversaId: conversa.id, contatoId },
      });

      if (resultado.texto) {
        const { messageId } = await driver.enviarTexto(ev.phoneNumberId, ev.de, resultado.texto);
        await gravarMensagem(q, tenantId, conversa.id, {
          direcao: 'outbound', autor: 'ia', conteudo: resultado.texto,
          metaMessageId: messageId, tokensIn: resultado.tokensIn, tokensOut: resultado.tokensOut,
        });
        await publicar(tenantId, { tipo: 'mensagem', conversaId: conversa.id, autor: 'ia', conteudo: resultado.texto });
        const updatedPayload = await leadPayload(q, contatoId);
        if (updatedPayload) await dispararWebhooks(q, tenantId, 'AI_RESPONSE', { ...updatedPayload, message: { text: resultado.texto, direction: 'outbound' } });
      }

      if (resultado.handoff) {
        await publicar(tenantId, { tipo: 'handoff', conversaId: conversa.id });
      }
    } catch (err: any) {
      const message = err?.message || 'Falha ao processar resposta automatica';
      await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'error', 'AI_OR_SEND_FAILED', message, {
        conversaId: conversa.id,
        contatoId,
        phoneNumberId: ev.phoneNumberId,
      });
      await q(`update projetos set last_error=$2, last_error_at=now() where id=$1`, [projetoId, message]);
      await publicar(tenantId, { tipo: 'erro', conversaId: conversa.id, mensagem: message });
      console.error('[worker] falha IA/envio', message);
    }
  });
}
