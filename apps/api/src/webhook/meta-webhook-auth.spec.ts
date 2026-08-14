import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as crypto from 'node:crypto';
import { validMetaWebhookSignature } from './meta-webhook-auth';

describe('Meta webhook signature', () => {
  const body = Buffer.from('{"entry":[]}');
  const secret = 'test-only-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

  it('accepts the exact HMAC signature', () => {
    assert.equal(validMetaWebhookSignature(body, signature, secret), true);
  });

  it('rejects malformed signatures without throwing', () => {
    assert.doesNotThrow(() => validMetaWebhookSignature(body, 'x', secret));
    assert.equal(validMetaWebhookSignature(body, 'x', secret), false);
  });

  it('fails closed when the secret or raw body is missing', () => {
    assert.equal(validMetaWebhookSignature(body, signature, ''), false);
    assert.equal(validMetaWebhookSignature(undefined, signature, secret), false);
  });
});
