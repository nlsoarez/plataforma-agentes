export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimitConfig(env = process.env) {
  return {
    limit: Math.max(1, Number(env.PUBLIC_API_RATE_LIMIT_MAX ?? 120)),
    windowMs: Math.max(1000, Number(env.PUBLIC_API_RATE_LIMIT_WINDOW_MS ?? 60000)),
  };
}

export function checkRateLimit(key: string, now = Date.now(), config = rateLimitConfig()): RateLimitDecision {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + config.windowMs };
    buckets.set(key, next);
    return { allowed: true, limit: config.limit, remaining: config.limit - 1, resetAt: next.resetAt };
  }

  current.count += 1;
  const remaining = Math.max(0, config.limit - current.count);
  return {
    allowed: current.count <= config.limit,
    limit: config.limit,
    remaining,
    resetAt: current.resetAt,
  };
}

export function resetRateLimitForTests() {
  buckets.clear();
}
