import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import {
  notificationUserChannel,
  type DeliverNotificationJobPayload,
} from './constants/notification-queue.constants';

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
    const channel = notificationUserChannel(payload.userId);
    await this.publisher.publish(channel, JSON.stringify(payload));
    this.logger.debug(
      `Published notification ${payload.notificationId} to ${channel}`,
    );
  }

  streamForUser(userId: string): Observable<MessageEvent> {
    const channel = notificationUserChannel(userId);

    return new Observable<MessageEvent>((subscriber) => {
      const client = new Redis({
        ...this.redisOptions,
        maxRetriesPerRequest: null,
      });

      const onMessage = (_ch: string, message: string): void => {
        subscriber.next({ data: message } as MessageEvent);
      };

      void client.subscribe(channel).then(() => {
        this.logger.debug(`SSE subscribed to ${channel}`);
      });
      client.on('message', onMessage);

      subscriber.next({
        data: JSON.stringify({ type: 'connected', userId }),
      } as MessageEvent);

      return () => {
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
