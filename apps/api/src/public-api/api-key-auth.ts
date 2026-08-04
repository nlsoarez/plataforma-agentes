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

export function hasApiScope(scopes: string[], required: string): boolean {
  return scopes.includes('*') || scopes.includes(required);
}

export async function autenticarApiKey(raw: string | string[] | undefined): Promise<ApiKeyContext | null> {
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key) return null;

  const hash = hashApiKey(key);
  const r = await pool.query(
    `select id, tenant_id, escopos from authenticate_api_key($1) limit 1`,
    [hash],
  );
  const row = r.rows[0];
  if (!row) return null;

  return { tenantId: row.tenant_id, keyId: row.id, escopos: row.escopos ?? [] };
}
