import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { Job } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import {
  MATCH_DRIVER_JOB,
  ORDER_DISPATCH_QUEUE,
  type MatchDriverJobPayload,
} from './constants/queue.constants';

const MATCHING_LATENCY_MS = 2000;

@Processor(ORDER_DISPATCH_QUEUE)
export class OrdersProcessor {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process(MATCH_DRIVER_JOB)
  async handleMatchDriver(job: Job<MatchDriverJobPayload>): Promise<void> {
    const { orderId } = job.data;

    this.logger.log(
      `[OrdersProcessor] Matching driver for order ${orderId}...`,
    );

    await this.simulateGeoMatchingLatency();

    const transition = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatus.PENDING,
      },
      data: {
        status: OrderStatus.ASSIGNED,
      },
    });

    if (transition.count === 0) {
      await this.handleSkippedTransition(orderId);
      return;
    }

    this.logger.log(
      `[OrdersProcessor] Matching driver for order ${orderId}... Success!`,
    );
  }

  private async simulateGeoMatchingLatency(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, MATCHING_LATENCY_MS);
    });
  }

  private async handleSkippedTransition(orderId: string): Promise<void> {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (!existing) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (existing.status === OrderStatus.ASSIGNED) {
      this.logger.warn(
        `[OrdersProcessor] Order ${orderId} already ASSIGNED — idempotent skip.`,
      );
      return;
    }

    throw new Error(
      `Order ${orderId} cannot transition from ${existing.status} to ${OrderStatus.ASSIGNED}`,
    );
  }
}
