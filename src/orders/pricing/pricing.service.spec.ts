import { VehicleType } from '@prisma/client';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const service = new PricingService();

  it('prices BIKE orders using base fare and per-km rate', () => {
    const price = service.calculateOrderPrice({
      vehicleTypeRequired: VehicleType.BIKE,
      pickupLat: -6.2,
      pickupLng: 106.816666,
      deliveryLat: -6.17511,
      deliveryLng: 106.865036,
    });

    expect(price).toBeGreaterThan(15000);
  });

  it('prices TRUCK orders higher than CAR orders for same route', () => {
    const input = {
      pickupLat: -6.2,
      pickupLng: 106.816666,
      deliveryLat: -6.17511,
      deliveryLng: 106.865036,
    };

    const carPrice = service.calculateOrderPrice({
      ...input,
      vehicleTypeRequired: VehicleType.CAR,
    });
    const truckPrice = service.calculateOrderPrice({
      ...input,
      vehicleTypeRequired: VehicleType.TRUCK,
    });

    expect(truckPrice).toBeGreaterThan(carPrice);
  });
});
