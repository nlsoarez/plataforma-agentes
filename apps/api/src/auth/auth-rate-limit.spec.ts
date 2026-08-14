import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { assertAuthRateLimit, resetAuthRateLimitForTests } from './auth-rate-limit';

describe('auth rate limit', () => {
  beforeEach(resetAuthRateLimitForTests);

  it('blocks repeated attempts against the same account', () => {
    const config = { accountLimit: 2, sourceLimit: 20, globalLimit: 50, windowMs: 60_000 };
    const input = { domain: 'app.comunora.com.br', account: 'user@example.com', source: '203.0.113.10' };
    assert.doesNotThrow(() => assertAuthRateLimit('login', input, 1_000, config));
    assert.doesNotThrow(() => assertAuthRateLimit('login', input, 1_001, config));
    assert.throws(() => assertAuthRateLimit('login', input, 1_002, config), /muitas tentativas/);
  });

  it('does not allow source rotation to bypass the account bucket', () => {
    const config = { accountLimit: 1, sourceLimit: 20, globalLimit: 50, windowMs: 60_000 };
    assertAuthRateLimit('login', { domain: 'x', account: 'same@example.com', source: '1.1.1.1' }, 1_000, config);
    assert.throws(
      () => assertAuthRateLimit('login', { domain: 'x', account: 'same@example.com', source: '8.8.8.8' }, 1_001, config),
      /muitas tentativas/,
    );
  });
});
