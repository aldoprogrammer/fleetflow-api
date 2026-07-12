import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@fleetflow/shared';
import { RequireAnyPermission } from '../auth/decorators/permissions.decorator';
import { HybridAuthGuard } from '../auth/guards/hybrid-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('ledger')
@Controller('ledger')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class LedgerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('transactions')
  @RequireAnyPermission(PERMISSIONS.LEDGER_READ, PERMISSIONS.LEDGER_MANAGE)
  @ApiOperation({ summary: 'Recent ledger transactions' })
  @ApiOkResponse({ description: 'Settlement audit trail.' })
  async listTransactions() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        amount: true,
        type: true,
        description: true,
        createdAt: true,
        merchant: { select: { companyName: true } },
        driver: { select: { fullName: true } },
      },
    });
  }
}
