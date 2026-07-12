import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { DISPATCH_QUEUE } from '../orders/constants/queue.constants';

export interface DependencyCheck {
  status: 'ok' | 'error';
  message?: string;
}

export interface ReadinessReport {
  status: 'ready' | 'degraded';
  service: 'fleetflow-api';
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
    dispatchQueue: DependencyCheck;
  };
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.configService.get<string>('REDIS_PORT', '6379')),
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async getReadiness(): Promise<ReadinessReport> {
    const [database, redis, dispatchQueue] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkDispatchQueue(),
    ]);

    const checks = { database, redis, dispatchQueue };
    const ok = Object.values(checks).every((check) => check.status === 'ok');

    return {
      status: ok ? 'ready' : 'degraded',
      service: 'fleetflow-api',
      checks,
    };
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Database unreachable',
      };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return { status: 'error', message: `Unexpected PING response: ${pong}` };
      }
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Redis unreachable',
      };
    }
  }

  private async checkDispatchQueue(): Promise<DependencyCheck> {
    try {
      const prefix = 'bull';
      const queueKeyPattern = `${prefix}:${DISPATCH_QUEUE}:meta`;
      const exists = await this.redis.exists(queueKeyPattern);

      if (exists === 1) {
        return { status: 'ok', message: 'BullMQ dispatch-queue registered in Redis' };
      }

      // Queue meta is created on first worker start; absence before any API boot is acceptable.
      const queueKeys = await this.redis.keys(`${prefix}:${DISPATCH_QUEUE}:*`);
      if (queueKeys.length > 0) {
        return {
          status: 'ok',
          message: `BullMQ keys present (${queueKeys.length})`,
        };
      }

      return {
        status: 'ok',
        message: 'Redis reachable — queue activates when API worker starts',
      };
    } catch (error) {
      return {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Dispatch queue check failed',
      };
    }
  }
}
