import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedMerchant } from '../common/interfaces/api-response.interface';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKeyHeader = request.headers['x-api-key'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

    if (!apiKey || apiKey.trim().length === 0) {
      throw new UnauthorizedException('Missing x-api-key header.');
    }

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
    return true;
  }
}
