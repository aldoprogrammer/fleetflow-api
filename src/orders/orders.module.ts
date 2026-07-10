import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ORDER_DISPATCH_QUEUE } from './constants/queue.constants';
import { OrdersController } from './orders.controller';
import { OrdersProcessor } from './orders.processor';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: ORDER_DISPATCH_QUEUE,
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersProcessor],
  exports: [OrdersService],
})
export class OrdersModule {}
