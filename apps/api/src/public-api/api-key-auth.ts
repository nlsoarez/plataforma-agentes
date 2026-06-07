import { createHash } from 'crypto';
import { pool } from '@plataforma/db';

export type ApiKeyContext = {
  tenantId: string;
  keyId: string;
  escopos: string[];
};

export function hashApiKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

export async function autenticarApiKey(raw: string | string[] | undefined): Promise<ApiKeyContext | null> {
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key) return null;

  const hash = hashApiKey(key);
  const r = await pool.query(
    `select id, tenant_id, escopos
     from api_keys
     where key_hash=$1 and ativo=true
     limit 1`,
    [hash],
  );
  const row = r.rows[0];
  if (!row) return null;

  await pool.query(`update api_keys set ultimo_uso_em=now() where id=$1`, [row.id]);
  return { tenantId: row.tenant_id, keyId: row.id, escopos: row.escopos ?? [] };
}
