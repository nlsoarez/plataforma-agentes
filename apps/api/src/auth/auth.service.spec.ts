import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { AuthService } from './auth.service';

const previousNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

describe('authentication link responses', () => {
  it('does not expose account or provider state in production', () => {
    process.env.NODE_ENV = 'production';
    const service = new AuthService({} as any);
    const sent = (service as any).authLinkResponse('https://example.invalid/reset/secret', { ok: true, provider: 'resend' });
    const missing = (service as any).authLinkResponse('', { ok: true, provider: 'none' });
    assert.deepEqual(sent, { ok: true });
    assert.deepEqual(missing, { ok: true });
  });
});
