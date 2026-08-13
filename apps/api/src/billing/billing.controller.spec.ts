import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BillingController } from './billing.controller';

describe('billing RBAC metadata', () => {
  it('restricts every billing mutation to owner and admin', () => {
    for (const method of ['checkout', 'assinar', 'sincronizar', 'cancelar'] as const) {
      const roles = Reflect.getMetadata('app_roles', BillingController.prototype[method]);
      assert.deepEqual(roles, ['owner', 'admin'], `${method} must remain privileged`);
    }
  });

  it('keeps subscription status readable by authenticated tenant members', () => {
    assert.equal(Reflect.getMetadata('app_roles', BillingController.prototype.status), undefined);
  });
});
