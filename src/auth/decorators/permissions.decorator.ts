import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@fleetflow/shared';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissions_mode';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAnyPermission = (...permissions: Permission[]) => {
  return (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, propertyKey!, descriptor!);
    SetMetadata(PERMISSIONS_MODE_KEY, 'any')(target, propertyKey!, descriptor!);
  };
};
