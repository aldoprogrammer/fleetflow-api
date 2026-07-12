import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { getPermissionsForRole } from '@fleetflow/shared';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

import { compare } from 'bcryptjs';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-jwt'),
  };

  const configService = {
    get: jest.fn().mockReturnValue('7d'),
  };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwtService as unknown as JwtService,
    configService as unknown as ConfigService,
  );

  const activeUser = {
    id: 'user-1',
    email: 'merchant.admin@acme-commerce.id',
    displayName: 'Acme Merchant Admin',
    role: UserRole.MERCHANT_ADMIN,
    merchantId: 'merchant-1',
    driverId: null,
    passwordHash: 'hash',
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(activeUser);
    (compare as jest.Mock).mockResolvedValue(true);
  });

  it('returns JWT and role permissions on valid login', async () => {
    const result = await service.login({
      email: ' merchant.admin@acme-commerce.id ',
      password: 'FleetFlow!2026',
      role: UserRole.MERCHANT_ADMIN,
    });

    expect(result.accessToken).toBe('signed-jwt');
    expect(result.user.permissions).toEqual([
      ...getPermissionsForRole('MERCHANT_ADMIN'),
    ]);
    expect(jwtService.signAsync).toHaveBeenCalled();
  });

  it('rejects unknown or inactive users', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'missing@acme-commerce.id',
        password: 'FleetFlow!2026',
        role: UserRole.MERCHANT_ADMIN,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects role mismatch', async () => {
    await expect(
      service.login({
        email: activeUser.email,
        password: 'FleetFlow!2026',
        role: UserRole.SUPERADMIN,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid password', async () => {
    (compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        email: activeUser.email,
        password: 'wrong-password',
        role: UserRole.MERCHANT_ADMIN,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns profile from authenticated user', () => {
    const profile = service.getProfile({
      id: activeUser.id,
      email: activeUser.email,
      role: 'MERCHANT_ADMIN',
      displayName: activeUser.displayName,
      merchantId: activeUser.merchantId,
      driverId: null,
      permissions: [...getPermissionsForRole('MERCHANT_ADMIN')],
    });

    expect(profile.permissions).toContain('orders:create');
    expect(profile.merchantId).toBe('merchant-1');
  });
});
