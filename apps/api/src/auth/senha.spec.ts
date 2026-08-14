import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { describe, it } from 'node:test';
import { hashSenha, senhaPrecisaRehash, verificarSenha } from './senha';

describe('password hashing', () => {
  it('uses the current PBKDF2 work factor', () => {
    const stored = hashSenha('senha-de-teste-bastante-longa');
    assert.match(stored, /^pbkdf2\$600000\$/);
    assert.equal(verificarSenha('senha-de-teste-bastante-longa', stored), true);
    assert.equal(verificarSenha('senha-incorreta', stored), false);
    assert.equal(senhaPrecisaRehash(stored), false);
  });

  it('accepts a valid legacy hash and marks it for transparent upgrade', () => {
    const salt = Buffer.alloc(16, 7);
    const digest = pbkdf2Sync('senha-legada', salt, 120_000, 32, 'sha256');
    const stored = `pbkdf2$120000$${salt.toString('hex')}$${digest.toString('hex')}`;
    assert.equal(verificarSenha('senha-legada', stored), true);
    assert.equal(senhaPrecisaRehash(stored), true);
  });

  it('fails closed for malformed hashes', () => {
    assert.equal(verificarSenha('qualquer', 'pbkdf2$999999999$00$00'), false);
    assert.equal(verificarSenha('qualquer', 'invalido'), false);
  });
});
