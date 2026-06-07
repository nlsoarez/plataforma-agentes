import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allowedCorsOrigins, isOriginAllowed, parseAllowedOrigins } from './cors';

describe('cors helpers', () => {
  it('parses comma separated origins and trims trailing slashes', () => {
    assert.deepEqual(
      parseAllowedOrigins(' https://app.exemplo.com/, http://localhost:3001 '),
      ['https://app.exemplo.com', 'http://localhost:3001'],
    );
  });

  it('allows localhost defaults outside production', () => {
    assert.equal(allowedCorsOrigins({ NODE_ENV: 'development' }).includes('http://localhost:3001'), true);
  });

  it('blocks browser origins in production when CORS_ORIGINS is empty', () => {
    const allowed = allowedCorsOrigins({ NODE_ENV: 'production' });
    assert.equal(isOriginAllowed('https://evil.example', allowed), false);
  });
});
