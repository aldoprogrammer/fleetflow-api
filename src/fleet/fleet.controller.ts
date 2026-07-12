import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@fleetflow/shared';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { HybridAuthGuard } from '../auth/guards/hybrid-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FleetService } from './fleet.service';

@ApiTags('fleet')
@Controller('fleet')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.FLEET_MANAGE)
  @ApiOperation({ summary: 'Fleet dispatch overview and driver telemetry' })
  @ApiOkResponse({ description: 'Live fleet metrics for operations console.' })
  getOverview() {
    return this.fleetService.getOverview();
  }
}

@ApiTags('drivers')
@Controller('drivers')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DriversController {
  constructor(private readonly fleetService: FleetService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.DRIVERS_MANAGE,
    PERMISSIONS.FLEET_MANAGE,
  )
  @ApiOperation({ summary: 'List courier partners and vehicle assignments' })
  @ApiOkResponse({ description: 'Driver roster with live status.' })
  listDrivers() {
    return this.fleetService.listDrivers();
  }
}
