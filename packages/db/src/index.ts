import { Pool } from 'pg';
import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';

// Carrega o .env da raiz do monorepo. Chame antes de qualquer query.
// Em producao, as env vars vem da plataforma e isto vira no-op.
export function carregarEnv(): void {
  dotenvConfig({ path: join(__dirname, '..', '..', '..', '.env') });
}

let _pool: Pool | null = null;

function init(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL ?? '';
  const ssl = /sslmode=require/.test(url) || process.env.PGSSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined;
  _pool = new Pool({ connectionString: url, ssl });
  return _pool;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const p = init() as any;
    const v = p[prop];
    return typeof v === 'function' ? v.bind(p) : v;
  },
});

export type QueryFn = (sql: string, params?: unknown[]) => Promise<any>;

export async function comTenant<T>(tenantId: string, fn: (q: QueryFn) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    client.release();
  }
}

export async function resolverProjetoPorNumero(phoneNumberId: string): Promise<{ tenant_id: string; projeto_id: string } | null> {
  const r = await pool.query('select tenant_id, projeto_id from resolver_projeto($1)', [phoneNumberId]);
  return r.rows[0] ?? null;
}

export function normalizarDominio(input: string): string {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.host.replace(/^www\./, '');
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .replace(/^www\./, '');
  }
}

function tabelaNaoExiste(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '42P01');
}

export async function resolverTenantPorDominio(dominio: string): Promise<{ id: string } | null> {
  const host = normalizarDominio(dominio);
  if (!host) return null;

  const direto = await pool.query(
    `select id
       from tenants
      where lower(dominio)=lower($1)
        and status <> 'deleted'
      limit 1`,
    [host],
  );
  if (direto.rows[0]) return direto.rows[0];

  try {
    const alias = await pool.query(
      `select t.id
         from tenant_domains td
         join tenants t on t.id=td.tenant_id
        where lower(td.domain)=lower($1)
          and t.status <> 'deleted'
        limit 1`,
      [host],
    );
    return alias.rows[0] ?? null;
  } catch (error) {
    if (tabelaNaoExiste(error)) return null;
    throw error;
  }
}

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
