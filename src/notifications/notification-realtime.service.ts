import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import {
  notificationUserChannel,
  type DeliverNotificationJobPayload,
} from './constants/notification-queue.constants';
import type {
  OrderUpdatedRealtimePayload,
  RealtimeEventPayload,
} from './constants/realtime-event.types';

@Injectable()
export class NotificationRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationRealtimeService.name);
  private readonly publisher: Redis;
  private readonly redisOptions: { host: string; port: number };

  constructor(configService: ConfigService) {
    this.redisOptions = {
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(configService.get<string>('REDIS_PORT', '6379')),
    };
    this.publisher = new Redis({
      ...this.redisOptions,
      maxRetriesPerRequest: null,
    });
  }

  async publish(payload: DeliverNotificationJobPayload): Promise<void> {
    await this.publishToUser(payload.userId, payload);
  }

  async publishOrderUpdated(
    userId: string,
    payload: Omit<OrderUpdatedRealtimePayload, 'kind'>,
  ): Promise<void> {
    const event: OrderUpdatedRealtimePayload = {
      kind: 'order.updated',
      ...payload,
    };
    await this.publishToUser(userId, event);
  }

  async publishToUser(
    userId: string,
    payload: RealtimeEventPayload,
  ): Promise<void> {
    const channel = notificationUserChannel(userId);
    await this.publisher.publish(channel, JSON.stringify(payload));
    this.logger.debug(`Published realtime event to ${channel}`);
  }

  streamForUser(userId: string): Observable<MessageEvent> {
    const channel = notificationUserChannel(userId);

    return new Observable<MessageEvent>((subscriber) => {
      const client = new Redis({
        ...this.redisOptions,
        maxRetriesPerRequest: null,
      });

      // NestJS SSE JSON.stringifies `data` — pass objects, never pre-stringified JSON.
      const push = (payload: Record<string, unknown>): void => {
        subscriber.next({ data: payload } as MessageEvent);
      };

      const onMessage = (_ch: string, message: string): void => {
        try {
          const parsed = JSON.parse(message) as Record<string, unknown>;
          push(parsed);
        } catch (error) {
          this.logger.warn(
            `Ignored invalid realtime payload on ${channel}: ${String(error)}`,
          );
        }
      };

      void client.subscribe(channel).then(() => {
        this.logger.log(`SSE subscribed to ${channel}`);
      });
      client.on('message', onMessage);

      push({ kind: 'connected', userId });

      const heartbeat = setInterval(() => {
        push({ kind: 'heartbeat', at: new Date().toISOString() });
      }, 25_000);

      return () => {
        clearInterval(heartbeat);
        client.off('message', onMessage);
        void client.unsubscribe(channel).finally(() => {
          void client.quit();
        });
      };
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.publisher.quit();
  }
}
