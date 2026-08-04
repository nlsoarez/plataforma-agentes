import { timingSafeEqual } from 'crypto';

export function sharedSecretMatches(provided: string | undefined, configured: string | undefined): boolean {
  if (!provided || !configured) return false;
  const received = Buffer.from(provided);
  const expected = Buffer.from(configured);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
