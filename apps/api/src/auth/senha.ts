import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const ITER = 600_000, KEYLEN = 32, DIGEST = 'sha256';

export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const dk = pbkdf2Sync(senha, salt, ITER, KEYLEN, DIGEST);
  return `pbkdf2$${ITER}$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function verificarSenha(senha: string, armazenado: string): boolean {
  try {
    if (typeof senha !== 'string' || typeof armazenado !== 'string') return false;
    const [scheme, iterS, saltHex, hashHex] = armazenado.split('$');
    const iterations = Number(iterS);
    if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return false;
    if (!/^[a-f0-9]{32}$/i.test(saltHex || '') || !/^[a-f0-9]{64}$/i.test(hashHex || '')) return false;
    const dk = pbkdf2Sync(senha, Buffer.from(saltHex, 'hex'), iterations, KEYLEN, DIGEST);
    const stored = Buffer.from(hashHex, 'hex');
    return stored.length === dk.length && timingSafeEqual(stored, dk);
  } catch {
    return false;
  }
}

export function senhaPrecisaRehash(armazenado: string): boolean {
  const [scheme, iterS] = String(armazenado || '').split('$');
  return scheme !== 'pbkdf2' || Number(iterS) < ITER;
}
