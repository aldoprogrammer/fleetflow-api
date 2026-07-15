import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  DELIVER_NOTIFICATION_JOB,
  NOTIFICATION_QUEUE,
  type DeliverNotificationJobPayload,
} from './constants/notification-queue.constants';
import { NotificationRealtimeService } from './notification-realtime.service';
import type { OrderUpdateReason } from './constants/realtime-event.types';
import { formatOrderReference } from '../orders/order-display.util';

const OPS_ROLES: UserRole[] = [
  UserRole.SUPERADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.HEAD_OF_WAREHOUSE,
  UserRole.FLEET_OPERATOR,
];

export interface OrderLifecycleNotifyInput {
  orderId: string;
  merchantId: string;
  driverId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  /** Defaults: merchant+ops always; driver when driverId set. */
  notifyDriver?: boolean;
  notifyMerchant?: boolean;
  notifyOps?: boolean;
  /** Never notify this user (the actor who just changed status). */
  excludeUserId?: string | null;
}

export interface NotifyTripAdvanceInput {
  orderId: string;
  merchantId: string;
  driverId: string | null;
  type: 'ORDER_PICKED_UP' | 'ORDER_DELIVERED';
  title: string;
  body: string;
  /**
   * When the assigned driver advances the trip → notify web (merchant/ops) only.
   * When ops/merchant advances from web → notify the driver app only.
   */
  actorIsAssignedDriver: boolean;
  actorUserId?: string | null;
}

/** @deprecated Prefer notifyOrderLifecycle */
export interface NotifyOrderAssignedInput {
  orderId: string;
  driverId: string;
  driverName: string;
  pickupAddress: string;
  deliveryAddress: string;
  distanceKm: number;
  merchantId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue<DeliverNotificationJobPayload>,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  async notifyOrderAssigned(input: NotifyOrderAssignedInput): Promise<void> {
    const body = `${input.driverName} assigned (${input.distanceKm.toFixed(1)} km). ${input.pickupAddress} → ${input.deliveryAddress}`;

    await this.notifyOrderLifecycle({
      orderId: input.orderId,
      merchantId: input.merchantId,
      driverId: input.driverId,
      type: NotificationType.ORDER_ASSIGNED,
      title: 'New trip assigned',
      body,
      notifyDriver: true,
      notifyMerchant: false,
      notifyOps: false,
    });

    await this.notifyOrderLifecycle({
      orderId: input.orderId,
      merchantId: input.merchantId,
      driverId: input.driverId,
      type: NotificationType.ORDER_ASSIGNED,
      title: 'Driver assigned',
      body,
      notifyDriver: false,
      notifyMerchant: true,
      notifyOps: true,
    });
  }

  async notifyTripAdvance(input: NotifyTripAdvanceInput): Promise<void> {
    // Always fan out to driver + merchant + ops so web and mobile stay in sync.
    // Exclude only the actor (they already see the UI update from the API response).
    await this.notifyOrderLifecycle({
      orderId: input.orderId,
      merchantId: input.merchantId,
      driverId: input.driverId,
      type: input.type,
      title: input.title,
      body: input.body,
      notifyDriver: true,
      notifyMerchant: true,
      notifyOps: true,
      excludeUserId: input.actorUserId,
    });
  }

  /**
   * Proof photo uploaded — notify the other side (web ↔ driver) so galleries
   * and bells update in realtime.
   */
  async notifyProofPhotoUploaded(input: {
    orderId: string;
    merchantId: string;
    driverId: string | null;
    photoType: 'DEPARTURE' | 'DELIVERY';
    actorIsAssignedDriver: boolean;
    actorUserId?: string | null;
  }): Promise<void> {
    const ref = formatOrderReference(input.orderId);
    const isDeparture = input.photoType === 'DEPARTURE';
    const type = isDeparture
      ? NotificationType.DEPARTURE_PHOTO_UPLOADED
      : NotificationType.DELIVERY_PHOTO_UPLOADED;
    const title = isDeparture
      ? 'New before-pickup photo'
      : 'New after-delivery photo';
    const body = isDeparture
      ? `Booking ${ref} has a new departure (before pickup) proof photo.`
      : `Booking ${ref} has a new delivery (after delivery) proof photo.`;

    if (input.actorIsAssignedDriver) {
      await this.notifyOrderLifecycle({
        orderId: input.orderId,
        merchantId: input.merchantId,
        driverId: input.driverId,
        type,
        title,
        body,
        notifyDriver: false,
        notifyMerchant: true,
        notifyOps: true,
        excludeUserId: input.actorUserId,
      });
      return;
    }

    await this.notifyOrderLifecycle({
      orderId: input.orderId,
      merchantId: input.merchantId,
      driverId: input.driverId,
      type,
      title,
      body,
      notifyDriver: true,
      notifyMerchant: true,
      notifyOps: true,
      excludeUserId: input.actorUserId,
    });
  }

