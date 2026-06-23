import type { Queue } from 'bullmq';
import { comTenant, pool } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { logarEventoOperacional } from '../repos';

const driver = criarDriver();
const DEFAULT_TZ = 'America/Sao_Paulo';

type ReportJob = {
  tenantId: string;
  settingId: string;
  dateKey: string;
};

type SettingRow = {
  id: string;
  tenant_id: string;
  projeto_id: string;
  projeto_nome: string;
  phone_number_id: string | null;
  horario: string;
  timezone: string;
  canal: 'whatsapp' | 'email';
  destino: string;
  ultimo_envio_em: string | null;
};

export function iniciarAgendadorRelatorios(queue: Queue) {
  const tick = () => {
    enfileirarRelatoriosPendentes(queue).catch((err) => {
      console.error('[relatorios] falha no agendador', err?.message || err);
    });
  };
  setTimeout(tick, 10_000);
  setInterval(tick, 60_000);
}

async function enfileirarRelatoriosPendentes(queue: Queue) {
  const tenants = await pool.query(`select id from tenants where status <> 'deleted'`);

  for (const tenant of tenants.rows) {
    await comTenant(tenant.id, async (q) => {
      const settings = await q(
        `select s.id, s.tenant_id, s.projeto_id, p.nome as projeto_nome, p.phone_number_id,
                to_char(s.horario, 'HH24:MI') as horario,
                s.timezone, s.canal, s.destino, s.ultimo_envio_em
           from agent_report_settings s
           join projetos p on p.id=s.projeto_id and p.tenant_id=s.tenant_id
          where s.ativo=true
            and s.destino <> ''`,
      );

      for (const setting of settings.rows as SettingRow[]) {
        const timezone = setting.timezone || DEFAULT_TZ;
        const dateKey = dataLocal(new Date(), timezone);
        if (horaLocal(new Date(), timezone) < setting.horario) continue;
        if (setting.ultimo_envio_em && dataLocal(new Date(setting.ultimo_envio_em), timezone) === dateKey) continue;

        await queue.add(
          'enviar',
          { tenantId: setting.tenant_id, settingId: setting.id, dateKey } satisfies ReportJob,
          {
            jobId: `relatorio:${setting.id}:${dateKey}`,
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );
      }
    });
  }
}

export async function tratarRelatorioDiario(job: ReportJob) {
  await comTenant(job.tenantId, async (q) => {
    const setting = (await q(
      `select s.id, s.tenant_id, s.projeto_id, p.nome as projeto_nome, p.phone_number_id,
              s.timezone, s.canal, s.destino, to_char(s.horario, 'HH24:MI') as horario
         from agent_report_settings s
         join projetos p on p.id=s.projeto_id and p.tenant_id=s.tenant_id
        where s.id=$1 and s.tenant_id=$2 and s.ativo=true
        limit 1`,
      [job.settingId, job.tenantId],
    )).rows[0] as SettingRow | undefined;
    if (!setting) return;

    const periodo = (await q(
      `select ($1::date::timestamp at time zone $2) as inicio,
              (($1::date + interval '1 day')::timestamp at time zone $2) as fim`,
      [job.dateKey, setting.timezone || DEFAULT_TZ],
    )).rows[0] as { inicio: Date; fim: Date };

    const resumo = await gerarResumo(q, setting.projeto_id, periodo.inicio, periodo.fim);
    const conteudo = formatarResumo(setting, job.dateKey, resumo);

    const run = (await q(
      `insert into agent_report_runs (
         tenant_id, projeto_id, setting_id, periodo_inicio, periodo_fim, canal, destino, conteudo, status
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,'pendente')
       returning id`,
      [
        setting.tenant_id,
        setting.projeto_id,
        setting.id,
        periodo.inicio,
        periodo.fim,
        setting.canal,
        setting.destino,
        conteudo,
      ],
    )).rows[0];

    try {
      if (setting.canal === 'whatsapp') {
        if (!setting.phone_number_id) throw new Error('Projeto sem instancia WhatsApp para enviar relatorio');
        await driver.enviarTexto(setting.phone_number_id, setting.destino, conteudo);
      } else {
        await enviarEmailRelatorio(setting.destino, `Relatorio diario - ${setting.projeto_nome}`, conteudo);
      }

      await q(
        `update agent_report_runs
            set status='enviado', enviado_em=now(), erro=null
          where id=$1`,
        [run.id],
      );
      await q(
        `update agent_report_settings
            set ultimo_envio_em=now(), ultimo_erro=null, atualizado_em=now()
          where id=$1`,
        [setting.id],
      );
      await logarEventoOperacional(q, setting.tenant_id, setting.projeto_id, 'worker', 'info', 'RELATORIO_DIARIO_ENVIADO', 'Relatorio diario enviado', {
        canal: setting.canal,
        destino: setting.destino,
      });
    } catch (e: any) {
      const message = e?.message || 'falha ao enviar relatorio';
      await q(`update agent_report_runs set status='falha', erro=$2 where id=$1`, [run.id, message]);
      await q(`update agent_report_settings set ultimo_erro=$2, atualizado_em=now() where id=$1`, [setting.id, message]);
      await logarEventoOperacional(q, setting.tenant_id, setting.projeto_id, 'worker', 'error', 'RELATORIO_DIARIO_FALHOU', message, {
        canal: setting.canal,
        destino: setting.destino,
      });
      throw e;
    }
  });
}

async function gerarResumo(q: any, projetoId: string, inicio: Date, fim: Date) {
  const r = await q(
    `select
       (select count(distinct c.id)::int
          from conversas c
          join mensagens m on m.conversa_id=c.id
         where c.projeto_id=$1 and m.criada_em >= $2 and m.criada_em < $3) as conversas,
       (select count(*)::int
          from mensagens m join conversas c on c.id=m.conversa_id
         where c.projeto_id=$1 and m.criada_em >= $2 and m.criada_em < $3 and m.direcao='inbound') as recebidas,
       (select count(*)::int
          from mensagens m join conversas c on c.id=m.conversa_id
         where c.projeto_id=$1 and m.criada_em >= $2 and m.criada_em < $3 and m.direcao='outbound' and m.autor='ia') as respostas_ia,
       (select count(*)::int
          from mensagens m join conversas c on c.id=m.conversa_id
         where c.projeto_id=$1 and m.criada_em >= $2 and m.criada_em < $3 and m.direcao='outbound' and m.autor='humano') as respostas_humano,
       (select count(*)::int
          from contatos
         where projeto_id=$1 and criado_em >= $2 and criado_em < $3) as novos_contatos,
       (select count(*)::int
          from agendamentos
         where projeto_id=$1 and inicio_em >= $2 and inicio_em < $3 and status in ('pendente','sincronizado')) as agendamentos,
       (select count(*)::int
          from acoes_ia a
          join conversas c on c.id=a.conversa_id
         where c.projeto_id=$1 and a.criada_em >= $2 and a.criada_em < $3 and a.funcao='handoff_humano') as handoffs`,
    [projetoId, inicio, fim],
  );
  return r.rows[0] || {};
}

function formatarResumo(setting: SettingRow, dateKey: string, resumo: Record<string, number>) {
  return [
    `Relatorio diario Comunora - ${setting.projeto_nome}`,
    `Data: ${dateKey}`,
    '',
    `Conversas atendidas: ${resumo.conversas || 0}`,
    `Mensagens recebidas: ${resumo.recebidas || 0}`,
    `Respostas da IA: ${resumo.respostas_ia || 0}`,
    `Respostas humanas: ${resumo.respostas_humano || 0}`,
    `Novos contatos: ${resumo.novos_contatos || 0}`,
    `Agendamentos criados: ${resumo.agendamentos || 0}`,
    `Handoffs para humano: ${resumo.handoffs || 0}`,
    '',
    'Este resumo foi gerado automaticamente pela Comunora.',
  ].join('\n');
}

async function enviarEmailRelatorio(to: string, subject: string, text: string) {
  const url = process.env.REPORT_EMAIL_WEBHOOK_URL;
  if (!url) throw new Error('REPORT_EMAIL_WEBHOOK_URL nao configurado para envio por e-mail');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, text }),
  });
  const body = await response.text().catch(() => '');
  if (!response.ok) throw new Error(`Webhook de e-mail ${response.status}: ${body.slice(0, 500)}`);
}

function dataLocal(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function horaLocal(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}
