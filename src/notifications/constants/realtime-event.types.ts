import type { DeliverNotificationJobPayload } from './notification-queue.constants';

export type OrderUpdateReason = 'status' | 'photos' | 'assigned';

export interface OrderUpdatedRealtimePayload {
  kind: 'order.updated';
  orderId: string;
  merchantId: string;
  driverId: string | null;
  reason: OrderUpdateReason;
  updatedAt: string;
}

export interface ConnectedRealtimePayload {
  kind: 'connected';
  userId: string;
}

export interface HeartbeatRealtimePayload {
  kind: 'heartbeat';
  at: string;
}

export type RealtimeEventPayload =
  | DeliverNotificationJobPayload
  | OrderUpdatedRealtimePayload
  | ConnectedRealtimePayload
  | HeartbeatRealtimePayload;

export function isNotificationPayload(
  payload: RealtimeEventPayload,
): payload is DeliverNotificationJobPayload {
  return 'notificationId' in payload && typeof payload.notificationId === 'string';
}

export function isOrderUpdatedPayload(
  payload: RealtimeEventPayload,
): payload is OrderUpdatedRealtimePayload {
  return (
    'kind' in payload &&
    payload.kind === 'order.updated'
  );
}
