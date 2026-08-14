import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { Pool, PoolClient } from 'pg';

const runtimeUrl = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;

describe('RLS multi-tenant', () => {
  it('isola leitura e escrita entre dois tenants', { skip: !runtimeUrl || !adminUrl }, async () => {
    const admin = new Pool({ connectionString: adminUrl });
    const runtime = new Pool({ connectionString: runtimeUrl });
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    try {
      await admin.query(
        `insert into tenants (id, nome, dominio) values ($1,'Tenant A',$2),($3,'Tenant B',$4)`,
        [tenantA, `${tenantA}.test`, tenantB, `${tenantB}.test`],
      );
      await withTenant(runtime, tenantA, (client) => client.query(
        `insert into usuarios (tenant_id,email,senha_hash,papel,status) values ($1,'igual@example.com','hash','admin','ativo')`,
        [tenantA],
      ));
      await withTenant(runtime, tenantB, (client) => client.query(
        `insert into usuarios (tenant_id,email,senha_hash,papel,status) values ($1,'igual@example.com','hash','admin','ativo')`,
        [tenantB],
      ));

      const rowsA = await withTenant(runtime, tenantA, (client) => client.query('select tenant_id from usuarios'));
      const rowsB = await withTenant(runtime, tenantB, (client) => client.query('select tenant_id from usuarios'));
      assert.deepEqual(rowsA.rows.map((row) => row.tenant_id), [tenantA]);
      assert.deepEqual(rowsB.rows.map((row) => row.tenant_id), [tenantB]);

      await assert.rejects(
        withTenant(runtime, tenantA, (client) => client.query(
          `insert into usuarios (tenant_id,email,senha_hash,papel,status) values ($1,'invasao@example.com','hash','admin','ativo')`,
          [tenantB],
        )),
        (error: any) => error?.code === '42501',
      );

      const withoutContext = await runtime.query('select tenant_id from usuarios');
      assert.equal(withoutContext.rowCount, 0);
    } finally {
      await admin.query('delete from tenants where id=any($1::uuid[])', [[tenantA, tenantB]]).catch(() => undefined);
      await Promise.all([runtime.end(), admin.end()]);
    }
  });
});

async function withTenant<T>(pool: Pool, tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id',$1,true)", [tenantId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