  async notifyOrderLifecycle(input: OrderLifecycleNotifyInput): Promise<void> {
    const notifyDriver = input.notifyDriver ?? Boolean(input.driverId);
    const notifyMerchant = input.notifyMerchant ?? true;
    const notifyOps = input.notifyOps ?? true;

    const recipientIds = new Set<string>();

    if (notifyDriver && input.driverId) {
      const drivers = await this.prisma.user.findMany({
        where: { driverId: input.driverId, isActive: true },
        select: { id: true },
      });
      for (const user of drivers) {
        recipientIds.add(user.id);
      }
    }

    if (notifyMerchant) {
      const merchants = await this.prisma.user.findMany({
        where: { merchantId: input.merchantId, isActive: true },
        select: { id: true },
      });
      for (const user of merchants) {
        recipientIds.add(user.id);
      }
    }

    if (notifyOps) {
      const ops = await this.prisma.user.findMany({
        where: { role: { in: OPS_ROLES }, isActive: true },
        select: { id: true },
      });
      for (const user of ops) {
        recipientIds.add(user.id);
      }
    }

    if (input.excludeUserId) {
      recipientIds.delete(input.excludeUserId);
    }

    if (recipientIds.size === 0) {
      this.logger.warn(
        `No recipients for ${input.type} on order ${input.orderId}`,
      );
      return;
    }

    for (const userId of recipientIds) {
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          driverId: input.driverId ?? null,
          orderId: input.orderId,
          type: input.type,
          title: input.title,
          body: input.body,
        },
      });

      await this.notificationQueue.add(
        DELIVER_NOTIFICATION_JOB,
        {
          notificationId: notification.id,
          userId,
          driverId: input.driverId ?? null,
          orderId: input.orderId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt.toISOString(),
        },
        {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    }

    this.logger.log(
      `[Notifications] ${input.type} → ${recipientIds.size} user(s) for order ${input.orderId}`,
    );
  }

  async broadcastOrderUpdated(input: {
    orderId: string;
    merchantId: string;
    driverId: string | null;
    reason: OrderUpdateReason;
  }): Promise<void> {
    const recipientIds = await this.resolveOrderStakeholderUserIds({
      merchantId: input.merchantId,
      driverId: input.driverId,
    });

    const updatedAt = new Date().toISOString();
    for (const userId of recipientIds) {
      await this.realtime.publishOrderUpdated(userId, {
        orderId: input.orderId,
        merchantId: input.merchantId,
        driverId: input.driverId,
        reason: input.reason,
        updatedAt,
      });
    }

    this.logger.debug(
      `[Realtime] order.updated (${input.reason}) → ${recipientIds.size} user(s) for order ${input.orderId}`,
    );
  }

  private async resolveOrderStakeholderUserIds(input: {
    merchantId: string;
    driverId: string | null;
  }): Promise<Set<string>> {
    const recipientIds = new Set<string>();

    if (input.driverId) {
      const drivers = await this.prisma.user.findMany({
        where: { driverId: input.driverId, isActive: true },
        select: { id: true },
      });
      for (const user of drivers) {
        recipientIds.add(user.id);
      }
    }

    const merchants = await this.prisma.user.findMany({
      where: { merchantId: input.merchantId, isActive: true },
      select: { id: true },
    });
    for (const user of merchants) {
      recipientIds.add(user.id);
    }

    const ops = await this.prisma.user.findMany({
      where: { role: { in: OPS_ROLES }, isActive: true },
      select: { id: true },
    });
    for (const user of ops) {
      recipientIds.add(user.id);
    }

    return recipientIds;
  }

  async listForUser(
    userId: string,
    options?: { unreadOnly?: boolean },
  ): Promise<
    Array<{
      id: string;
      type: NotificationType;
      title: string;
      body: string;
      orderId: string | null;
      readAt: Date | null;
      createdAt: Date;
    }>
  > {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(options?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        orderId: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Notification not found.');
    }

    if (existing.readAt) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}

@Processor(NOTIFICATION_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);

  constructor(private readonly realtime: NotificationRealtimeService) {
    super();
  }

  async process(job: Job<DeliverNotificationJobPayload>): Promise<void> {
    if (job.name !== DELIVER_NOTIFICATION_JOB) {
      return;
    }

    await this.realtime.publish(job.data);
    this.logger.log(
      `[NotificationDelivery] Delivered ${job.data.notificationId} to user ${job.data.userId}`,
    );
  }
}
