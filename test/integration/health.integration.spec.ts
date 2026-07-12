import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthModule } from '../../src/health/health.module';

describe('Health API (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health/live returns ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      service: 'fleetflow-api',
    });
  });

  it('GET /v1/health/ready returns ready', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/ready')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ready',
      service: 'fleetflow-api',
    });
  });
});
