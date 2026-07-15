import { BadRequestException } from '@nestjs/common';
import { OrderPhotoType } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { isFleetTripDelegate } from './order-trip.interface';

export function isAssignedDriverForOrder(
  user: AuthenticatedUser,
  assignedDriverId: string | null,
): boolean {
  return Boolean(
    user.driverId && assignedDriverId && user.driverId === assignedDriverId,
  );
}

export function assertProofPhotosForTripAdvance(input: {
  user: AuthenticatedUser;
  assignedDriverId: string | null;
  photoType: OrderPhotoType;
  photoCount: number;
  overrideReason?: string;
}): { opsOverride: boolean; skippedProof: boolean } {
  const actingAsDriver = isAssignedDriverForOrder(
    input.user,
    input.assignedDriverId,
  );
  const canOpsOverride = isFleetTripDelegate(input.user);

  if (actingAsDriver && !canOpsOverride) {
    if (input.photoCount < 1) {
      const message =
        input.photoType === OrderPhotoType.DEPARTURE
          ? 'Please upload at least one departure photo before starting the journey.'
          : 'Please upload at least one delivery photo before completing the booking.';
      throw new BadRequestException(message);
    }

    return { opsOverride: false, skippedProof: false };
  }

  if (!canOpsOverride) {
    throw new BadRequestException(
      'You are not allowed to advance this trip.',
    );
  }

  if (input.photoCount < 1) {
    const reason = input.overrideReason?.trim();
    if (!reason) {
      throw new BadRequestException(
        'Operations override requires a reason when proof photos are missing.',
      );
    }

    return { opsOverride: true, skippedProof: true };
  }

  return { opsOverride: true, skippedProof: false };
}
