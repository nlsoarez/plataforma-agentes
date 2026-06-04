import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const ITER = 120_000, KEYLEN = 32, DIGEST = 'sha256';

export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const dk = pbkdf2Sync(senha, salt, ITER, KEYLEN, DIGEST);
  return `pbkdf2$${ITER}$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function verificarSenha(senha: string, armazenado: string): boolean {
  const [, iterS, saltHex, hashHex] = armazenado.split('$');
  if (!iterS || !saltHex || !hashHex) return false;
  const dk = pbkdf2Sync(senha, Buffer.from(saltHex, 'hex'), parseInt(iterS, 10), KEYLEN, DIGEST);
  const a = Buffer.from(hashHex, 'hex');
  return a.length === dk.length && timingSafeEqual(a, dk);
}
