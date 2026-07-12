import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@fleetflow/shared';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
} from '../decorators/permissions.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import type { AuthenticatedMerchant } from '../../common/interfaces/api-response.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const mode =
      this.reflector.getAllAndOverride<'all' | 'any'>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'all';

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      merchant?: AuthenticatedMerchant;
      authMode?: 'api_key' | 'jwt';
    }>();

    if (request.authMode === 'api_key' && request.merchant) {
      const apiKeyPermissions: Permission[] = [
        'orders:create',
        'orders:read:own',
      ];

      const allowed =
        mode === 'any'
          ? requiredPermissions.some((permission) =>
              apiKeyPermissions.includes(permission),
            )
          : requiredPermissions.every((permission) =>
              apiKeyPermissions.includes(permission),
            );

      if (!allowed) {
        throw new ForbiddenException(
          'API key authentication does not grant this permission.',
        );
      }

      return true;
    }

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication is required.');
    }

    const hasPermissions =
      mode === 'any'
        ? requiredPermissions.some((permission) =>
            user.permissions.includes(permission),
          )
        : requiredPermissions.every((permission) =>
            user.permissions.includes(permission),
          );

    if (!hasPermissions) {
      throw new ForbiddenException(
        'Insufficient permissions for this action.',
      );
    }

    return true;
  }
}
