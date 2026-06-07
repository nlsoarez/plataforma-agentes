import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, resetRateLimitForTests } from './rate-limit';

describe('public api rate limit', () => {
  beforeEach(() => resetRateLimitForTests());

  it('allows requests under the configured limit', () => {
    const cfg = { limit: 2, windowMs: 1000 };
    assert.equal(checkRateLimit('key-a', 1000, cfg).allowed, true);
    assert.equal(checkRateLimit('key-a', 1001, cfg).allowed, true);
  });

  it('blocks requests over the configured limit', () => {
    const cfg = { limit: 1, windowMs: 1000 };
    assert.equal(checkRateLimit('key-a', 1000, cfg).allowed, true);
    assert.equal(checkRateLimit('key-a', 1001, cfg).allowed, false);
  });

  it('resets the bucket after the window expires', () => {
    const cfg = { limit: 1, windowMs: 1000 };
    assert.equal(checkRateLimit('key-a', 1000, cfg).allowed, true);
    assert.equal(checkRateLimit('key-a', 1001, cfg).allowed, false);
    assert.equal(checkRateLimit('key-a', 2001, cfg).allowed, true);
  });
});
