import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriversController, FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

@Module({
  imports: [AuthModule],
  controllers: [FleetController, DriversController],
  providers: [FleetService],
})
export class FleetModule {}
