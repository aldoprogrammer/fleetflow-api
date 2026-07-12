import { DriverStatus, OrderStatus, VehicleType } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import type { DispatchJobPayload } from '../constants/queue.constants';
import { MatchingProcessor } from '../matching.processor';

function buildJob(orderId: string): Job<DispatchJobPayload> {
  return { name: 'dispatch-order', data: { orderId } } as Job<DispatchJobPayload>;
}

describe('MatchingProcessor', () => {
  const orderId = 'order-1';
  const merchantId = 'merchant-1';

  const baseOrder = {
    id: orderId,
    merchantId,
    status: OrderStatus.PENDING,
    vehicleTypeRequired: VehicleType.BIKE,
    pickupLat: -6.2,
    pickupLng: 106.816666,
    price: 50000,
    merchant: { id: merchantId, balance: 1_000_000 },
  };

  function createProcessor(overrides: {
    order?: typeof baseOrder | null;
    drivers?: Array<{
      id: string;
      fullName: string;
      currentLat: number;
      currentLng: number;
      vehicle: { type: VehicleType };
    }>;
    merchantBalance?: number;
  }) {
    const order = overrides.order === null ? null : { ...baseOrder, ...overrides.order };
    const drivers = overrides.drivers ?? [
      {
        id: 'driver-alex',
        fullName: 'Alex Rivera',
        currentLat: -6.2012,
        currentLng: 106.8175,
        vehicle: { type: VehicleType.BIKE },
      },
    ];

    const orderUpdates: unknown[] = [];
    const driverUpdates: unknown[] = [];

    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
      },
      driver: {
        findMany: jest.fn().mockResolvedValue(drivers),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = {
          order: {
            update: jest.fn(async (args: unknown) => {
              orderUpdates.push(args);
            }),
          },
          merchant: {
            findUnique: jest.fn().mockResolvedValue({
              id: merchantId,
              balance: overrides.merchantBalance ?? 1_000_000,
            }),
            update: jest.fn().mockResolvedValue({}),
          },
          driver: {
            update: jest.fn(async (args: unknown) => {
              driverUpdates.push(args);
            }),
          },
          transaction: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        await callback(tx);
      }),
    };

    return {
      processor: new MatchingProcessor(prisma as unknown as PrismaService),
      orderUpdates,
      driverUpdates,
    };
  }

  it('cancels when no driver is inside the 10 km radius', async () => {
    const { processor, orderUpdates } = createProcessor({ drivers: [] });

    await processor.process(buildJob(orderId));

    const cancelled = orderUpdates.find(
      (update) =>
        typeof update === 'object' &&
        update !== null &&
        'data' in update &&
        (update as { data: { status: string } }).data.status === OrderStatus.CANCELLED,
    );

    expect(cancelled).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.CANCELLED,
          timeline: expect.objectContaining({
            create: expect.objectContaining({
              note: 'No available BIKE driver found within 10km.',
            }),
          }),
        }),
      }),
    );
  });

  it('assigns closest BIKE driver and marks driver ON_TRIP', async () => {
    const { processor, orderUpdates, driverUpdates } = createProcessor({
      drivers: [
        {
          id: 'driver-far',
          fullName: 'Far Rider',
          currentLat: -6.25,
          currentLng: 106.9,
          vehicle: { type: VehicleType.BIKE },
        },
        {
          id: 'driver-near',
          fullName: 'Near Rider',
          currentLat: -6.2012,
          currentLng: 106.8175,
          vehicle: { type: VehicleType.BIKE },
        },
      ],
    });

    await processor.process(buildJob(orderId));

    const assigned = orderUpdates.find(
      (update) =>
        typeof update === 'object' &&
        update !== null &&
        'data' in update &&
        (update as { data: { status: string } }).data.status === OrderStatus.ASSIGNED,
    );

    expect(assigned).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.ASSIGNED,
          assignedDriverId: 'driver-near',
        }),
      }),
    );
    expect(driverUpdates).toContainEqual({
      where: { id: 'driver-near' },
      data: { status: DriverStatus.ON_TRIP },
    });
  });

  it('cancels when Prisma returns no matching vehicle type (CAR excluded for BIKE)', async () => {
    const { processor, orderUpdates } = createProcessor({ drivers: [] });

    await processor.process(buildJob(orderId));

    const cancelled = orderUpdates.find(
      (update) =>
        typeof update === 'object' &&
        update !== null &&
        'data' in update &&
        (update as { data: { status: string } }).data.status === OrderStatus.CANCELLED,
    );

    expect(cancelled).toBeDefined();
  });
});
