import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EvolutionDriver } from './evolution.driver';

describe('EvolutionDriver.parseWebhook', () => {
  it('normalizes incoming messages.upsert payloads', () => {
    const driver = new EvolutionDriver('http://evolution.local', 'test');
    const events = driver.parseWebhook({
      event: 'messages.upsert',
      instance: 'instancia_1',
      data: {
        key: {
          id: 'MSG1',
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
        },
        message: { conversation: 'Ola' },
      },
    });

    assert.deepEqual(events, [{
      tipo: 'mensagem_recebida',
      phoneNumberId: 'instancia_1',
      de: '5511999999999',
      conteudo: 'Ola',
      metaId: 'MSG1',
      midia: undefined,
    }]);
  });

  it('ignores outbound echoes and group messages', () => {
    const driver = new EvolutionDriver('http://evolution.local', 'test');
    const events = driver.parseWebhook({
      event: 'MESSAGES_UPSERT',
      instance: { instanceName: 'instancia_1' },
      data: [
        { key: { id: 'OUT', remoteJid: '5511@s.whatsapp.net', fromMe: true }, message: { conversation: 'eco' } },
        { key: { id: 'GRP', remoteJid: '123@g.us', fromMe: false }, message: { conversation: 'grupo' } },
      ],
    });

    assert.deepEqual(events, []);
  });
});
