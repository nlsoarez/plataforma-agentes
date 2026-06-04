import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type QueryFn = (sql: string, params?: unknown[]) => Promise<any>;

// Executa queries JÁ no escopo de um tenant (ativa o RLS via app.tenant_id).
export async function comTenant<T>(
  tenantId: string,
  fn: (q: QueryFn) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    client.release();
  }
}

// Roteamento: descobre tenant + projeto pelo número que recebeu a mensagem.
// Usa a função SECURITY DEFINER (ignora RLS só pra esta leitura de roteamento).
export async function resolverProjetoPorNumero(
  phoneNumberId: string,
): Promise<{ tenant_id: string; projeto_id: string } | null> {
  const r = await pool.query('select tenant_id, projeto_id from resolver_projeto($1)', [phoneNumberId]);
  return r.rows[0] ?? null;
}

// Resolve o tenant pelo domínio da agência (white-label). tenants não tem RLS.
export async function resolverTenantPorDominio(
  dominio: string,
): Promise<{ id: string } | null> {
  const r = await pool.query(
    `select id from tenants where dominio=$1 and status <> 'suspended' limit 1`,
    [dominio],
  );
  return r.rows[0] ?? null;
}

// Billing: resolve assinatura pelo id do provider (sem tenant, via SECURITY DEFINER).
export async function resolverAssinatura(subId: string): Promise<{ id: string; tenant_id: string } | null> {
  const r = await pool.query('select id, tenant_id from resolver_assinatura($1)', [subId]);
  return r.rows[0] ?? null;
}

// Status do tenant (tenants não tem RLS).
export async function statusTenant(tenantId: string): Promise<string | null> {
  const r = await pool.query('select status from tenants where id=$1', [tenantId]);
  return r.rows[0]?.status ?? null;
}

export async function definirStatusTenant(tenantId: string, status: string): Promise<void> {
  await pool.query('update tenants set status=$1 where id=$2', [status, tenantId]);
}
