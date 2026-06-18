import { HttpException, HttpStatus } from '@nestjs/common';
import { comTenant, pool } from '@plataforma/db';

export type AccessState =
  | 'active'
  | 'trialing'
  | 'past_due_grace'
  | 'past_due_restricted'
  | 'canceled'
  | 'needs_subscription';

export type SubscriptionAccess = {
  state: AccessState;
  canUsePaidFeatures: boolean;
  canWrite: boolean;
  subscription: any | null;
  plan: any | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
};

export class PlanLimitException extends HttpException {
  constructor(params: {
    feature: string;
    message: string;
    current?: number;
    limit?: number | null;
    recommendedPlan?: string | null;
  }) {
    super(
      {
        error: {
          code: 'PLAN_LIMIT_REACHED',
          message: params.message,
          feature: params.feature,
          current: params.current,
          limit: params.limit,
          upgrade_required: true,
          recommended_plan: params.recommendedPlan ?? null,
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

const ACTIVE_STATUSES = new Set(['ativa', 'active']);
const TRIAL_STATUSES = new Set(['trialing', 'trial']);
const PAST_DUE_STATUSES = new Set(['inadimplente', 'past_due', 'overdue']);
const CANCELED_STATUSES = new Set(['cancelada', 'canceled', 'cancelled']);

export async function ensureTrialSubscription(tenantId: string): Promise<void> {
  const trialDays = Number(process.env.BILLING_TRIAL_DAYS || 0);
  if (!Number.isFinite(trialDays) || trialDays <= 0) return;

  await comTenant(tenantId, async (q) => {
    const exists = (await q(`select 1 from assinaturas where tenant_id=$1 limit 1`, [tenantId])).rowCount > 0;
    if (exists) return;

    const plan = (await q(`select id from planos where code='pro' limit 1`)).rows[0];
    if (!plan?.id) return;

    const qtd = (await q(`select count(*)::int as n from projetos where status='ativo'`)).rows[0]?.n ?? 0;
    await q(
      `insert into assinaturas
        (tenant_id, plano_id, provider, status, qtd_projetos, billing_cycle,
         trial_started_at, trial_ends_at, current_period_started_at, current_period_ends_at,
         migration_origin, metadata)
       values ($1,$2,'trial','trialing',$3,'monthly',now(),now() + ($4::int * interval '1 day'),
               now(),now() + ($4::int * interval '1 day'),'signup_trial',
               jsonb_build_object('created_by','ensureTrialSubscription'))`,
      [tenantId, plan.id, Math.max(qtd, 1), trialDays],
    );
  });
}

export async function getSubscriptionAccess(tenantId: string): Promise<SubscriptionAccess> {
  return comTenant(tenantId, async (q) => {
    const row = (await q(
      `select a.*, p.code as plan_code, p.nome as plan_name, p.monthly_price_cents,
              p.annual_price_cents, p.currency
         from assinaturas a
         left join planos p on p.id = a.plano_id
        where a.tenant_id=$1
        order by case
          when lower(a.status) in ('ativa','active','trialing','trial') then 0
          when lower(a.status) in ('inadimplente','past_due','overdue') then 1
          when lower(a.status) in ('pendente','pending','pending_payment') then 2
          else 3
        end,
        a.criado_em desc
        limit 1`,
      [tenantId],
    )).rows[0] ?? null;

    if (!row) return emptyAccess('needs_subscription');

    const now = Date.now();
    const status = String(row.status || '').toLowerCase();
    const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
    const graceEndsAt = row.grace_period_ends_at ? new Date(row.grace_period_ends_at).getTime() : 0;
    const plan = row.plan_code ? {
      id: row.plano_id,
      code: row.plan_code,
      name: row.plan_name,
      monthlyPriceCents: row.monthly_price_cents,
      annualPriceCents: row.annual_price_cents,
      currency: row.currency,
    } : null;

    if (ACTIVE_STATUSES.has(status)) {
      return access('active', true, true, row, plan);
    }

    if (trialAccessEnabled() && TRIAL_STATUSES.has(status) && (!trialEndsAt || trialEndsAt >= now)) {
      return access('trialing', true, true, row, plan);
    }

    if (PAST_DUE_STATUSES.has(status) && graceEndsAt >= now) {
      return access('past_due_grace', true, true, row, plan);
    }

    if (PAST_DUE_STATUSES.has(status) || (TRIAL_STATUSES.has(status) && trialEndsAt && trialEndsAt < now)) {
      return access('past_due_restricted', false, false, row, plan);
    }

    if (CANCELED_STATUSES.has(status)) {
      return access('canceled', false, false, row, plan);
    }

    return access('needs_subscription', false, false, row, plan);
  });
}

function trialAccessEnabled(): boolean {
  const trialDays = Number(process.env.BILLING_TRIAL_DAYS || 0);
  return Number.isFinite(trialDays) && trialDays > 0;
}

export async function listPlansWithEntitlements(): Promise<any[]> {
  const plans = await pool.query(
    `select id, code, nome, description, monthly_price_cents, annual_price_cents,
            currency, display_order, metadata
       from planos
      where is_public = true and is_active = true
      order by display_order, monthly_price_cents`,
  );
  const ent = await pool.query(
    `select p.code as plan_code, e.feature_key, e.enabled, e.limit_value, e.limit_period, e.metadata
       from plan_entitlements e
       join planos p on p.id = e.plan_id
      where p.is_public = true and p.is_active = true
      order by p.display_order, e.feature_key`,
  );

  const byPlan = new Map<string, any[]>();
  for (const row of ent.rows) {
    const arr = byPlan.get(row.plan_code) ?? [];
    arr.push({
      key: row.feature_key,
      enabled: row.enabled,
      limit: row.limit_value === null ? null : Number(row.limit_value),
      period: row.limit_period,
      metadata: row.metadata ?? {},
    });
    byPlan.set(row.plan_code, arr);
  }

  return plans.rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.nome,
    description: p.description,
    monthlyPriceCents: p.monthly_price_cents,
    annualPriceCents: p.annual_price_cents,
    currency: p.currency,
    displayOrder: p.display_order,
    metadata: p.metadata ?? {},
    entitlements: byPlan.get(p.code) ?? [],
  }));
}

export async function getEffectiveEntitlement(tenantId: string, featureKey: string): Promise<{
  enabled: boolean;
  limit: number | null;
  period: string | null;
}> {
  return comTenant(tenantId, async (q) => {
    const row = (await q(
      `with current_subscription as (
         select a.id, a.plano_id
          from assinaturas a
          where a.tenant_id=$1
          order by case
            when lower(a.status) in ('ativa','active','trialing','trial') then 0
            when lower(a.status) in ('inadimplente','past_due','overdue') then 1
            when lower(a.status) in ('pendente','pending','pending_payment') then 2
            else 3
          end,
          a.criado_em desc
          limit 1
       ),
       base as (
         select e.enabled, e.limit_value, e.limit_period
           from current_subscription cs
           join plan_entitlements e on e.plan_id = cs.plano_id
          where e.feature_key=$2
          limit 1
       ),
       extras as (
         select coalesce(sum(sa.quantity * ad.entitlement_increment),0)::bigint as inc
           from current_subscription cs
           join subscription_addons sa on sa.subscription_id = cs.id and sa.status='active'
           join addons ad on ad.code = sa.addon_code and ad.active = true
          where ad.entitlement_key=$2
       )
       select coalesce(base.enabled,false) as enabled,
              case when base.limit_value is null then null else base.limit_value + extras.inc end as limit_value,
              base.limit_period
         from base, extras`,
      [tenantId, featureKey],
    )).rows[0];

    if (!row) return { enabled: false, limit: 0, period: null };
    return {
      enabled: row.enabled,
      limit: row.limit_value === null ? null : Number(row.limit_value),
      period: row.limit_period ?? null,
    };
  });
}

export async function assertFeature(tenantId: string, featureKey: string): Promise<void> {
  const access = await getSubscriptionAccess(tenantId);
  if (!access.canUsePaidFeatures) {
    throw new PlanLimitException({
      feature: featureKey,
      message: 'Assinatura inativa ou fora do periodo de tolerancia.',
    });
  }
  const ent = await getEffectiveEntitlement(tenantId, featureKey);
  if (!ent.enabled) {
    throw new PlanLimitException({
      feature: featureKey,
      message: 'Recurso indisponivel no plano atual.',
      limit: ent.limit,
      recommendedPlan: await recommendPlan(featureKey, 1),
    });
  }
}

export async function assertLimit(tenantId: string, featureKey: string, increment = 1): Promise<void> {
  await assertFeature(tenantId, featureKey);
  const ent = await getEffectiveEntitlement(tenantId, featureKey);
  if (ent.limit === null) return;

  const current = featureKey === 'knowledge_document_size_bytes'
    ? 0
    : await usageForFeature(tenantId, featureKey);

  if (current + increment > ent.limit) {
    throw new PlanLimitException({
      feature: featureKey,
      message: 'Limite do plano atingido.',
      current,
      limit: ent.limit,
      recommendedPlan: await recommendPlan(featureKey, current + increment),
    });
  }
}

export async function usageForFeature(tenantId: string, featureKey: string): Promise<number> {
  return comTenant(tenantId, async (q) => {
    const sql = usageSql(featureKey);
    if (sql) return Number((await q(sql)).rows[0]?.n ?? 0);

    if (featureKey === 'campaigns_monthly' || featureKey === 'campaign_recipients_monthly') {
      const row = (await q(
        `select coalesce(current_value,0)::bigint as n
           from usage_counters
          where metric_key=$1
            and now() >= period_start
            and now() < period_end
          limit 1`,
        [featureKey],
      )).rows[0];
      return Number(row?.n ?? 0);
    }

    return 0;
  });
}

export async function incrementUsage(tenantId: string, metricKey: string, amount: number): Promise<void> {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await comTenant(tenantId, async (q) => {
    await q(
      `insert into usage_counters (tenant_id, metric_key, period_start, period_end, current_value)
       values ($1,$2,$3,$4,$5)
       on conflict (tenant_id, metric_key, period_start, period_end)
       do update set current_value = usage_counters.current_value + excluded.current_value,
                     updated_at = now()`,
      [tenantId, metricKey, periodStart.toISOString(), periodEnd.toISOString(), amount],
    );
  });
}

async function recommendPlan(featureKey: string, requiredValue: number): Promise<string | null> {
  const row = (await pool.query(
    `select p.code
       from planos p
       join plan_entitlements e on e.plan_id = p.id
      where p.is_public = true
        and p.is_active = true
        and e.feature_key=$1
        and e.enabled = true
        and (e.limit_value is null or e.limit_value >= $2)
      order by p.display_order
      limit 1`,
    [featureKey, requiredValue],
  )).rows[0];
  return row?.code ?? null;
}

function usageSql(featureKey: string): string | null {
  switch (featureKey) {
    case 'projects':
      return `select count(*)::int as n from projetos where status <> 'inativo'`;
    case 'whatsapp_connections':
      return `select count(*)::int as n from projetos where status <> 'inativo' and phone_number_id is not null`;
    case 'team_users':
      return `select count(*)::int as n from usuarios where coalesce(status,'ativo')='ativo'`;
    case 'ai_agents':
      return `select count(*)::int as n from agentes where status in ('ativo','pausado')`;
    case 'contacts':
      return `select count(*)::int as n from contatos`;
    case 'pipelines':
      return `select count(distinct projeto_id)::int as n from etapas_pipeline`;
    case 'knowledge_documents':
      return `select count(*)::int as n from knowledge_documents where status='ativo'`;
    case 'storage_bytes':
      return `select coalesce(sum(octet_length(conteudo)),0)::bigint as n from knowledge_documents where status='ativo'`;
    case 'active_automations':
      return `select count(*)::int as n from automacoes where ativo=true`;
    case 'public_api_keys':
      return `select count(*)::int as n from api_keys where ativo=true`;
    case 'outbound_webhooks':
      return `select count(*)::int as n from webhook_subscriptions where ativo=true`;
    default:
      return null;
  }
}

function emptyAccess(state: AccessState): SubscriptionAccess {
  return {
    state,
    canUsePaidFeatures: false,
    canWrite: false,
    subscription: null,
    plan: null,
    trialEndsAt: null,
    graceEndsAt: null,
  };
}

function access(
  state: AccessState,
  canUsePaidFeatures: boolean,
  canWrite: boolean,
  row: any,
  plan: any,
): SubscriptionAccess {
  return {
    state,
    canUsePaidFeatures,
    canWrite,
    subscription: row,
    plan,
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
    graceEndsAt: row.grace_period_ends_at ? new Date(row.grace_period_ends_at).toISOString() : null,
  };
}
