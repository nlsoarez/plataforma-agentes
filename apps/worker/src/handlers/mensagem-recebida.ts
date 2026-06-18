import { acessoBillingTenant, comTenant, resolverProjetoPorNumero } from '@plataforma/db';
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

type AgentRuntimeControl = {
  status?: string | null;
  horario_ativo?: boolean | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  horario_timezone?: string | null;
};

function minutosHorario(value?: string | null) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutosAgora(timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function agenteDentroDoHorario(agente: AgentRuntimeControl) {
  if (!agente.horario_ativo) return true;
  const inicio = minutosHorario(agente.horario_inicio);
  const fim = minutosHorario(agente.horario_fim);
  if (inicio === null || fim === null) return true;
  const agora = minutosAgora(agente.horario_timezone || 'America/Sao_Paulo');
  if (inicio === fim) return true;
  if (inicio < fim) return agora >= inicio && agora <= fim;
  return agora >= inicio || agora <= fim;
}

export async function tratarMensagemRecebida(ev: {
  phoneNumberId: string; de: string; conteudo: string; metaId: string;
  midia?: { tipo?: string; url?: string; mime?: string; raw?: unknown };
  referral?: { ctwaClid?: string; sourceId?: string };
}) {
  const rota = await resolverProjetoPorNumero(ev.phoneNumberId);
  if (!rota) { console.warn('[rota] projeto ativo nao encontrado para', ev.phoneNumberId); return; }
  const { tenant_id: tenantId, projeto_id: projetoId } = rota;

  const billing = await acessoBillingTenant(tenantId);

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

    if (!billing.canUsePaidFeatures) {
      await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'warn', 'BILLING_RESTRICTED', 'Mensagem recebida, mas recursos pagos bloqueados pela assinatura', {
        conversaId: conversa.id,
        contatoId,
        billingState: billing.state,
      });
      console.warn('[billing] tenant restrito, inbound salvo sem automacao/ia', tenantId, billing.state);
      return;
    }

    const payload = await leadPayload(q, contatoId);
    if (contato.criado && payload) await dispararWebhooks(q, tenantId, 'LEAD_CREATED', payload);
    if (payload) await dispararWebhooks(q, tenantId, 'LEAD_INTERACTION', { ...payload, message: { from: ev.de, text: ev.conteudo, direction: 'inbound' } });
    await executarAutomacoes({ q, tenantId, projetoId, conversaId: conversa.id, contatoId, phoneNumberId: ev.phoneNumberId }, contato.criado ? 'lead_criado' : 'mensagem_recebida');

    if (conversa.ia_pausada) {
      await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'info', 'IA_PAUSADA', 'Mensagem recebida, mas a IA esta pausada nesta conversa', {
        conversaId: conversa.id,
        contatoId,
      });
      return; // humano cuida
    }

    try {
      const agente = await carregarAgente(q, projetoId);
      if (!agente) {
        await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'warn', 'AGENTE_AUSENTE', 'Nenhum agente ativo no projeto', { conversaId: conversa.id });
        console.warn('[agente] nenhum agente ativo no projeto', projetoId);
        return;
      }

      if (agente.status === 'pausado') {
        await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'info', 'AGENTE_PAUSADO', 'Mensagem recebida, mas o agente esta pausado manualmente', {
          conversaId: conversa.id,
          contatoId,
        });
        return;
      }

      if (agente.status === 'inativo') {
        await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'info', 'AGENTE_DESATIVADO', 'Mensagem recebida, mas o agente esta desativado', {
          conversaId: conversa.id,
          contatoId,
        });
        return;
      }

      if (!agenteDentroDoHorario(agente)) {
        await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'info', 'AGENTE_FORA_HORARIO', 'Mensagem recebida fora da janela de funcionamento do agente', {
          conversaId: conversa.id,
          contatoId,
          horario_inicio: agente.horario_inicio,
          horario_fim: agente.horario_fim,
          horario_timezone: agente.horario_timezone || 'America/Sao_Paulo',
        });
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
      } else {
        await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'warn', 'AI_EMPTY_RESPONSE', 'IA processou a mensagem, mas nao retornou texto para envio', {
          conversaId: conversa.id,
          contatoId,
          provider: agente.provider,
          modelo: agente.modelo,
        });
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
