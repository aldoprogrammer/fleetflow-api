import { InjectQueue } from '@nestjs/bullmq';

import {

  BadRequestException,

  ForbiddenException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { DriverStatus, NotificationType, OrderAuditAction, OrderPhotoType, OrderStatus, UserRole, VehicleType } from '@prisma/client';

import type { Queue } from 'bullmq';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import {

  DISPATCH_JOB,

  DISPATCH_QUEUE,

  type DispatchJobPayload,

} from './constants/queue.constants';

import { CreateOrderDto } from './dto/create-order.dto';
import { EstimateOrderPriceDto } from './dto/estimate-order-price.dto';
import type { OrderPhotoDto } from './dto/order-photo.dto';
import type { OrderResponseDto } from './dto/order-response.dto';
import type { TripAdvanceDto } from './dto/trip-advance.dto';

import {

  type OrderAccessContext,

  userCanReadOrder,

} from './interfaces/order-access.interface';

import {
  assertCanAdvanceTrip,
  assertValidTransition,
} from './interfaces/order-trip.interface';
import { assertProofPhotosForTripAdvance } from './interfaces/order-proof.interface';
import { PhotoStorageService } from '../storage/photo-storage.service';

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
  photos: Array<{
    id: string;
    type: OrderPhotoType;
    url: string;
    uploadedBy: string;
    createdAt: Date;
  }>;
};



@Injectable()

