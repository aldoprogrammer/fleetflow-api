import { InjectQueue } from '@nestjs/bullmq';

import {

  BadRequestException,

  ForbiddenException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { DriverStatus, OrderStatus, UserRole, VehicleType } from '@prisma/client';

import type { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

import {

  DISPATCH_JOB,

  DISPATCH_QUEUE,

  type DispatchJobPayload,

} from './constants/queue.constants';

import { CreateOrderDto } from './dto/create-order.dto';
import { EstimateOrderPriceDto } from './dto/estimate-order-price.dto';
import type { OrderResponseDto } from './dto/order-response.dto';

import {

  type OrderAccessContext,

  userCanReadOrder,

} from './interfaces/order-access.interface';

import {
  assertCanAdvanceTrip,
  assertValidTransition,
} from './interfaces/order-trip.interface';

import { PERMISSIONS } from '@fleetflow/shared';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PricingService } from './pricing/pricing.service';
import { haversineDistanceKm } from './matching/geo-matching.service';
import {
  formatOrderReference,
  formatOrderTitle,
  resolveOrderPaymentStatus,
} from './order-display.util';

type OrderPartyRecord = {
  displayName: string;
  email: string;
  role: UserRole;
};

type OrderDetailRecord = {
  id: string;
  merchantId: string;
  vehicleTypeRequired: VehicleType;
  packageDescription: string | null;
  packageWeightKg: number | null;
  pickupAddress: string;
  deliveryAddress: string;
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  status: OrderStatus;
  price: number;
  matchDistanceKm: number | null;
  createdAt: Date;
  merchant: {
    id: string;
    companyName: string;
    email: string;
    users: OrderPartyRecord[];
  };
  createdBy: OrderPartyRecord | null;
  assignedDriver: {
    id: string;
    fullName: string;
    phone: string;
    currentLat: number;
    currentLng: number;
    vehicle: { type: VehicleType };
  } | null;
  timeline: Array<{
    id: string;
    status: OrderStatus;
    note: string;
    createdAt: Date;
  }>;
};



@Injectable()

export class OrdersService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly pricingService: PricingService,

    @InjectQueue(DISPATCH_QUEUE)

    private readonly dispatchQueue: Queue<DispatchJobPayload>,

  ) {}



  async createOrder(access: OrderAccessContext, dto: CreateOrderDto) {

    const merchantId = this.resolveMerchantIdForCreate(access, dto);



    const merchant = await this.prisma.merchant.findUnique({

      where: { id: merchantId },

      select: {

        id: true,

        companyName: true,

        email: true,

        balance: true,

        apiKey: true,

        createdAt: true,

      },

    });



    if (!merchant) {

      throw new BadRequestException('Merchant account is not linked.');

    }



    const price = this.pricingService.calculateOrderPrice({

      vehicleTypeRequired: dto.vehicleTypeRequired,

      pickupLat: dto.pickupLat,

      pickupLng: dto.pickupLng,

      deliveryLat: dto.deliveryLat,

      deliveryLng: dto.deliveryLng,

    });



    if (merchant.balance < price) {

      throw new BadRequestException(

        `Insufficient merchant balance. Required ${price}, available ${merchant.balance}.`,

      );

    }



    const order = await this.prisma.$transaction(async (tx) => {

      const created = await tx.order.create({

        data: {

          merchantId: merchant.id,

          vehicleTypeRequired: dto.vehicleTypeRequired,

          pickupAddress: dto.pickupAddress.trim(),

          deliveryAddress: dto.deliveryAddress.trim(),

          pickupLat: dto.pickupLat,

          pickupLng: dto.pickupLng,

          deliveryLat: dto.deliveryLat,

          deliveryLng: dto.deliveryLng,

          packageDescription: dto.packageDescription?.trim() || null,

          packageWeightKg: dto.packageWeightKg ?? null,

          createdByUserId:
            access.mode === 'jwt' && access.user ? access.user.id : null,

          status: OrderStatus.DRAFT,

          price,

          timeline: {

            create: {

              status: OrderStatus.DRAFT,

              note: 'Order draft created and priced.',

            },

          },

        },

        include: {

          timeline: {

            orderBy: { createdAt: 'asc' },

          },

          assignedDriver: {

            include: { vehicle: true },

          },

        },

      });



      await tx.order.update({

        where: { id: created.id },

        data: {

          status: OrderStatus.PENDING,

          timeline: {

            create: {

              status: OrderStatus.PENDING,

              note: 'Order queued for driver matching.',

            },

          },

        },

      });



      return created;

    });



    const jobPayload: DispatchJobPayload = {

      orderId: order.id,

      merchantId: merchant.id,

      enqueuedAt: new Date().toISOString(),

    };



    await this.dispatchQueue.add(DISPATCH_JOB, jobPayload, {

      jobId: `dispatch-order-${order.id}`,

      removeOnComplete: true,

      removeOnFail: false,

      attempts: 3,

      backoff: {

        type: 'exponential',

        delay: 2000,

      },

    });



    return this.getOrderById(access, order.id);

  }



  estimateOrderPrice(dto: EstimateOrderPriceDto) {
    const distanceKm = haversineDistanceKm(
      { latitude: dto.pickupLat, longitude: dto.pickupLng },
      { latitude: dto.deliveryLat, longitude: dto.deliveryLng },
    );

    const price = this.pricingService.calculateOrderPrice({
      vehicleTypeRequired: dto.vehicleTypeRequired,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      deliveryLat: dto.deliveryLat,
      deliveryLng: dto.deliveryLng,
    });

    return {
      price,
      distanceKm: Number(distanceKm.toFixed(3)),
      currency: 'IDR' as const,
    };
  }



  async listOrders(access: OrderAccessContext) {
    const where = this.buildOrderListWhere(access);

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        merchant: { select: { companyName: true } },
        assignedDriver: { select: { fullName: true } },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      merchantId: order.merchantId,
      merchantName: order.merchant.companyName,
      vehicleTypeRequired: order.vehicleTypeRequired,
      pickupAddress: order.pickupAddress,
      deliveryAddress: order.deliveryAddress,
      status: order.status,
      price: order.price,
      assignedDriverName: order.assignedDriver?.fullName ?? null,
      createdAt: order.createdAt,
    }));
  }



  async getOrderById(access: OrderAccessContext, orderId: string) {

    const order = await this.prisma.order.findUnique({

      where: { id: orderId },

      include: {

        merchant: {

          select: {

            id: true,

            companyName: true,

            email: true,

            users: {

              where: { role: 'MERCHANT_ADMIN', isActive: true },

              take: 1,

              select: {

                displayName: true,

                email: true,

                role: true,

              },

            },

          },

        },

        createdBy: {

          select: {

            displayName: true,

            email: true,

            role: true,

          },

        },

        timeline: {

          orderBy: { createdAt: 'asc' },

        },

        assignedDriver: {

          include: {

            vehicle: true,

          },

        },

      },

    });



    if (!order) {

      throw new NotFoundException(`Order ${orderId} not found.`);

    }



    if (!userCanReadOrder(access, order)) {

      throw new ForbiddenException('You are not allowed to view this order.');

    }



    return this.mapOrderToResponse(order as OrderDetailRecord);

  }



  private mapOrderToResponse(order: OrderDetailRecord): OrderResponseDto {

    const distanceKm = Number(
      haversineDistanceKm(
        { latitude: order.pickupLat, longitude: order.pickupLng },
        { latitude: order.deliveryLat, longitude: order.deliveryLng },
      ).toFixed(3),
    );

    const merchantContact = order.merchant.users[0] ?? null;

    return {

      id: order.id,

      referenceCode: formatOrderReference(order.id),

      displayTitle: formatOrderTitle({

        packageDescription: order.packageDescription,

        deliveryAddress: order.deliveryAddress,

      }),

      merchantId: order.merchantId,

      merchant: {

        id: order.merchant.id,

        companyName: order.merchant.companyName,

        email: order.merchant.email,

      },

      merchantContact,

      createdBy: order.createdBy,

      vehicleTypeRequired: order.vehicleTypeRequired,

      packageDescription: order.packageDescription,

      packageWeightKg: order.packageWeightKg,

      pickupAddress: order.pickupAddress,

      deliveryAddress: order.deliveryAddress,

      pickupLat: order.pickupLat,

      pickupLng: order.pickupLng,

      deliveryLat: order.deliveryLat,

      deliveryLng: order.deliveryLng,

      distanceKm,

      status: order.status,

      paymentStatus: resolveOrderPaymentStatus(order.status),

      price: order.price,

      matchDistanceKm: order.matchDistanceKm,

      assignedDriver: order.assignedDriver

        ? {

            id: order.assignedDriver.id,

            fullName: order.assignedDriver.fullName,

            phone: order.assignedDriver.phone,

            vehicleType: order.assignedDriver.vehicle.type,

            currentLat: order.assignedDriver.currentLat,

            currentLng: order.assignedDriver.currentLng,

          }

        : null,

      timeline: order.timeline,

      createdAt: order.createdAt,

    };

  }



  async markOrderPickedUp(access: OrderAccessContext, orderId: string) {

    const order = await this.prisma.order.findUnique({

      where: { id: orderId },

      select: {

        id: true,

        status: true,

        assignedDriverId: true,

        merchantId: true,

      },

    });



    if (!order) {

      throw new NotFoundException(`Order ${orderId} not found.`);

    }



    if (!userCanReadOrder(access, order)) {

      throw new ForbiddenException('You are not allowed to view this order.');

    }



    assertCanAdvanceTrip(access, order);

    assertValidTransition(

      order.status,

      OrderStatus.ASSIGNED,

      OrderStatus.PICKED_UP,

    );



    await this.prisma.$transaction(async (tx) => {

      await tx.order.update({

        where: { id: orderId },

        data: {

          status: OrderStatus.PICKED_UP,

          timeline: {

            create: {

              status: OrderStatus.PICKED_UP,

              note: 'Parcel picked up — trip in progress.',

            },

          },

        },

      });

    });



    return this.getOrderById(access, orderId);

  }



  async markOrderDelivered(access: OrderAccessContext, orderId: string) {

    const order = await this.prisma.order.findUnique({

      where: { id: orderId },

      select: {

        id: true,

        status: true,

        assignedDriverId: true,

        merchantId: true,

      },

    });



    if (!order) {

      throw new NotFoundException(`Order ${orderId} not found.`);

    }



    if (!userCanReadOrder(access, order)) {

      throw new ForbiddenException('You are not allowed to view this order.');

    }



    assertCanAdvanceTrip(access, order);

    assertValidTransition(

      order.status,

      OrderStatus.PICKED_UP,

      OrderStatus.DELIVERED,

    );



    if (!order.assignedDriverId) {

      throw new BadRequestException('Order has no assigned driver.');

    }



    await this.prisma.$transaction(async (tx) => {

      await tx.order.update({

        where: { id: orderId },

        data: {

          status: OrderStatus.DELIVERED,

          timeline: {

            create: {

              status: OrderStatus.DELIVERED,

              note: 'Delivery completed successfully.',

            },

          },

        },

      });



      await tx.driver.update({

        where: { id: order.assignedDriverId! },

        data: { status: DriverStatus.AVAILABLE },

      });

    });



    return this.getOrderById(access, orderId);

  }



  private resolveMerchantIdForCreate(
    access: OrderAccessContext,
    dto: CreateOrderDto,
  ): string {
    if (access.mode === 'api_key' && access.merchant) {
      return access.merchant.id;
    }

    if (access.mode === 'jwt' && access.user) {
      const user = access.user;

      if (!user.permissions.includes(PERMISSIONS.ORDERS_CREATE)) {
        throw new ForbiddenException(
          'Insufficient permissions to create orders.',
        );
      }

      if (user.merchantId) {
        if (dto.merchantId && dto.merchantId !== user.merchantId) {
          throw new ForbiddenException(
            'Cannot create orders for another merchant account.',
          );
        }

        return user.merchantId;
      }

      if (dto.merchantId && this.canDelegateMerchantContext(user)) {
        return dto.merchantId;
      }
    }

    throw new ForbiddenException(
      'Merchant context is required to create orders.',
    );
  }

  private canDelegateMerchantContext(user: AuthenticatedUser): boolean {
    return (
      user.permissions.includes(PERMISSIONS.MERCHANTS_MANAGE) ||
      user.permissions.includes(PERMISSIONS.ORDERS_READ_ALL)
    );
  }

  private buildOrderListWhere(
    access: OrderAccessContext,
  ): { merchantId?: string; assignedDriverId?: string } {
    if (access.mode === 'api_key' && access.merchant) {
      return { merchantId: access.merchant.id };
    }

    const user = access.user;
    if (!user) {
      throw new ForbiddenException('Authentication is required.');
    }

    if (user.permissions.includes(PERMISSIONS.ORDERS_READ_ALL)) {
      return {};
    }

    if (
      user.permissions.includes(PERMISSIONS.ORDERS_READ_OWN) &&
      user.merchantId
    ) {
      return { merchantId: user.merchantId };
    }

    if (
      user.permissions.includes(PERMISSIONS.ORDERS_READ_ASSIGNED) &&
      user.driverId
    ) {
      return { assignedDriverId: user.driverId };
    }

    throw new ForbiddenException('You are not allowed to list orders.');
  }

}


