export const ORDER_DISPATCH_QUEUE = 'order-dispatch-queue' as const;

export const MATCH_DRIVER_JOB = 'match-driver' as const;

export interface MatchDriverJobPayload {
  orderId: string;
  merchantId: string;
  pickupAddress: string;
  deliveryAddress: string;
  packageWeight: number;
  packageType: string;
  enqueuedAt: string;
}
