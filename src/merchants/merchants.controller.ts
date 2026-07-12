import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@fleetflow/shared';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { HybridAuthGuard } from '../auth/guards/hybrid-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('merchants')
@Controller('merchants')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class MerchantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MERCHANTS_MANAGE)
  @ApiOperation({ summary: 'List merchants for platform order intake' })
  @ApiOkResponse({ description: 'Merchant directory for delegated dispatch.' })
  async listMerchants() {
    return this.prisma.merchant.findMany({
      select: {
        id: true,
        companyName: true,
        email: true,
        balance: true,
      },
      orderBy: { companyName: 'asc' },
    });
  }
}
