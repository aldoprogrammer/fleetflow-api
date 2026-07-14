import {
  DriverStatus,
  NotificationType,
  OrderStatus,
  TxType,
} from '@prisma/client';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISPATCH_JOB,
  DISPATCH_QUEUE,
  MATCH_RADIUS_KM,
  PLATFORM_FEE_RATE,
  type DispatchJobPayload,
} from './constants/queue.constants';
import { findClosestDriverWithinRadius } from './matching/geo-matching.service';

@Processor(DISPATCH_QUEUE)
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<DispatchJobPayload>): Promise<void> {
    if (job.name !== DISPATCH_JOB) {
      return;
    }

    const { orderId } = job.data;
    this.logger.log(`[MatchingProcessor] Processing dispatch for order ${orderId}`);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        merchant: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.MATCHING) {
      this.logger.warn(
        `[MatchingProcessor] Order ${orderId} skipped — current status ${order.status}.`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.MATCHING,
          timeline: {
            create: {
              status: OrderStatus.MATCHING,
              note: 'Driver matching engine started.',
            },
          },
        },
      });
    });

    const availableDrivers = await this.prisma.driver.findMany({
      where: {
        status: DriverStatus.AVAILABLE,
        vehicle: {
          type: order.vehicleTypeRequired,
        },
      },
      include: {
        vehicle: true,
      },
    });

    const candidate = findClosestDriverWithinRadius(
      { latitude: order.pickupLat, longitude: order.pickupLng },
      availableDrivers.map((driver) => ({
        id: driver.id,
        fullName: driver.fullName,
        currentLat: driver.currentLat,
        currentLng: driver.currentLng,
        vehicleType: driver.vehicle.type,
      })),
      MATCH_RADIUS_KM,
    );

    if (!candidate) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.CANCELLED,
            timeline: {
              create: {
                status: OrderStatus.CANCELLED,
                note: `No available ${order.vehicleTypeRequired} driver found within ${MATCH_RADIUS_KM}km.`,
              },
            },
          },
        });
      });

      this.logger.warn(
        `[MatchingProcessor] Order ${orderId} cancelled — no driver in radius.`,
      );
      await this.notificationsService.notifyOrderLifecycle({
        orderId,
        merchantId: order.merchantId,
        type: NotificationType.ORDER_CANCELLED,
        title: 'Order cancelled',
        body: `No available ${order.vehicleTypeRequired} driver within ${MATCH_RADIUS_KM} km.`,
        notifyDriver: false,
        notifyMerchant: true,
        notifyOps: true,
      });
      return;
    }

    const driverPayout = Number((order.price * (1 - PLATFORM_FEE_RATE)).toFixed(2));
    let assigned = false;
    let cancelledInsufficientBalance = false;

    await this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({
        where: { id: order.merchantId },
      });

      if (!merchant) {
        throw new Error(`Merchant ${order.merchantId} not found.`);
      }

      if (merchant.balance < order.price) {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.CANCELLED,
            timeline: {
              create: {
                status: OrderStatus.CANCELLED,
                note: 'Order cancelled due to insufficient merchant balance at settlement.',
              },
            },
          },
        });
        cancelledInsufficientBalance = true;
        return;
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.ASSIGNED,
          assignedDriverId: candidate.id,
          matchDistanceKm: candidate.distanceKm,
          timeline: {
            create: {
              status: OrderStatus.ASSIGNED,
              note: `Driver ${candidate.fullName} assigned (${candidate.distanceKm} km from pickup).`,
            },
          },
        },
      });

      await tx.driver.update({
        where: { id: candidate.id },
        data: { status: DriverStatus.ON_TRIP },
      });

      await tx.merchant.update({
        where: { id: order.merchantId },
        data: {
          balance: {
            decrement: order.price,
          },
        },
      });

      await tx.transaction.create({
        data: {
          merchantId: order.merchantId,
          amount: order.price,
          type: TxType.DEBIT,
          description: `Dispatch charge for order ${orderId}`,
        },
      });

      await tx.transaction.create({
        data: {
          driverId: candidate.id,
          amount: driverPayout,
          type: TxType.CREDIT,
          description: `Driver payout (90%) for order ${orderId}`,
        },
      });

      assigned = true;
    });

    if (cancelledInsufficientBalance) {
      await this.notificationsService.notifyOrderLifecycle({
        orderId,
        merchantId: order.merchantId,
        type: NotificationType.ORDER_CANCELLED,
        title: 'Order cancelled',
        body: 'Insufficient merchant balance at settlement.',
        notifyDriver: false,
        notifyMerchant: true,
        notifyOps: true,
      });
      return;
    }

    if (assigned) {
      await this.notificationsService.notifyOrderAssigned({
        orderId,
        merchantId: order.merchantId,
        driverId: candidate.id,
        driverName: candidate.fullName,
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress,
        distanceKm: candidate.distanceKm,
      });

      this.logger.log(
        `[MatchingProcessor] Order ${orderId} assigned to driver ${candidate.fullName}.`,
      );
    }
  }
}
