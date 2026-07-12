import { Injectable } from '@nestjs/common';
import { DriverStatus, OrderStatus } from '@prisma/client';
import { MATCH_RADIUS_KM } from '../orders/constants/queue.constants';
import { PrismaService } from '../prisma/prisma.service';

export interface DriverSummary {
  id: string;
  fullName: string;
  phone: string;
  status: DriverStatus;
  currentLat: number;
  currentLng: number;
  vehicleType: string;
  plateNumber: string;
}

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [drivers, orderGroups] = await Promise.all([
      this.prisma.driver.findMany({
        include: { vehicle: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const driverStatus = {
      available: drivers.filter((d) => d.status === DriverStatus.AVAILABLE).length,
      onTrip: drivers.filter((d) => d.status === DriverStatus.ON_TRIP).length,
      offline: drivers.filter((d) => d.status === DriverStatus.OFFLINE).length,
    };

    const orderStatus = Object.fromEntries(
      orderGroups.map((group) => [group.status, group._count._all]),
    ) as Partial<Record<OrderStatus, number>>;

    const activeDispatch =
      (orderStatus.PENDING ?? 0) +
      (orderStatus.MATCHING ?? 0) +
      (orderStatus.ASSIGNED ?? 0);

    return {
      matchRadiusKm: MATCH_RADIUS_KM,
      driverStatus,
      orderStatus,
      activeDispatch,
      drivers: drivers.map((driver) => this.toDriverSummary(driver)),
    };
  }

  async listDrivers(): Promise<DriverSummary[]> {
    const drivers = await this.prisma.driver.findMany({
      include: { vehicle: true },
      orderBy: { fullName: 'asc' },
    });

    return drivers.map((driver) => this.toDriverSummary(driver));
  }

  private toDriverSummary(driver: {
    id: string;
    fullName: string;
    phone: string;
    status: DriverStatus;
    currentLat: number;
    currentLng: number;
    vehicle: { type: string; plateNumber: string };
  }): DriverSummary {
    return {
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      status: driver.status,
      currentLat: driver.currentLat,
      currentLng: driver.currentLng,
      vehicleType: driver.vehicle.type,
      plateNumber: driver.vehicle.plateNumber,
    };
  }
}
