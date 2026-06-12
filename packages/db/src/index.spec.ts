import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizarDominio } from './index';

describe('normalizarDominio', () => {
  it('normalizes production hosts', () => {
    assert.equal(normalizarDominio('https://www.comunora.com.br/login'), 'comunora.com.br');
    assert.equal(normalizarDominio('APP.COMUNORA.COM.BR'), 'app.comunora.com.br');
    assert.equal(normalizarDominio(' api.comunora.com.br/webhook/evolution '), 'api.comunora.com.br');
  });

  it('preserves local ports', () => {
    assert.equal(normalizarDominio('localhost:3001'), 'localhost:3001');
    assert.equal(normalizarDominio('http://127.0.0.1:3001/login'), '127.0.0.1:3001');
  });

  it('handles empty values', () => {
    assert.equal(normalizarDominio(''), '');
    assert.equal(normalizarDominio('   '), '');
  });
});
