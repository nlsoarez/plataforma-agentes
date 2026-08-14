import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roleAllowed } from './roles';

describe('RBAC', () => {
  it('permite somente papeis declarados', () => {
    assert.equal(roleAllowed('owner', ['owner', 'admin']), true);
    assert.equal(roleAllowed('admin', ['owner', 'admin']), true);
    assert.equal(roleAllowed('atendente', ['owner', 'admin']), false);
    assert.equal(roleAllowed('cliente_final', ['owner', 'admin', 'atendente']), false);
  });
});
