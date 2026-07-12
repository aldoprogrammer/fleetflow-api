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

@ApiTags('users')
@Controller('users')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: 'List portal users and RBAC roles' })
  @ApiOkResponse({ description: 'Enterprise user directory.' })
  async listUsers() {
    return this.prisma.user.findMany({
      orderBy: { email: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        merchant: { select: { companyName: true } },
        driver: { select: { fullName: true } },
      },
    });
  }
}
