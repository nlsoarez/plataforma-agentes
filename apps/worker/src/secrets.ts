import { createDecipheriv, createHash } from 'crypto';

const ALGO = 'aes-256-gcm';

function masterKey() {
  const raw = process.env.SECRETS_MASTER_KEY || process.env.JWT_SECRET || 'dev-insecure-master-key-change-me';
  return createHash('sha256').update(raw).digest();
}

export function decryptSecret(payload: string | null | undefined) {
  if (!payload) return null;
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('segredo criptografado invalido');
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
