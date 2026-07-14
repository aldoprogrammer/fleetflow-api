import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NOTIFICATION_QUEUE } from './constants/notification-queue.constants';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationsController } from './notifications.controller';
import {
  NotificationDeliveryProcessor,
  NotificationsService,
} from './notifications.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationRealtimeService,
    NotificationDeliveryProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
