import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Executa uma query JÁ no escopo de um tenant (ativa o RLS).
export async function comTenant<T>(tenantId: string, fn: (q: (sql: string, params?: unknown[]) => Promise<any>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    client.release();
  }
}
