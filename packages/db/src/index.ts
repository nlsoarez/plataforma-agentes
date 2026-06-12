import { Pool } from 'pg';
import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';

// Carrega o .env da raiz do monorepo. Chame ANTES de qualquer query.
// (Em produção, as env vars vêm da plataforma e isto vira no-op.)
export function carregarEnv(): void {
  dotenvConfig({ path: join(__dirname, '..', '..', '..', '.env') });
}

// Pool PREGUIÇOSO: só cria a conexão (lendo DATABASE_URL) no primeiro uso,
// garantindo que o .env já foi carregado. Bancos hospedados (Neon) exigem SSL.
let _pool: Pool | null = null;
function init(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL ?? '';
  const ssl = /sslmode=require/.test(url) || process.env.PGSSL === 'true'
    ? { rejectUnauthorized: false } : undefined;
  _pool = new Pool({ connectionString: url, ssl });
  return _pool;
}

// Proxy que inicializa o pool sob demanda — todo `pool.query`/`pool.connect` funciona igual.
export const pool: Pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const p = init() as any;
    const v = p[prop];
    return typeof v === 'function' ? v.bind(p) : v;
  },
});

export type QueryFn = (sql: string, params?: unknown[]) => Promise<any>;

// Executa queries JÁ no escopo de um tenant (ativa o RLS via app.tenant_id).
export async function comTenant<T>(tenantId: string, fn: (q: QueryFn) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    client.release();
  }
}

// Roteamento: tenant + projeto pelo número/instância (SECURITY DEFINER, ignora RLS).
export async function resolverProjetoPorNumero(phoneNumberId: string): Promise<{ tenant_id: string; projeto_id: string } | null> {
  const r = await pool.query('select tenant_id, projeto_id from resolver_projeto($1)', [phoneNumberId]);
  return r.rows[0] ?? null;
}

// Tenant pelo domínio da agência (white-label). tenants não tem RLS.
export async function resolverTenantPorDominio(dominio: string): Promise<{ id: string } | null> {
  const r = await pool.query(`select id from tenants where dominio=$1 and status <> 'deleted' limit 1`, [dominio]);
  return r.rows[0] ?? null;
}

// Billing: assinatura pelo id do provider (sem tenant, via SECURITY DEFINER).
export async function resolverAssinatura(subId: string): Promise<{ id: string; tenant_id: string } | null> {
  const r = await pool.query('select id, tenant_id from resolver_assinatura($1)', [subId]);
  return r.rows[0] ?? null;
}

export async function resolverAssinaturaProvider(provider: string, externalId: string): Promise<{ id: string; tenant_id: string } | null> {
  const r = await pool.query('select id, tenant_id from resolver_assinatura_provider($1,$2)', [provider, externalId]);
  return r.rows[0] ?? null;
}

export async function statusTenant(tenantId: string): Promise<string | null> {
  const r = await pool.query('select status from tenants where id=$1', [tenantId]);
  return r.rows[0]?.status ?? null;
}

export async function definirStatusTenant(tenantId: string, status: string): Promise<void> {
  await pool.query('update tenants set status=$1 where id=$2', [status, tenantId]);
}

export type BillingAccessState =
  | 'active'
  | 'trialing'
  | 'past_due_grace'
  | 'restricted'
  | 'needs_subscription';

export async function acessoBillingTenant(tenantId: string): Promise<{
  state: BillingAccessState;
  canUsePaidFeatures: boolean;
}> {
  const r = await pool.query(
    `select status, trial_ends_at, grace_period_ends_at
       from assinaturas
      where tenant_id=$1
      order by case
        when lower(status) in ('ativa','active','trialing','trial') then 0
        when lower(status) in ('inadimplente','past_due','overdue') then 1
        when lower(status) in ('pendente','pending','pending_payment') then 2
        else 3
      end,
      criado_em desc
      limit 1`,
    [tenantId],
  );
  const row = r.rows[0];
  if (!row) return { state: 'needs_subscription', canUsePaidFeatures: false };

  const status = String(row.status || '').toLowerCase();
  const now = Date.now();
  const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  const graceEndsAt = row.grace_period_ends_at ? new Date(row.grace_period_ends_at).getTime() : 0;

  if (['ativa', 'active'].includes(status)) return { state: 'active', canUsePaidFeatures: true };
  if (['trialing', 'trial'].includes(status) && (!trialEndsAt || trialEndsAt >= now)) {
    return { state: 'trialing', canUsePaidFeatures: true };
  }
  if (['inadimplente', 'past_due', 'overdue'].includes(status) && graceEndsAt >= now) {
    return { state: 'past_due_grace', canUsePaidFeatures: true };
  }

  return { state: 'restricted', canUsePaidFeatures: false };
}
