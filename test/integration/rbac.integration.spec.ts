import { PERMISSIONS, roleHasPermission } from '@fleetflow/shared';
import {
  userCanReadOrder,
  type OrderAccessContext,
} from '../../src/orders/interfaces/order-access.interface';

describe('order access RBAC', () => {
  it('allows merchant admin to read own orders only', () => {
    const access: OrderAccessContext = {
      mode: 'jwt',
      user: {
        id: 'user-1',
        email: 'merchant.admin@acme-commerce.id',
        displayName: 'Merchant Admin',
        role: 'MERCHANT_ADMIN',
        merchantId: 'merchant-1',
        driverId: null,
        permissions: [PERMISSIONS.ORDERS_CREATE, PERMISSIONS.ORDERS_READ_OWN],
      },
    };

    expect(
      userCanReadOrder(access, {
        merchantId: 'merchant-1',
        assignedDriverId: null,
      }),
    ).toBe(true);

    expect(
      userCanReadOrder(access, {
        merchantId: 'merchant-2',
        assignedDriverId: null,
      }),
    ).toBe(false);
  });

  it('allows driver partner to read assigned orders only', () => {
    const access: OrderAccessContext = {
      mode: 'jwt',
      user: {
        id: 'user-2',
        email: 'driver.partner@fleetflow.dev',
        displayName: 'Driver Partner',
        role: 'DRIVER_PARTNER',
        merchantId: null,
        driverId: 'driver-1',
        permissions: [PERMISSIONS.ORDERS_READ_ASSIGNED],
      },
    };

    expect(
      userCanReadOrder(access, {
        merchantId: 'merchant-1',
        assignedDriverId: 'driver-1',
      }),
    ).toBe(true);

    expect(
      userCanReadOrder(access, {
        merchantId: 'merchant-1',
        assignedDriverId: 'driver-2',
      }),
    ).toBe(false);
  });

  it('allows fleet operator to read all orders', () => {
    const access: OrderAccessContext = {
      mode: 'jwt',
      user: {
        id: 'user-3',
        email: 'fleet.operator@fleetflow.dev',
        displayName: 'Fleet Operator',
        role: 'FLEET_OPERATOR',
        merchantId: null,
        driverId: null,
        permissions: [
          PERMISSIONS.ORDERS_READ_ALL,
          PERMISSIONS.FLEET_MANAGE,
          PERMISSIONS.DRIVERS_MANAGE,
        ],
      },
    };

    expect(
      userCanReadOrder(access, {
        merchantId: 'merchant-99',
        assignedDriverId: 'driver-99',
      }),
    ).toBe(true);
  });

  it('maps shared RBAC permissions for merchant admin', () => {
    expect(roleHasPermission('MERCHANT_ADMIN', PERMISSIONS.ORDERS_CREATE)).toBe(
      true,
    );
    expect(roleHasPermission('DRIVER_PARTNER', PERMISSIONS.ORDERS_CREATE)).toBe(
      false,
    );
  });
});
