import { VehicleType } from '@prisma/client';
import {
  findClosestDriverWithinRadius,
  haversineDistanceKm,
} from './geo-matching.service';

describe('geo-matching.service', () => {
  const jakartaPickup = { latitude: -6.2, longitude: 106.816666 };

  it('calculates haversine distance between Jakarta coordinates', () => {
    const distance = haversineDistanceKm(jakartaPickup, {
      latitude: -6.17511,
      longitude: 106.865036,
    });

    expect(distance).toBeGreaterThan(5);
    expect(distance).toBeLessThan(8);
  });

  it('returns closest driver within radius', () => {
    const closest = findClosestDriverWithinRadius(
      jakartaPickup,
      [
        {
          id: 'driver-far',
          fullName: 'Far Driver',
          currentLat: -6.35,
          currentLng: 106.95,
          vehicleType: VehicleType.CAR,
        },
        {
          id: 'driver-near',
          fullName: 'Near Driver',
          currentLat: -6.2012,
          currentLng: 106.8175,
          vehicleType: VehicleType.BIKE,
        },
      ],
      10,
    );

    expect(closest?.id).toBe('driver-near');
    expect(closest?.distanceKm).toBeLessThanOrEqual(10);
  });

  it('returns null when no driver is inside radius', () => {
    const closest = findClosestDriverWithinRadius(
      jakartaPickup,
      [
        {
          id: 'driver-far',
          fullName: 'Far Driver',
          currentLat: -6.8,
          currentLng: 107.5,
          vehicleType: VehicleType.TRUCK,
        },
      ],
      10,
    );

    expect(closest).toBeNull();
  });
});
