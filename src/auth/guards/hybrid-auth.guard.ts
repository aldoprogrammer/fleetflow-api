import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedMerchant } from '../../common/interfaces/api-response.interface';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class HybridAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKeyHeader = request.headers['x-api-key'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

    if (apiKey && apiKey.trim().length > 0) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { apiKey: apiKey.trim() },
        select: {
          id: true,
          companyName: true,
          email: true,
          balance: true,
          apiKey: true,
          createdAt: true,
        },
      });

      if (!merchant) {
        throw new UnauthorizedException('Invalid API key.');
      }

      request.merchant = merchant as AuthenticatedMerchant;
      request.authMode = 'api_key';
      return true;
    }

    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      const jwtResult = await this.jwtAuthGuard.canActivate(context);
      if (jwtResult) {
        request.authMode = 'jwt';
        return true;
      }
    }

    throw new UnauthorizedException(
      'Provide either x-api-key or Authorization Bearer token.',
    );
  }
}
