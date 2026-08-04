import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sharedSecretMatches } from './webhook-auth';

describe('webhook shared secret', () => {
  it('accepts only an exact configured secret', () => {
    assert.equal(sharedSecretMatches('segredo-correto', 'segredo-correto'), true);
    assert.equal(sharedSecretMatches('segredo-errado', 'segredo-correto'), false);
  });

  it('fails closed when either secret is missing', () => {
    assert.equal(sharedSecretMatches(undefined, 'segredo-correto'), false);
    assert.equal(sharedSecretMatches('segredo-correto', undefined), false);
    assert.equal(sharedSecretMatches(undefined, undefined), false);
  });
});
