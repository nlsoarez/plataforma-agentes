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
import { excluirEventoGoogleCalendarTenant } from '../integrations/google-calendar';

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

    if (detectarOptOut(ev.conteudo)) {
      await q(
        `update contatos
            set opt_out_whatsapp=true,
                opt_out_reason='keyword',
                opt_out_at=coalesce(opt_out_at, now())
          where id=$1`,
        [contatoId],
      );
      await enviarRespostaSistema(q, {
        tenantId,
        projetoId,
        conversaId: conversa.id,
        phoneNumberId: ev.phoneNumberId,
        telefone: ev.de,
      }, 'Tudo certo. Voce nao recebera novas mensagens automaticas por este WhatsApp.');
      await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'info', 'WHATSAPP_OPT_OUT', 'Contato solicitou parar mensagens automaticas', {
        conversaId: conversa.id,
        contatoId,
      });
      return;
    }

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

    if (await tratarRespostaAgendamento(q, {
      tenantId,
      projetoId,
      conversaId: conversa.id,
      contatoId,
      phoneNumberId: ev.phoneNumberId,
      telefone: ev.de,
      conteudo: ev.conteudo,
    })) {
      return;
    }

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

      if (!String(ev.conteudo || '').trim()) {
        await logarEventoOperacional(q, tenantId, projetoId, 'worker', 'info', 'AGENTE_MENSAGEM_SEM_TEXTO', 'Mensagem recebida sem texto; IA nao foi acionada', {
          conversaId: conversa.id,
          contatoId,
          midia: ev.midia?.tipo || null,
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

function detectarOptOut(texto: string | undefined) {
  const normalized = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!normalized) return false;
  const exact = ['sair', 'parar', 'stop', 'unsubscribe', 'remover'];
  if (exact.includes(normalized)) return true;
  return [
    'nao quero receber',
    'nao desejo receber',
    'pare de enviar',
    'remova meu contato',
    'cancelar mensagens',
  ].some((pattern) => normalized.includes(pattern));
}

async function tratarRespostaAgendamento(q: any, ctx: {
  tenantId: string;
  projetoId: string;
  conversaId: string;
  contatoId: string;
  phoneNumberId: string;
  telefone: string;
  conteudo: string;
}) {
  const resposta = String(ctx.conteudo || '').trim();
  if (!['1', '2', '3'].includes(resposta)) return false;

  const agendamento = (await q(
    `select id, inicio_em, provider_ref
       from agendamentos
      where tenant_id=$1
        and projeto_id=$2
        and contato_id=$3
        and status in ('pendente','sincronizado')
        and confirmation_status='aguardando'
        and inicio_em > now()
      order by inicio_em asc
      limit 1`,
    [ctx.tenantId, ctx.projetoId, ctx.contatoId],
  )).rows[0];
  if (!agendamento) return false;

  if (resposta === '1') {
    await q(
      `update agendamentos
          set confirmation_status='confirmado',
              confirmed_at=now(),
              atualizado_em=now()
        where id=$1`,
      [agendamento.id],
    );
    await enviarRespostaSistema(q, ctx, 'Perfeito, seu horario esta confirmado. Obrigado!');
    await logarEventoOperacional(q, ctx.tenantId, ctx.projetoId, 'worker', 'info', 'AGENDAMENTO_CONFIRMADO', 'Agendamento confirmado pelo WhatsApp', {
      agendamentoId: agendamento.id,
      contatoId: ctx.contatoId,
    });
    return true;
  }

  if (resposta === '2') {
    await q(
      `update agendamentos
          set confirmation_status='remarcando',
              reschedule_requested_at=now(),
              atualizado_em=now()
        where id=$1`,
      [agendamento.id],
    );
    await enviarRespostaSistema(q, ctx, 'Sem problema. Me diga o melhor dia e horario para remarcar, que vou verificar a disponibilidade.');
    await logarEventoOperacional(q, ctx.tenantId, ctx.projetoId, 'worker', 'info', 'AGENDAMENTO_REMARCACAO_SOLICITADA', 'Cliente solicitou remarcacao pelo WhatsApp', {
      agendamentoId: agendamento.id,
      contatoId: ctx.contatoId,
    });
    return true;
  }

  const sync = await excluirEventoGoogleCalendarTenant(q, ctx.tenantId, agendamento.provider_ref);
  await q(
    `update agendamentos
        set status='cancelado',
            confirmation_status='cancelado',
            reminder_status=case when reminder_status='enviado' then reminder_status else 'dispensado' end,
            cancelled_at=now(),
            erro=case when $2::text is null then null else $2 end,
            atualizado_em=now()
      where id=$1`,
    [agendamento.id, sync.ok ? null : sync.error || 'falha ao cancelar evento externo'],
  );
  await enviarRespostaSistema(q, ctx, 'Tudo certo, seu horario foi cancelado. Se quiser reagendar, me envie uma nova data e horario.');
  await logarEventoOperacional(q, ctx.tenantId, ctx.projetoId, 'worker', sync.ok ? 'info' : 'warn', 'AGENDAMENTO_CANCELADO', 'Agendamento cancelado pelo WhatsApp', {
    agendamentoId: agendamento.id,
    contatoId: ctx.contatoId,
    calendarSync: sync,
  });
  return true;
}

async function enviarRespostaSistema(q: any, ctx: {
  tenantId: string;
  projetoId: string;
  conversaId: string;
  phoneNumberId: string;
  telefone: string;
}, texto: string) {
  const sent = await driver.enviarTexto(ctx.phoneNumberId, ctx.telefone, texto);
  await gravarMensagem(q, ctx.tenantId, ctx.conversaId, {
    direcao: 'outbound',
    autor: 'sistema',
    conteudo: texto,
    metaMessageId: sent.messageId,
  });
  await publicar(ctx.tenantId, { tipo: 'mensagem', conversaId: ctx.conversaId, autor: 'sistema', conteudo: texto });
}
