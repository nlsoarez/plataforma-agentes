import * as crypto from 'node:crypto';

const META_SIGNATURE_RE = /^sha256=[a-f0-9]{64}$/i;

export function validMetaWebhookSignature(rawBody: Buffer | undefined, signature: unknown, secret: unknown): boolean {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || typeof secret !== 'string' || !secret) return false;
  if (!META_SIGNATURE_RE.test(signature)) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature, 'ascii'), Buffer.from(expected, 'ascii'));
}
