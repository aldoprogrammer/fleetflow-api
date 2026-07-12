import type { OrderStatus, UserRole } from '@prisma/client';

export type OrderPaymentStatus = 'PAID' | 'UNPAID' | 'NOT_CHARGED';

export function resolveOrderPaymentStatus(status: OrderStatus): OrderPaymentStatus {
  if (
    status === 'ASSIGNED' ||
    status === 'PICKED_UP' ||
    status === 'DELIVERED'
  ) {
    return 'PAID';
  }

  if (status === 'CANCELLED') {
    return 'NOT_CHARGED';
  }

  return 'UNPAID';
}

export function formatOrderReference(orderId: string): string {  const compact = orderId.replace(/-/g, '');
  return `#${compact.slice(-6).toUpperCase()}`;
}

export function formatOrderTitle(input: {
  packageDescription?: string | null;
  deliveryAddress: string;
}): string {
  const description = input.packageDescription?.trim();
  if (description) {
    return description.length > 64 ? `${description.slice(0, 61)}…` : description;
  }

  const destination =
    input.deliveryAddress.split(',')[0]?.trim() || input.deliveryAddress.trim();
  return `Dispatch to ${destination}`;
}

export function formatRoleLabel(role: UserRole | string): string {
  return role.replace(/_/g, ' ');
}