export class OrdersService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly pricingService: PricingService,
    private readonly notificationsService: NotificationsService,
    private readonly photoStorageService: PhotoStorageService,

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

        photos: {

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

      photos: (order.photos ?? []).map((photo) => this.mapOrderPhoto(photo)),

      departurePhotoCount: (order.photos ?? []).filter(
        (photo) => photo.type === OrderPhotoType.DEPARTURE,
      ).length,

      deliveryPhotoCount: (order.photos ?? []).filter(
        (photo) => photo.type === OrderPhotoType.DELIVERY,
      ).length,

      createdAt: order.createdAt,

    };

  }



  async uploadOrderPhoto(
    access: OrderAccessContext,
    orderId: string,
    type: OrderPhotoType,
    file: Express.Multer.File,
  ): Promise<OrderPhotoDto> {
    if (access.mode !== 'jwt' || !access.user) {
      throw new ForbiddenException('Proof photos require a signed-in user.');
    }

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

    if (
      type === OrderPhotoType.DEPARTURE &&
      order.status !== OrderStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        'Departure photos can only be uploaded before the journey starts.',
      );
    }

    if (
      type === OrderPhotoType.DELIVERY &&
      order.status !== OrderStatus.PICKED_UP
    ) {
      throw new BadRequestException(
        'Delivery photos can only be uploaded while the trip is in progress.',
      );
    }

    const url = await this.photoStorageService.uploadOrderPhoto(
      orderId,
      type,
      file,
    );

    const photo = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orderPhoto.create({
        data: {
          orderId,
          type,
          url,
          uploadedBy: access.user!.id,
        },
      });

      await this.recordAuditEvent(tx, {
        orderId,
        user: access.user!,
        action:
          type === OrderPhotoType.DEPARTURE
            ? OrderAuditAction.DEPARTURE_PHOTO_UPLOADED
            : OrderAuditAction.DELIVERY_PHOTO_UPLOADED,
        photoUrls: [url],
      });

      return created;
    });

    await this.notificationsService.broadcastOrderUpdated({
      orderId,
      merchantId: order.merchantId,
      driverId: order.assignedDriverId,
      reason: 'photos',
    });

    const actorIsAssignedDriver = Boolean(
      access.user?.driverId &&
        order.assignedDriverId &&
        access.user.driverId === order.assignedDriverId,
    );

    await this.notificationsService.notifyProofPhotoUploaded({
      orderId,
      merchantId: order.merchantId,
      driverId: order.assignedDriverId,
      photoType: type,
      actorIsAssignedDriver,
      actorUserId: access.user?.id ?? null,
    });

    return this.mapOrderPhoto(photo);
  }



  async markOrderPickedUp(
    access: OrderAccessContext,
    orderId: string,
    dto: TripAdvanceDto = {},
  ) {

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



    if (!access.user) {

      throw new ForbiddenException('Trip updates require a signed-in user.');

    }



    const departurePhotoCount = await this.prisma.orderPhoto.count({

      where: { orderId, type: OrderPhotoType.DEPARTURE },

    });



    const proofDecision = assertProofPhotosForTripAdvance({

      user: access.user,

      assignedDriverId: order.assignedDriverId,

      photoType: OrderPhotoType.DEPARTURE,

      photoCount: departurePhotoCount,

      overrideReason: dto.overrideReason,

    });



    const departurePhotos = await this.prisma.orderPhoto.findMany({

      where: { orderId, type: OrderPhotoType.DEPARTURE },

      select: { url: true },

    });



    await this.prisma.$transaction(async (tx) => {

      await tx.order.update({

        where: { id: orderId },

        data: {

          status: OrderStatus.PICKED_UP,

          timeline: {

            create: {

              status: OrderStatus.PICKED_UP,

              note: proofDecision.skippedProof

                ? `Parcel picked up — trip in progress (ops override: ${dto.overrideReason?.trim()}).`

                : 'Parcel picked up — trip in progress.',

            },

          },

        },

      });



      await this.recordAuditEvent(tx, {

        orderId,

        user: access.user!,

        action: OrderAuditAction.JOURNEY_STARTED,

        photoUrls: departurePhotos.map((photo) => photo.url),

        overrideReason: proofDecision.skippedProof

          ? dto.overrideReason?.trim()

          : undefined,

      });

    });



    await this.notificationsService.notifyTripAdvance({
      orderId,
      merchantId: order.merchantId,
      driverId: order.assignedDriverId,
      type: NotificationType.ORDER_PICKED_UP,
      title: 'Parcel picked up',
      body: 'Order is in transit to the destination.',
      actorIsAssignedDriver: Boolean(
        access.user?.driverId &&
          order.assignedDriverId &&
          access.user.driverId === order.assignedDriverId,
      ),
      actorUserId: access.user?.id ?? null,
    });

    await this.notificationsService.broadcastOrderUpdated({
      orderId,
      merchantId: order.merchantId,
      driverId: order.assignedDriverId,
      reason: 'status',
    });

    return this.getOrderById(access, orderId);

  }



  async markOrderDelivered(
    access: OrderAccessContext,
    orderId: string,
    dto: TripAdvanceDto = {},
  ) {

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



    if (!access.user) {

      throw new ForbiddenException('Trip updates require a signed-in user.');

    }



    const deliveryPhotoCount = await this.prisma.orderPhoto.count({

      where: { orderId, type: OrderPhotoType.DELIVERY },

    });



    const proofDecision = assertProofPhotosForTripAdvance({

      user: access.user,

      assignedDriverId: order.assignedDriverId,

      photoType: OrderPhotoType.DELIVERY,

      photoCount: deliveryPhotoCount,

      overrideReason: dto.overrideReason,

    });



    const deliveryPhotos = await this.prisma.orderPhoto.findMany({

      where: { orderId, type: OrderPhotoType.DELIVERY },

      select: { url: true },

    });



    await this.prisma.$transaction(async (tx) => {

      await tx.order.update({

        where: { id: orderId },

        data: {

          status: OrderStatus.DELIVERED,

          timeline: {

            create: {

              status: OrderStatus.DELIVERED,

              note: proofDecision.skippedProof

                ? `Delivery completed (ops override: ${dto.overrideReason?.trim()}).`

                : 'Delivery completed successfully.',

            },

          },

        },

      });



      await tx.driver.update({

        where: { id: order.assignedDriverId! },

        data: { status: DriverStatus.AVAILABLE },

      });



      await this.recordAuditEvent(tx, {

        orderId,

        user: access.user!,

        action: proofDecision.skippedProof

          ? OrderAuditAction.MANUAL_COMPLETION_BY_OPS

          : OrderAuditAction.BOOKING_COMPLETED,

        photoUrls: deliveryPhotos.map((photo) => photo.url),

        overrideReason: proofDecision.skippedProof

          ? dto.overrideReason?.trim()

          : undefined,

      });



      if (proofDecision.skippedProof) {

        await this.recordAuditEvent(tx, {

          orderId,

          user: access.user!,

          action: OrderAuditAction.COMPLETION_WITHOUT_PROOF_PHOTOS,

          photoUrls: [],

          overrideReason: dto.overrideReason?.trim(),

        });

      }

    });



    await this.notificationsService.notifyTripAdvance({
      orderId,
      merchantId: order.merchantId,
      driverId: order.assignedDriverId,
      type: NotificationType.ORDER_DELIVERED,
      title: 'Delivery completed',
      body: 'Booking finished successfully.',
      actorIsAssignedDriver: Boolean(
        access.user?.driverId &&
          order.assignedDriverId &&
          access.user.driverId === order.assignedDriverId,
      ),
      actorUserId: access.user?.id ?? null,
    });

    await this.notificationsService.broadcastOrderUpdated({
      orderId,
      merchantId: order.merchantId,
      driverId: order.assignedDriverId,
      reason: 'status',
    });

    return this.getOrderById(access, orderId);

  }



  private mapOrderPhoto(photo: {
    id: string;
    type: OrderPhotoType;
    url: string;
    uploadedBy: string;
    createdAt: Date;
  }): OrderPhotoDto {
    return {
      id: photo.id,
      type: photo.type,
      url: photo.url,
      uploadedBy: photo.uploadedBy,
      createdAt: photo.createdAt,
    };
  }

  private async recordAuditEvent(
    tx: {
      orderAuditEvent: {
        create: (args: {
          data: {
            orderId: string;
            userId: string;
            userRole: UserRole;
            action: OrderAuditAction;
            photoUrls: string[];
            overrideReason: string | null;
          };
        }) => Promise<unknown>;
      };
    },
    input: {
      orderId: string;
      user: AuthenticatedUser;
      action: OrderAuditAction;
      photoUrls?: string[];
      overrideReason?: string;
    },
  ): Promise<void> {
    await tx.orderAuditEvent.create({
      data: {
        orderId: input.orderId,
        userId: input.user.id,
        userRole: input.user.role as UserRole,
        action: input.action,
        photoUrls: input.photoUrls ?? [],
        overrideReason: input.overrideReason ?? null,
      },
    });
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


