import { HttpException, HttpStatus } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };
type AuthAction = 'login' | 'password-forgot' | 'email-verify-request' | 'register' | 'google-start';

const buckets = new Map<string, Bucket>();
let lastPruneAt = 0;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function authRateLimitConfig(env = process.env) {
  return {
    accountLimit: positiveInt(env.AUTH_RATE_LIMIT_ACCOUNT_MAX, 10),
    sourceLimit: positiveInt(env.AUTH_RATE_LIMIT_SOURCE_MAX, 60),
    globalLimit: positiveInt(env.AUTH_RATE_LIMIT_GLOBAL_MAX, 300),
    windowMs: positiveInt(env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000),
  };
}

function consume(key: string, limit: number, windowMs: number, now: number): { allowed: boolean; retryAfter: number } {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().slice(0, 320) || 'unknown';
}

export function assertAuthRateLimit(
  action: AuthAction,
  input: { domain?: string; account?: string; source?: string },
  now = Date.now(),
  config = authRateLimitConfig(),
): void {
  if (now - lastPruneAt >= config.windowMs) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    lastPruneAt = now;
  }
  const keys: Array<[string, number]> = [
    [`auth:${action}:global`, config.globalLimit],
    [`auth:${action}:source:${normalized(input.source)}`, config.sourceLimit],
    [`auth:${action}:account:${normalized(input.domain)}:${normalized(input.account)}`, config.accountLimit],
  ];

  for (const [key, limit] of keys) {
    const decision = consume(key, limit, config.windowMs, now);
    if (!decision.allowed) {
      throw new HttpException({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'muitas tentativas; tente novamente mais tarde',
        retryAfter: decision.retryAfter,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

export function resetAuthRateLimitForTests(): void {
  buckets.clear();
  lastPruneAt = 0;
}
