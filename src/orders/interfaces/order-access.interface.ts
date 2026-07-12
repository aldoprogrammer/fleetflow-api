import type { Permission } from '@fleetflow/shared';
import type { AuthenticatedMerchant } from '../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

export interface OrderAccessContext {
  mode: 'api_key' | 'jwt';
  merchant?: AuthenticatedMerchant;
  user?: AuthenticatedUser;
}

export function resolveOrderAccessContext(request: {
  authMode?: 'api_key' | 'jwt';
  merchant?: AuthenticatedMerchant;
  user?: AuthenticatedUser;
}): OrderAccessContext {
  if (request.authMode === 'api_key' && request.merchant) {
    return {
      mode: 'api_key',
      merchant: request.merchant,
    };
  }

  if (request.authMode === 'jwt' && request.user) {
    return {
      mode: 'jwt',
      user: request.user,
    };
  }

  throw new Error('Unable to resolve order access context.');
}

export function userCanReadOrder(
  context: OrderAccessContext,
  order: {
    merchantId: string;
    assignedDriverId: string | null;
  },
): boolean {
  if (context.mode === 'api_key' && context.merchant) {
    return order.merchantId === context.merchant.id;
  }

  const user = context.user;
  if (!user) {
    return false;
  }

  if (user.permissions.includes('orders:read:all' as Permission)) {
    return true;
  }

  if (
    user.permissions.includes('orders:read:own' as Permission) &&
    user.merchantId &&
    order.merchantId === user.merchantId
  ) {
    return true;
  }

  if (
    user.permissions.includes('orders:read:assigned' as Permission) &&
    user.driverId &&
    order.assignedDriverId === user.driverId
  ) {
    return true;
  }

  return false;
}
