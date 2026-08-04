import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasApiScope } from './api-key-auth';

describe('API key scopes', () => {
  it('nega operacoes fora do escopo', () => {
    assert.equal(hasApiScope(['leads'], 'leads'), true);
    assert.equal(hasApiScope(['leads'], 'messages'), false);
    assert.equal(hasApiScope(['*'], 'messages'), true);
  });
});
