import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evolutionCreatePayload,
  evolutionWebhookConfig,
  extractEvolutionQr,
} from './evolution-onboarding';

test('cria a instancia Baileys com QR e o contrato de webhook da Evolution 2.3.7', () => {
  const payload = evolutionCreatePayload(
    't123_clinica',
    'https://api.comunora.com.br/webhook/evolution',
    'evolution-secret',
  );

  assert.deepEqual(payload, {
    instanceName: 't123_clinica',
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    webhook: {
      enabled: true,
      url: 'https://api.comunora.com.br/webhook/evolution',
      headers: { apikey: 'evolution-secret' },
      byEvents: false,
      base64: true,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    },
  });
});

test('nao envia webhook na criacao quando a URL publica ou a chave da API nao existem', () => {
  assert.deepEqual(evolutionCreatePayload('t123_clinica'), {
    instanceName: 't123_clinica',
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  });
  assert.deepEqual(
    evolutionCreatePayload('t123_clinica', 'https://api.comunora.com.br/webhook/evolution'),
    {
      instanceName: 't123_clinica',
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    },
  );
});

test('usa os campos byEvents e base64 exigidos pela Evolution 2.3.7', () => {
  const webhook = evolutionWebhookConfig('https://api.comunora.com.br/webhook/evolution', 'evolution-secret');

  assert.equal(webhook.byEvents, false);
  assert.equal(webhook.base64, true);
  assert.deepEqual(webhook.headers, { apikey: 'evolution-secret' });
  assert.equal('webhookByEvents' in webhook, false);
  assert.equal('webhookBase64' in webhook, false);
});

test('extrai o QR retornado dentro de qrcode pela criacao da instancia', () => {
  assert.deepEqual(
    extractEvolutionQr({
      qrcode: {
        base64: 'data:image/png;base64,abc',
        code: 'qr-text',
        pairingCode: '12345678',
      },
    }),
    {
      qr: 'data:image/png;base64,abc',
      qrCode: 'qr-text',
      pairingCode: '12345678',
    },
  );
});
