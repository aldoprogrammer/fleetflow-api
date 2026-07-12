import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { OrderAccessContext } from './order-access.interface';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PERMISSIONS } from '@fleetflow/shared';

export function userCanAdvanceTripOrder(
  access: OrderAccessContext,
  order: {
    status: OrderStatus;
    assignedDriverId: string | null;
  },
): boolean {
  if (
    order.status !== OrderStatus.ASSIGNED &&
    order.status !== OrderStatus.PICKED_UP
  ) {
    return false;
  }

  if (access.mode !== 'jwt' || !access.user) {
    return false;
  }

  const user = access.user;

  if (
    user.permissions.includes(PERMISSIONS.ORDERS_READ_ALL) ||
    user.permissions.includes(PERMISSIONS.FLEET_MANAGE)
  ) {
    return true;
  }

  if (
    user.permissions.includes(PERMISSIONS.ORDERS_READ_ASSIGNED) &&
    user.driverId &&
    order.assignedDriverId === user.driverId
  ) {
    return true;
  }

  return false;
}

export function assertCanAdvanceTrip(
  access: OrderAccessContext,
  order: {
    status: OrderStatus;
    assignedDriverId: string | null;
  },
): void {
  if (!userCanAdvanceTripOrder(access, order)) {
    throw new ForbiddenException(
      'You are not allowed to update this trip status.',
    );
  }
}

export function assertValidTransition(
  current: OrderStatus,
  expected: OrderStatus,
  next: OrderStatus,
): void {
  if (current !== expected) {
    throw new BadRequestException(
      `Order must be ${expected} before moving to ${next}. Current status: ${current}.`,
    );
  }
}

export function isFleetTripDelegate(user: AuthenticatedUser): boolean {
  return (
    user.permissions.includes(PERMISSIONS.ORDERS_READ_ALL) ||
    user.permissions.includes(PERMISSIONS.FLEET_MANAGE)
  );
}
