import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus, VehicleType } from '@prisma/client';
import type { Queue } from 'bullmq';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing/pricing.service';
import { getPermissionsForRole } from '@fleetflow/shared';
import type { OrderAccessContext } from './interfaces/order-access.interface';

describe('OrdersService', () => {
  const merchant = {
    id: 'merchant-1',
    companyName: 'Acme',
    email: 'dispatch@acme-commerce.id',
    balance: 5000000,
    apiKey: 'key',
    createdAt: new Date(),
  };

  const createOrderDto = {
    vehicleTypeRequired: VehicleType.BIKE,
    pickupAddress: 'Jl. Thamrin No. 1, Jakarta Pusat',
    deliveryAddress: 'Jl. Sudirman No. 52, Jakarta Selatan',
    pickupLat: -6.2,
    pickupLng: 106.816666,
    deliveryLat: -6.17511,
    deliveryLng: 106.865036,
  };

  const prisma = {
    merchant: {
      findUnique: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const pricingService = {
    calculateOrderPrice: jest.fn().mockReturnValue(48250),
  };

  const dispatchQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  const service = new OrdersService(
    prisma as unknown as PrismaService,
    pricingService as unknown as PricingService,
    dispatchQueue as unknown as Queue,
  );

  const merchantAccess: OrderAccessContext = {
    mode: 'jwt',
    user: {
      id: 'user-1',
      email: 'merchant.admin@acme-commerce.id',
      displayName: 'Merchant Admin',
      role: 'MERCHANT_ADMIN',
      merchantId: 'merchant-1',
      driverId: null,
      permissions: ['orders:create', 'orders:read:own'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.merchant.findUnique.mockResolvedValue(merchant);
  });

  it('rejects create when merchant balance is insufficient', async () => {
    prisma.merchant.findUnique.mockResolvedValue({
      ...merchant,
      balance: 1000,
    });

    await expect(
      service.createOrder(merchantAccess, createOrderDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects merchant creating order for another merchant', async () => {
    await expect(
      service.createOrder(merchantAccess, {
        ...createOrderDto,
        merchantId: 'merchant-2',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires merchant context for platform user without delegation', async () => {
    const superadminAccess: OrderAccessContext = {
      mode: 'jwt',
      user: {
        id: 'user-sa',
        email: 'superadmin@fleetflow.dev',
        displayName: 'Super Admin',
        role: 'SUPERADMIN',
        merchantId: null,
        driverId: null,
        permissions: [...getPermissionsForRole('SUPERADMIN')],
      },
    };

    await expect(
      service.createOrder(superadminAccess, createOrderDto),
    ).rejects.toThrow('Merchant context is required');
  });

  it('allows superadmin to delegate merchantId', async () => {
    const orderId = 'order-created';
    const superadminAccess: OrderAccessContext = {
      mode: 'jwt',
      user: {
        id: 'user-sa',
        email: 'superadmin@fleetflow.dev',
        displayName: 'Super Admin',
        role: 'SUPERADMIN',
        merchantId: null,
        driverId: null,
        permissions: [...getPermissionsForRole('SUPERADMIN')],
      },
    };

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        order: {
          create: jest.fn().mockResolvedValue({
            id: orderId,
            merchantId: merchant.id,
            status: OrderStatus.DRAFT,
            price: 48250,
            timeline: [],
            assignedDriver: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      merchantId: merchant.id,
      assignedDriverId: null,
      status: OrderStatus.PENDING,
      vehicleTypeRequired: VehicleType.BIKE,
      packageDescription: null,
      packageWeightKg: null,
      pickupAddress: createOrderDto.pickupAddress,
      deliveryAddress: createOrderDto.deliveryAddress,
      pickupLat: createOrderDto.pickupLat,
      pickupLng: createOrderDto.pickupLng,
      deliveryLat: createOrderDto.deliveryLat,
      deliveryLng: createOrderDto.deliveryLng,
      price: 48250,
      matchDistanceKm: null,
      createdAt: new Date(),
      timeline: [],
      assignedDriver: null,
      merchant: {
        id: merchant.id,
        companyName: merchant.companyName,
        email: merchant.email,
        users: [],
      },
      createdBy: null,
    });

    const result = await service.createOrder(superadminAccess, {
      ...createOrderDto,
      merchantId: merchant.id,
    });

    expect(dispatchQueue.add).toHaveBeenCalled();
    expect(result.id).toBe(orderId);
  });

  it('forbids reading order outside merchant scope', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-2',
      merchantId: 'merchant-2',
      assignedDriverId: null,
      timeline: [],
      assignedDriver: null,
    });

    await expect(
      service.getOrderById(merchantAccess, 'order-2'),
    ).rejects.toThrow(ForbiddenException);
  });

  const driverAccess: OrderAccessContext = {
    mode: 'jwt',
    user: {
      id: 'user-driver',
      email: 'driver.partner@fleetflow.dev',
      displayName: 'Alex Rivera',
      role: 'DRIVER_PARTNER',
      merchantId: null,
      driverId: 'driver-1',
      permissions: ['orders:read:assigned'],
    },
  };

  const fullOrder = {
    id: 'order-trip',
    merchantId: 'merchant-1',
    assignedDriverId: 'driver-1',
    status: OrderStatus.ASSIGNED,
    vehicleTypeRequired: VehicleType.BIKE,
    packageDescription: '2 boxes electronics',
    packageWeightKg: 4.5,
    pickupAddress: createOrderDto.pickupAddress,
    deliveryAddress: createOrderDto.deliveryAddress,
    pickupLat: createOrderDto.pickupLat,
    pickupLng: createOrderDto.pickupLng,
    deliveryLat: createOrderDto.deliveryLat,
    deliveryLng: createOrderDto.deliveryLng,
    price: 48250,
    matchDistanceKm: 1.2,
    createdAt: new Date(),
    timeline: [],
    merchant: {
      id: 'merchant-1',
      companyName: 'Acme',
      email: 'dispatch@acme-commerce.id',
      users: [
        {
          displayName: 'Merchant Admin',
          email: 'merchant.admin@acme-commerce.id',
          role: 'MERCHANT_ADMIN',
        },
      ],
    },
    createdBy: {
      displayName: 'Merchant Admin',
      email: 'merchant.admin@acme-commerce.id',
      role: 'MERCHANT_ADMIN',
    },
    assignedDriver: {
      id: 'driver-1',
      fullName: 'Alex Rivera',
      phone: '+628123450001',
      vehicle: { type: VehicleType.BIKE },
    },
  };

  it('marks order picked up when driver is assigned', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({
        id: fullOrder.id,
        status: OrderStatus.ASSIGNED,
        assignedDriverId: 'driver-1',
        merchantId: 'merchant-1',
      })
      .mockResolvedValueOnce(fullOrder);

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        order: { update: jest.fn().mockResolvedValue({}) },
      };
      return callback(tx);
    });

    const result = await service.markOrderPickedUp(driverAccess, fullOrder.id);
    expect(result.id).toBe(fullOrder.id);
  });

  it('marks order delivered and frees driver', async () => {
    const deliveredOrder = {
      ...fullOrder,
      status: OrderStatus.DELIVERED,
    };

    prisma.order.findUnique
      .mockResolvedValueOnce({
        id: fullOrder.id,
        status: OrderStatus.PICKED_UP,
        assignedDriverId: 'driver-1',
        merchantId: 'merchant-1',
      })
      .mockResolvedValueOnce(deliveredOrder);

    const driverUpdate = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        order: { update: jest.fn().mockResolvedValue({}) },
        driver: { update: driverUpdate },
      };
      return callback(tx);
    });

    const result = await service.markOrderDelivered(driverAccess, fullOrder.id);
    expect(result.status).toBe(OrderStatus.DELIVERED);
    expect(driverUpdate).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { status: 'AVAILABLE' },
    });
  });

  it('rejects pickup from merchant admin', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: fullOrder.id,
      status: OrderStatus.ASSIGNED,
      assignedDriverId: 'driver-1',
      merchantId: 'merchant-1',
    });

    await expect(
      service.markOrderPickedUp(merchantAccess, fullOrder.id),
    ).rejects.toThrow(ForbiddenException);
  });
});
