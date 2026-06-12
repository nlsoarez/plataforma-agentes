import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailService } from './email.service';

test('email service skips when provider is not configured', async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const service = new EmailService();

  const result = await service.send({ to: 'user@example.com', subject: 'Teste', html: '<b>Oi</b>' });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(result.provider, 'none');
  if (previous) process.env.RESEND_API_KEY = previous;
});

test('email service sends through Resend when configured', async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  const previousFetch = global.fetch;
  process.env.RESEND_API_KEY = 'test_key';
  process.env.EMAIL_FROM = 'Teste <teste@example.com>';
  let request: any = null;
  global.fetch = (async (_url: any, init: any) => {
    request = init;
    return { ok: true } as Response;
  }) as any;

  const service = new EmailService();
  const result = await service.send({ to: 'user@example.com', subject: 'Teste', html: '<b>Oi</b>' });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'resend');
  assert.equal(JSON.parse(request.body).from, 'Teste <teste@example.com>');

  global.fetch = previousFetch;
  if (previousKey) process.env.RESEND_API_KEY = previousKey;
  else delete process.env.RESEND_API_KEY;
  if (previousFrom) process.env.EMAIL_FROM = previousFrom;
  else delete process.env.EMAIL_FROM;
});
