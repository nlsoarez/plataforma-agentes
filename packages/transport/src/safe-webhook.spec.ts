import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPublicIp, resolveSafeWebhookTarget } from './safe-webhook';

describe('safe webhook destination', () => {
  it('blocks private, loopback, link-local and documentation addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.1.2', '192.168.1.2', '169.254.169.254', '::1', 'fc00::1', '2001:db8::1']) {
      assert.equal(isPublicIp(address), false, address);
    }
    assert.equal(isPublicIp('8.8.8.8'), true);
    assert.equal(isPublicIp('2606:4700:4700::1111'), true);
  });

  it('requires HTTPS and rejects credentials', async () => {
    await assert.rejects(() => resolveSafeWebhookTarget('http://8.8.8.8/hook', false), /HTTPS/);
    await assert.rejects(() => resolveSafeWebhookTarget('https://user:pass@8.8.8.8/hook', false), /credenciais/);
  });

  it('blocks private IP literals before a request is made', async () => {
    await assert.rejects(() => resolveSafeWebhookTarget('https://127.0.0.1/hook', false), /interno ou reservado/);
    await assert.rejects(() => resolveSafeWebhookTarget('https://169.254.169.254/latest/meta-data', false), /interno ou reservado/);
  });
});
