import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { getPermissionsForRole } from '@fleetflow/shared';
import type { UserRole } from '@fleetflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        merchantId: true,
        driverId: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (user.role !== dto.role) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const permissions = [...getPermissionsForRole(user.role)];
    const expiresIn = this.parseExpiresIn(
      this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
    );

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn,
    });

    return {
      accessToken,
      expiresIn,
      tokenType: 'Bearer' as const,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        merchantId: user.merchantId,
        driverId: user.driverId,
        permissions,
      },
    };
  }

  getProfile(user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      merchantId: user.merchantId,
      driverId: user.driverId,
      permissions: user.permissions,
    };
  }

  private parseExpiresIn(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) {
      return 604800;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 3600;
      case 'd':
        return amount * 86400;
      default:
        return 604800;
    }
  }
}
