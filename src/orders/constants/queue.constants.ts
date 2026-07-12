export const DISPATCH_QUEUE = 'dispatch-queue' as const;

export const DISPATCH_JOB = 'dispatch-order' as const;

export const MATCH_RADIUS_KM = 10;

export const PLATFORM_FEE_RATE = 0.1;

export interface DispatchJobPayload {
  orderId: string;
  merchantId: string;
  enqueuedAt: string;
}
