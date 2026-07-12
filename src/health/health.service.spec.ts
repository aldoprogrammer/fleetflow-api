import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('ioredis');

describe('HealthService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };

  const redisInstance = {
    ping: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    quit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Redis as unknown as jest.Mock).mockImplementation(() => redisInstance);
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redisInstance.ping.mockResolvedValue('PONG');
    redisInstance.exists.mockResolvedValue(1);
    redisInstance.quit.mockResolvedValue('OK');
  });

  async function createService(): Promise<HealthService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => {
              if (key === 'REDIS_HOST') return 'localhost';
              if (key === 'REDIS_PORT') return '6379';
              return fallback;
            },
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    return module.get(HealthService);
  }

  it('reports ready when database and redis are healthy', async () => {
    const service = await createService();
    const report = await service.getReadiness();

    expect(report.status).toBe('ready');
    expect(report.checks.database.status).toBe('ok');
    expect(report.checks.redis.status).toBe('ok');
    expect(report.checks.dispatchQueue.status).toBe('ok');
  });

  it('reports degraded when redis ping fails', async () => {
    redisInstance.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    const service = await createService();
    const report = await service.getReadiness();

    expect(report.status).toBe('degraded');
    expect(report.checks.redis.status).toBe('error');
  });
});

describe('HealthController readiness', () => {
  it('throws 503 when dependencies are degraded', async () => {
    const { HealthController } = require('./health.controller') as typeof import('./health.controller');
    const controller = new HealthController({
      getReadiness: jest.fn().mockResolvedValue({
        status: 'degraded',
        service: 'fleetflow-api',
        checks: {
          database: { status: 'ok' },
          redis: { status: 'error', message: 'down' },
          dispatchQueue: { status: 'error', message: 'down' },
        },
      }),
    } as unknown as HealthService);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
