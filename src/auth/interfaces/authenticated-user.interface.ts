import type { Permission, UserRole } from '@fleetflow/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  merchantId: string | null;
  driverId: string | null;
  permissions: Permission[];
}

export type AuthMode = 'api_key' | 'jwt';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
    authMode?: AuthMode;
  }
}
