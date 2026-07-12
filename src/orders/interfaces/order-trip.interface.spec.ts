import { OrderStatus } from '@prisma/client';
import {
  assertCanAdvanceTrip,
  assertValidTransition,
  userCanAdvanceTripOrder,
} from './order-trip.interface';

describe('order trip transitions', () => {
  const assignedOrder = {
    status: OrderStatus.ASSIGNED,
    assignedDriverId: 'driver-1',
  };

  it('allows assigned driver to advance trip', () => {
    expect(
      userCanAdvanceTripOrder(
        {
          mode: 'jwt',
          user: {
            id: 'u1',
            email: 'driver@fleetflow.dev',
            displayName: 'Driver',
            role: 'DRIVER_PARTNER',
            merchantId: null,
            driverId: 'driver-1',
            permissions: ['orders:read:assigned'],
          },
        },
        assignedOrder,
      ),
    ).toBe(true);
  });

  it('rejects driver not assigned to order', () => {
    expect(
      userCanAdvanceTripOrder(
        {
          mode: 'jwt',
          user: {
            id: 'u2',
            email: 'other@fleetflow.dev',
            displayName: 'Other',
            role: 'DRIVER_PARTNER',
            merchantId: null,
            driverId: 'driver-2',
            permissions: ['orders:read:assigned'],
          },
        },
        assignedOrder,
      ),
    ).toBe(false);
  });

  it('validates ASSIGNED → PICKED_UP transition', () => {
    expect(() =>
      assertValidTransition(
        OrderStatus.PICKED_UP,
        OrderStatus.ASSIGNED,
        OrderStatus.PICKED_UP,
      ),
    ).toThrow('Order must be ASSIGNED');
  });

  it('blocks trip advance when order already delivered', () => {
    expect(
      userCanAdvanceTripOrder(
        {
          mode: 'jwt',
          user: {
            id: 'u1',
            email: 'fleet@fleetflow.dev',
            displayName: 'Fleet',
            role: 'FLEET_OPERATOR',
            merchantId: null,
            driverId: null,
            permissions: ['orders:read:all', 'fleet:manage'],
          },
        },
        { status: OrderStatus.DELIVERED, assignedDriverId: 'driver-1' },
      ),
    ).toBe(false);
  });

  it('assertCanAdvanceTrip throws for merchant admin', () => {
    expect(() =>
      assertCanAdvanceTrip(
        {
          mode: 'jwt',
          user: {
            id: 'm1',
            email: 'merchant@acme.id',
            displayName: 'Merchant',
            role: 'MERCHANT_ADMIN',
            merchantId: 'merchant-1',
            driverId: null,
            permissions: ['orders:create', 'orders:read:own'],
          },
        },
        assignedOrder,
      ),
    ).toThrow('not allowed to update this trip status');
  });
});
