import { Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { haversineDistanceKm } from '../matching/geo-matching.service';

const BASE_FARE: Record<VehicleType, number> = {
  [VehicleType.BIKE]: 15000,
  [VehicleType.CAR]: 35000,
  [VehicleType.TRUCK]: 90000,
};

const PER_KM_RATE: Record<VehicleType, number> = {
  [VehicleType.BIKE]: 2500,
  [VehicleType.CAR]: 4500,
  [VehicleType.TRUCK]: 9000,
};

@Injectable()
export class PricingService {
  calculateOrderPrice(input: {
    vehicleTypeRequired: VehicleType;
    pickupLat: number;
    pickupLng: number;
    deliveryLat: number;
    deliveryLng: number;
  }): number {
    const distanceKm = haversineDistanceKm(
      { latitude: input.pickupLat, longitude: input.pickupLng },
      { latitude: input.deliveryLat, longitude: input.deliveryLng },
    );

    const baseFare = BASE_FARE[input.vehicleTypeRequired];
    const variableFare = Math.ceil(distanceKm) * PER_KM_RATE[input.vehicleTypeRequired];
    const total = baseFare + variableFare;

    return Number(total.toFixed(2));
  }
}
