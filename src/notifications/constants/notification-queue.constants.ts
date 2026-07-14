export const NOTIFICATION_QUEUE = 'notification-queue' as const;

export const DELIVER_NOTIFICATION_JOB = 'deliver-notification' as const;

export const notificationUserChannel = (userId: string): string =>
  `fleetflow:notifications:user:${userId}`;

export interface DeliverNotificationJobPayload {
  notificationId: string;
  userId: string;
  driverId: string | null;
  orderId: string | null;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}
