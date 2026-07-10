import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Order } from '@prisma/client';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  MATCH_DRIVER_JOB,
  ORDER_DISPATCH_QUEUE,
  type MatchDriverJobPayload,
} from './constants/queue.constants';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(ORDER_DISPATCH_QUEUE)
    private readonly orderDispatchQueue: Queue<MatchDriverJobPayload>,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.prisma.order.create({
      data: {
        merchantId: dto.merchantId,
        pickupAddress: dto.pickupAddress.trim(),
        deliveryAddress: dto.deliveryAddress.trim(),
        packageWeight: dto.packageWeight,
        packageType: dto.packageType,
      },
    });

    const jobPayload: MatchDriverJobPayload = {
      orderId: order.id,
      merchantId: order.merchantId,
      pickupAddress: order.pickupAddress,
      deliveryAddress: order.deliveryAddress,
      packageWeight: order.packageWeight,
      packageType: order.packageType,
      enqueuedAt: new Date().toISOString(),
    };

    await this.orderDispatchQueue.add(MATCH_DRIVER_JOB, jobPayload, {
      jobId: `match-driver:${order.id}`,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return order;
  }
}
