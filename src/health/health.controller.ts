import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: string; service: string } {
    return { status: 'ok', service: 'fleetflow-api' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe (PostgreSQL + Redis + BullMQ dispatch queue)',
  })
  async ready() {
    const report = await this.healthService.getReadiness();

    if (report.status !== 'ready') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
