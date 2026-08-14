import type { Queue } from 'bullmq';
import { comTenant, pool } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { acharOuCriarConversa, gravarMensagem, logarEventoOperacional } from '../repos';

const driver = criarDriver();
const DEFAULT_TZ = 'America/Sao_Paulo';

type ReminderJob = {
  tenantId: string;
  reminderId: string;
};

type DueRow = {
  tenant_id: string;
  projeto_id: string;
  agendamento_id: string;
  contato_id: string;
  telefone: string;
  nome: string | null;
  phone_number_id: string;
  inicio_em: string;
  mensagem: string;
  timezone: string;
  horario_inicio: string;
  horario_fim: string;
};

export function iniciarAgendadorLembretes(queue: Queue) {
  const tick = () => {
    enfileirarLembretesPendentes(queue).catch((err) => {
      console.error('[lembretes] falha no agendador', err?.message || err);
    });
  };
  setTimeout(tick, 12_000);
  setInterval(tick, 60_000);
}

async function enfileirarLembretesPendentes(queue: Queue) {
  const tenants = await pool.query(`select id from tenants where status <> 'deleted'`);
  for (const tenant of tenants.rows) {
    await comTenant(tenant.id, async (q) => {
      const due = await q(
        `select s.tenant_id, s.projeto_id, a.id as agendamento_id, a.contato_id,
                c.telefone, c.nome, p.phone_number_id, a.inicio_em, s.mensagem, s.timezone,
                to_char(s.horario_inicio, 'HH24:MI') as horario_inicio,
                to_char(s.horario_fim, 'HH24:MI') as horario_fim
           from appointment_reminder_settings s
           join projetos p on p.id=s.projeto_id and p.tenant_id=s.tenant_id
           join agendamentos a on a.projeto_id=s.projeto_id and a.tenant_id=s.tenant_id
           join contatos c on c.id=a.contato_id and c.tenant_id=s.tenant_id
          where s.ativo=true
            and p.phone_number_id is not null
            and a.status in ('pendente','sincronizado')
            and a.confirmation_status in ('pendente','aguardando')
            and a.reminder_status in ('pendente','falha')
            and a.inicio_em > now()
            and now() >= a.inicio_em - make_interval(hours => s.antecedencia_horas)
            and not exists (
              select 1 from appointment_reminders r
               where r.agendamento_id=a.id
                 and r.status='enviado'
            )
          order by a.inicio_em asc
          limit 100`,
      );

      for (const item of due.rows as DueRow[]) {
        if (!dentroJanela(item.timezone || DEFAULT_TZ, item)) continue;
        const message = renderizarMensagem(item.mensagem, item);
        const inserted = await q(
          `insert into appointment_reminders (
             tenant_id, projeto_id, agendamento_id, contato_id, phone_number_id, scheduled_for, message
           )
           values ($1,$2,$3,$4,$5,now(),$6)
           on conflict (agendamento_id) do update
             set phone_number_id=excluded.phone_number_id,
                 message=excluded.message,
                 atualizado_em=now()
           returning id`,
          [item.tenant_id, item.projeto_id, item.agendamento_id, item.contato_id, item.phone_number_id, message],
        );
        const reminderId = inserted.rows[0]?.id;
        if (!reminderId) continue;

        await q(
          `update agendamentos
              set reminder_status='pendente',
                  confirmation_status='aguardando',
                  atualizado_em=now()
            where id=$1`,
          [item.agendamento_id],
        );
        await queue.add(
          'enviar',
          { tenantId: item.tenant_id, reminderId } satisfies ReminderJob,
          { jobId: `appointment-reminder:${reminderId}`, removeOnComplete: 200, removeOnFail: 300 },
        );
      }
    });
  }
}

export async function tratarLembreteAgendamento(job: ReminderJob) {
  await comTenant(job.tenantId, async (q) => {
    const row = (await q(
      `select r.id, r.tenant_id, r.projeto_id, r.agendamento_id, r.contato_id,
              r.phone_number_id, r.message, r.status,
              c.telefone
         from appointment_reminders r
         join contatos c on c.id=r.contato_id
        where r.id=$1 and r.tenant_id=$2
        limit 1`,
      [job.reminderId, job.tenantId],
    )).rows[0];
    if (!row || row.status === 'enviado') return;

    try {
      const sent = await driver.enviarTexto(row.phone_number_id, row.telefone, row.message);
      const conversa = await acharOuCriarConversa(q, row.tenant_id, row.projeto_id, row.contato_id);
      await gravarMensagem(q, row.tenant_id, conversa.id, {
        direcao: 'outbound',
        autor: 'sistema',
        conteudo: row.message,
        metaMessageId: sent.messageId,
      });
      await q(
        `update appointment_reminders
            set status='enviado', sent_at=now(), error=null, atualizado_em=now()
          where id=$1`,
        [row.id],
      );
      await q(
        `update agendamentos
            set reminder_status='enviado',
                confirmation_status='aguardando',
                atualizado_em=now()
          where id=$1`,
        [row.agendamento_id],
      );
      await logarEventoOperacional(q, row.tenant_id, row.projeto_id, 'worker', 'info', 'LEMBRETE_AGENDA_ENVIADO', 'Lembrete de agenda enviado', {
        agendamentoId: row.agendamento_id,
        contatoId: row.contato_id,
      });
    } catch (e: any) {
      const message = e?.message || 'falha ao enviar lembrete';
      await q(
        `update appointment_reminders
            set status='falha', error=$2, atualizado_em=now()
          where id=$1`,
        [row.id, message],
      );
      await q(`update agendamentos set reminder_status='falha', atualizado_em=now() where id=$1`, [row.agendamento_id]);
      await logarEventoOperacional(q, row.tenant_id, row.projeto_id, 'worker', 'error', 'LEMBRETE_AGENDA_FALHOU', message, {
        agendamentoId: row.agendamento_id,
        contatoId: row.contato_id,
      });
      throw e;
    }
  });
}

function renderizarMensagem(template: string, row: DueRow) {
  const date = new Date(row.inicio_em);
  const timezone = row.timezone || DEFAULT_TZ;
  const data = date.toLocaleDateString('pt-BR', { timeZone: timezone });
  const hora = date.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const nome = row.nome || 'tudo bem';
  return String(template || '')
    .replaceAll('{{data}}', data)
    .replaceAll('{{hora}}', hora)
    .replaceAll('{{nome}}', nome);
}

function dentroJanela(timeZone: string, row: any) {
  const inicio = minutosHorario(row.horario_inicio || '09:00');
  const fim = minutosHorario(row.horario_fim || '18:00');
  const agora = minutosAgora(timeZone);
  if (inicio === fim) return true;
  if (inicio < fim) return agora >= inicio && agora <= fim;
  return agora >= inicio || agora <= fim;
}

function minutosHorario(value: string) {
  const [hh, mm] = String(value || '00:00').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function minutosAgora(timeZone: string) {
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
