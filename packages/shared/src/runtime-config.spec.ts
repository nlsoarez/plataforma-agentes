import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireSecret, validateApiRuntimeConfig } from './runtime-config';

describe('runtime config', () => {
  it('never uses a fallback secret in production', () => {
    assert.throws(() => requireSecret('JWT_SECRET', { NODE_ENV: 'production' }, 'fallback'));
  });

  it('rejects incomplete production API configuration', () => {
    assert.throws(() => validateApiRuntimeConfig({ NODE_ENV: 'production' }), /Variaveis obrigatorias/);
  });
});
