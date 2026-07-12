import { VehicleType } from '@prisma/client';

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface DriverCandidate {
  id: string;
  fullName: string;
  currentLat: number;
  currentLng: number;
  vehicleType: VehicleType;
  distanceKm: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(
  origin: GeoCoordinate,
  destination: GeoCoordinate,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const deltaLatitude = toRadians(destination.latitude - origin.latitude);
  const deltaLongitude = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function findClosestDriverWithinRadius(
  pickup: GeoCoordinate,
  drivers: Array<{
    id: string;
    fullName: string;
    currentLat: number;
    currentLng: number;
    vehicleType: VehicleType;
  }>,
  radiusKm: number,
): DriverCandidate | null {
  const ranked = drivers
    .map((driver) => ({
      ...driver,
      distanceKm: haversineDistanceKm(pickup, {
        latitude: driver.currentLat,
        longitude: driver.currentLng,
      }),
    }))
    .filter((driver) => driver.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm);

  if (ranked.length === 0) {
    return null;
  }

  const closest = ranked[0];
  return {
    id: closest.id,
    fullName: closest.fullName,
    currentLat: closest.currentLat,
    currentLng: closest.currentLng,
    vehicleType: closest.vehicleType,
    distanceKm: Number(closest.distanceKm.toFixed(3)),
  };
}
