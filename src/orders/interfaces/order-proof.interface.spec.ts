import { BadRequestException } from '@nestjs/common';
import { OrderPhotoType, UserRole } from '@prisma/client';
import { PERMISSIONS } from '@fleetflow/shared';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { assertProofPhotosForTripAdvance } from './order-proof.interface';

function buildUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'driver@fleetflow.dev',
    displayName: 'Driver',
    role: UserRole.DRIVER_PARTNER,
    merchantId: null,
    driverId: 'driver-1',
    permissions: [PERMISSIONS.ORDERS_READ_ASSIGNED],
    ...overrides,
  };
}

describe('assertProofPhotosForTripAdvance', () => {
  it('blocks drivers without departure photos', () => {
    expect(() =>
      assertProofPhotosForTripAdvance({
        user: buildUser(),
        assignedDriverId: 'driver-1',
        photoType: OrderPhotoType.DEPARTURE,
        photoCount: 0,
      }),
    ).toThrow(
      new BadRequestException(
        'Please upload at least one departure photo before starting the journey.',
      ),
    );
  });

  it('blocks drivers without delivery photos', () => {
    expect(() =>
      assertProofPhotosForTripAdvance({
        user: buildUser(),
        assignedDriverId: 'driver-1',
        photoType: OrderPhotoType.DELIVERY,
        photoCount: 0,
      }),
    ).toThrow(
      new BadRequestException(
        'Please upload at least one delivery photo before completing the booking.',
      ),
    );
  });

  it('allows drivers when proof photos exist', () => {
    expect(
      assertProofPhotosForTripAdvance({
        user: buildUser(),
        assignedDriverId: 'driver-1',
        photoType: OrderPhotoType.DEPARTURE,
        photoCount: 1,
      }),
    ).toEqual({ opsOverride: false, skippedProof: false });
  });

  it('requires override reason for ops without photos', () => {
    expect(() =>
      assertProofPhotosForTripAdvance({
        user: buildUser({
          role: UserRole.FLEET_OPERATOR,
          driverId: null,
          permissions: [PERMISSIONS.ORDERS_READ_ALL, PERMISSIONS.FLEET_MANAGE],
        }),
        assignedDriverId: 'driver-1',
        photoType: OrderPhotoType.DELIVERY,
        photoCount: 0,
      }),
    ).toThrow(
      new BadRequestException(
        'Operations override requires a reason when proof photos are missing.',
      ),
    );
  });

  it('allows ops override with reason and no photos', () => {
    expect(
      assertProofPhotosForTripAdvance({
        user: buildUser({
          role: UserRole.FLEET_OPERATOR,
          driverId: null,
          permissions: [PERMISSIONS.ORDERS_READ_ALL, PERMISSIONS.FLEET_MANAGE],
        }),
        assignedDriverId: 'driver-1',
        photoType: OrderPhotoType.DELIVERY,
        photoCount: 0,
        overrideReason: 'Customer unavailable',
      }),
    ).toEqual({ opsOverride: true, skippedProof: true });
  });
});
