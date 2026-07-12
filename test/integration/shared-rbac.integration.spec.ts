import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  USER_ROLES,
  getPermissionsForRole,
  roleHasPermission,
} from '@fleetflow/shared';

describe('shared RBAC permissions', () => {
  it('defines permissions for every role', () => {
    for (const role of USER_ROLES) {
      expect(getPermissionsForRole(role).length).toBeGreaterThan(0);
      expect(ROLE_PERMISSIONS[role]).toEqual(getPermissionsForRole(role));
    }
  });

  it('grants superadmin all permissions', () => {
    const permissions = getPermissionsForRole('SUPERADMIN');
    expect(permissions).toContain(PERMISSIONS.USERS_MANAGE);
    expect(permissions).toContain(PERMISSIONS.ORDERS_CREATE);
    expect(permissions).toContain(PERMISSIONS.LEDGER_MANAGE);
  });

  it('merchant admin can create and read own orders only', () => {
    expect(roleHasPermission('MERCHANT_ADMIN', PERMISSIONS.ORDERS_CREATE)).toBe(
      true,
    );
    expect(roleHasPermission('MERCHANT_ADMIN', PERMISSIONS.ORDERS_READ_OWN)).toBe(
      true,
    );
    expect(roleHasPermission('MERCHANT_ADMIN', PERMISSIONS.FLEET_MANAGE)).toBe(
      false,
    );
    expect(roleHasPermission('MERCHANT_ADMIN', PERMISSIONS.MERCHANTS_MANAGE)).toBe(
      false,
    );
  });

  it('driver partner can only read assigned orders', () => {
    expect(
      roleHasPermission('DRIVER_PARTNER', PERMISSIONS.ORDERS_READ_ASSIGNED),
    ).toBe(true);
    expect(roleHasPermission('DRIVER_PARTNER', PERMISSIONS.ORDERS_CREATE)).toBe(
      false,
    );
  });

  it('fleet operator manages fleet and drivers but not merchants', () => {
    expect(roleHasPermission('FLEET_OPERATOR', PERMISSIONS.FLEET_MANAGE)).toBe(
      true,
    );
    expect(roleHasPermission('FLEET_OPERATOR', PERMISSIONS.DRIVERS_MANAGE)).toBe(
      true,
    );
    expect(roleHasPermission('FLEET_OPERATOR', PERMISSIONS.MERCHANTS_MANAGE)).toBe(
      false,
    );
    expect(roleHasPermission('FLEET_OPERATOR', PERMISSIONS.LEDGER_READ)).toBe(
      false,
    );
  });

  it('regional manager can manage merchants and read ledger', () => {
    expect(
      roleHasPermission('REGIONAL_MANAGER', PERMISSIONS.MERCHANTS_MANAGE),
    ).toBe(true);
    expect(roleHasPermission('REGIONAL_MANAGER', PERMISSIONS.LEDGER_READ)).toBe(
      true,
    );
    expect(roleHasPermission('REGIONAL_MANAGER', PERMISSIONS.USERS_MANAGE)).toBe(
      false,
    );
  });

  it('head of warehouse can manage fleet and ledger but not drivers', () => {
    expect(
      roleHasPermission('HEAD_OF_WAREHOUSE', PERMISSIONS.FLEET_MANAGE),
    ).toBe(true);
    expect(roleHasPermission('HEAD_OF_WAREHOUSE', PERMISSIONS.LEDGER_READ)).toBe(
      true,
    );
    expect(
      roleHasPermission('HEAD_OF_WAREHOUSE', PERMISSIONS.DRIVERS_MANAGE),
    ).toBe(false);
  });
});
