import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DISPATCH_QUEUE } from './constants/queue.constants';
import { MatchingProcessor } from './matching.processor';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PricingService } from './pricing/pricing.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: DISPATCH_QUEUE,
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, MatchingProcessor, PricingService],
  exports: [OrdersService],
})
export class OrdersModule {}
