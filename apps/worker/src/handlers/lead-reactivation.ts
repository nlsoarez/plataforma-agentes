import Redis from 'ioredis';
import type { Queue } from 'bullmq';
import { acessoBillingTenant, comTenant, pool } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { acharOuCriarConversa, gravarMensagem, logarEventoOperacional } from '../repos';
import { atrasoGaussiano, capDiario, dentroDoHorario, msAteProximaJanela } from '../antiban';

const driver = criarDriver();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const DEFAULT_TZ = 'America/Sao_Paulo';

type ScanJob = {
  tenantId: string;
  settingId: string;
  force?: boolean;
};

type SendJob = {
  tenantId: string;
  runId: string;
};

type SettingRow = {
  id: string;
  tenant_id: string;
  projeto_id: string;
  phone_number_id: string;
  dias_inatividade: number;
  horario: string;
  timezone: string;
  limite_diario: number;
  janela_reenvio_dias: number;
  mensagem: string;
  ultimo_envio_em: string | null;
};

export function iniciarAgendadorReativacao(queue: Queue) {
  const tick = () => {
    enfileirarReativacoesPendentes(queue).catch((err) => {
      console.error('[reativacao] falha no agendador', err?.message || err);
    });
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
}

async function enfileirarReativacoesPendentes(queue: Queue) {
  const tenants = await pool.query(`select id from tenants where status <> 'deleted'`);
  for (const tenant of tenants.rows) {
    await comTenant(tenant.id, async (q) => {
      const settings = await q(
        `select s.id, s.tenant_id, s.projeto_id, p.phone_number_id,
                s.dias_inatividade, to_char(s.horario, 'HH24:MI') as horario,
                s.timezone, s.limite_diario, s.janela_reenvio_dias, s.mensagem, s.ultimo_envio_em
           from lead_reactivation_settings s
           join projetos p on p.id=s.projeto_id and p.tenant_id=s.tenant_id
          where s.ativo=true
            and p.phone_number_id is not null`,
      );

      for (const setting of settings.rows as SettingRow[]) {
        const timezone = setting.timezone || DEFAULT_TZ;
        const dateKey = dataLocal(new Date(), timezone);
        if (horaLocal(new Date(), timezone) < setting.horario) continue;
        if (setting.ultimo_envio_em && dataLocal(new Date(setting.ultimo_envio_em), timezone) === dateKey) continue;
        await queue.add(
          'scan',
          { tenantId: setting.tenant_id, settingId: setting.id } satisfies ScanJob,
          { jobId: `lead-reactivation-scan:${setting.id}:${dateKey}`, removeOnComplete: 100, removeOnFail: 200 },
        );
      }
    });
  }
}

export async function tratarScanReativacao(job: ScanJob, queue: Queue) {
  const billing = await acessoBillingTenant(job.tenantId);
  if (!billing.canUsePaidFeatures) return;

  await comTenant(job.tenantId, async (q) => {
    const setting = (await q(
      `select s.id, s.tenant_id, s.projeto_id, p.phone_number_id,
              s.dias_inatividade, s.limite_diario, s.janela_reenvio_dias, s.mensagem
         from lead_reactivation_settings s
         join projetos p on p.id=s.projeto_id and p.tenant_id=s.tenant_id
        where s.id=$1 and s.tenant_id=$2 and (s.ativo=true or $3::boolean=true)
        limit 1`,
      [job.settingId, job.tenantId, Boolean(job.force)],
    )).rows[0] as SettingRow | undefined;
    if (!setting?.phone_number_id) return;

    const sentToday = (await q(
      `select count(*)::int as n
         from lead_reactivation_runs
        where tenant_id=$1
          and projeto_id=$2
          and criado_em::date = now()::date
          and status in ('pendente','enviado')`,
      [setting.tenant_id, setting.projeto_id],
    )).rows[0]?.n || 0;
    const remaining = job.force ? 1 : Math.max(0, Number(setting.limite_diario || 30) - Number(sentToday));
    if (remaining <= 0) return;

    const leads = await q(
      `select c.id, c.nome, c.telefone
         from contatos c
        where c.tenant_id=$1
          and c.projeto_id=$2
          and c.telefone is not null
          and coalesce(c.ultima_interacao, c.criado_em) <= now() - make_interval(days => $3::int)
          and not exists (
            select 1
              from lead_reactivation_runs r
             where r.contato_id=c.id
               and r.criado_em >= now() - make_interval(days => $4::int)
               and r.status in ('pendente','enviado')
          )
        order by coalesce(c.ultima_interacao, c.criado_em) asc
        limit $5`,
      [setting.tenant_id, setting.projeto_id, setting.dias_inatividade || 60, setting.janela_reenvio_dias || 30, remaining],
    );

    for (const lead of leads.rows) {
      const message = renderizarMensagem(setting.mensagem, lead);
      const run = await q(
        `insert into lead_reactivation_runs (
           tenant_id, projeto_id, setting_id, contato_id, phone_number_id, message
         )
         values ($1,$2,$3,$4,$5,$6)
         returning id`,
        [setting.tenant_id, setting.projeto_id, setting.id, lead.id, setting.phone_number_id, message],
      );
      await queue.add(
        'enviar',
        { tenantId: setting.tenant_id, runId: run.rows[0].id } satisfies SendJob,
        { jobId: `lead-reactivation-send:${run.rows[0].id}`, removeOnComplete: 200, removeOnFail: 300 },
      );
    }

    await q(
      `update lead_reactivation_settings
          set ultimo_envio_em=now(), ultimo_erro=null, atualizado_em=now()
        where id=$1`,
      [setting.id],
    );
  });
}

export async function tratarEnvioReativacao(job: SendJob, queue: Queue) {
  const billing = await acessoBillingTenant(job.tenantId);
  if (!billing.canUsePaidFeatures) return;

  await comTenant(job.tenantId, async (q) => {
    const row = (await q(
      `select r.id, r.tenant_id, r.projeto_id, r.contato_id, r.phone_number_id, r.message, r.status,
              c.telefone
         from lead_reactivation_runs r
         join contatos c on c.id=r.contato_id
        where r.id=$1 and r.tenant_id=$2
        limit 1`,
      [job.runId, job.tenantId],
    )).rows[0];
    if (!row || row.status === 'enviado') return;

    if (!dentroDoHorario()) {
      await queue.add('enviar', job, { delay: msAteProximaJanela(), removeOnComplete: 200, removeOnFail: 300 });
      return;
    }

    const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const chave = `warmup:${row.phone_number_id}:${hoje}`;
    const enviadosHoje = parseInt((await redis.get(chave)) ?? '0', 10);
    const cap = capDiario(await idadeInstancia(row.tenant_id, row.phone_number_id));
    if (enviadosHoje >= cap) {
      await queue.add('enviar', job, { delay: msAteProximaJanela(1), removeOnComplete: 200, removeOnFail: 300 });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, atrasoGaussiano()));

    try {
      const sent = await driver.enviarTexto(row.phone_number_id, row.telefone, row.message);
      await redis.multi().incr(chave).expire(chave, 172800).exec();
      const conversa = await acharOuCriarConversa(q, row.tenant_id, row.projeto_id, row.contato_id);
      await gravarMensagem(q, row.tenant_id, conversa.id, {
        direcao: 'outbound',
        autor: 'sistema',
        conteudo: row.message,
        metaMessageId: sent.messageId,
      });
      await q(
        `update lead_reactivation_runs
            set status='enviado', sent_at=now(), error=null, atualizado_em=now()
          where id=$1`,
        [row.id],
      );
      await logarEventoOperacional(q, row.tenant_id, row.projeto_id, 'worker', 'info', 'LEAD_REATIVADO', 'Mensagem de reativacao enviada', {
        contatoId: row.contato_id,
      });
    } catch (e: any) {
      const message = e?.message || 'falha ao enviar reativacao';
      await q(`update lead_reactivation_runs set status='falha', error=$2, atualizado_em=now() where id=$1`, [row.id, message]);
      await logarEventoOperacional(q, row.tenant_id, row.projeto_id, 'worker', 'error', 'LEAD_REATIVACAO_FALHOU', message, {
        contatoId: row.contato_id,
      });
      throw e;
    }
  });
}

function renderizarMensagem(template: string, lead: { nome?: string | null; telefone: string }) {
  const nome = lead.nome || lead.telefone || 'tudo bem';
  return String(template || '').replaceAll('{{nome}}', nome);
}

async function idadeInstancia(tenantId: string, instancia: string): Promise<number> {
  return comTenant(tenantId, async (q) => {
    const r = await q(`select criado_em from projetos where phone_number_id=$1`, [instancia]);
    if (!r.rows[0]) return 0;
    return Math.floor((Date.now() - new Date(r.rows[0].criado_em).getTime()) / 86400000);
  });
}

function dataLocal(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')?.value || '1970'}-${parts.find((p) => p.type === 'month')?.value || '01'}-${parts.find((p) => p.type === 'day')?.value || '01'}`;
}

function horaLocal(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return `${parts.find((p) => p.type === 'hour')?.value || '00'}:${parts.find((p) => p.type === 'minute')?.value || '00'}`;
}
