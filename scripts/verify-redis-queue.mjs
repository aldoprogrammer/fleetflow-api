#!/usr/bin/env node

/**
 * Verifies Redis + BullMQ dispatch queue are real (not mocked).
 *
 * Steps:
 * 1. PING Redis
 * 2. Inspect BullMQ queue keys / job counts
 * 3. Create a live order and confirm worker processes job → ASSIGNED
 */

import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { DriverStatus, PrismaClient } from '@prisma/client';

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? '6379');
const API_BASE = process.env.QA_API_BASE_URL ?? 'http://localhost:3000/v1';
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'FleetFlow!2026';
const DISPATCH_QUEUE = 'dispatch-queue';

const JAKARTA_FIXTURE = {
  vehicleTypeRequired: 'BIKE',
  pickupAddress: 'Jl. Thamrin No. 1, Jakarta Pusat',
  deliveryAddress: 'Jl. Sudirman No. 52, Jakarta Selatan',
  pickupLat: -6.2,
  pickupLng: 106.816666,
  deliveryLat: -6.17511,
  deliveryLng: 106.865036,
  packageDescription: 'Electronics / gadgets',
};

function log(step, message) {
  console.log(`[verify-queue] ${step} ${message}`);
}

function fail(message) {
  console.error(`[verify-queue] FAIL ${message}`);
  process.exit(1);
}

async function verifyRedisPing() {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
  });

  try {
    const pong = await client.ping();
    if (pong !== 'PONG') {
      fail(`Redis PING returned "${pong}"`);
    }
    log('PASS', `Redis PING at ${REDIS_HOST}:${REDIS_PORT}`);
  } finally {
    await client.quit();
  }
}

async function inspectQueue() {
  const connection = { host: REDIS_HOST, port: REDIS_PORT };
  const queue = new Queue(DISPATCH_QUEUE, { connection });

  try {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );
    log(
      'INFO',
      `BullMQ "${DISPATCH_QUEUE}" counts: ${JSON.stringify(counts)}`,
    );

    const redis = new Redis({ ...connection, maxRetriesPerRequest: 1 });
    const keys = await redis.keys(`bull:${DISPATCH_QUEUE}:*`);
    await redis.quit();

    if (keys.length === 0) {
      log(
        'WARN',
        'No BullMQ keys yet — start API once so the worker registers the queue',
      );
    } else {
      log('PASS', `Found ${keys.length} BullMQ key(s) in Redis`);
    }
  } finally {
    await queue.close();
  }
}

async function loginMerchant() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'merchant.admin@acme-commerce.id',
      password: SEED_PASSWORD,
      role: 'MERCHANT_ADMIN',
    }),
  });

  if (!response.ok) {
    fail(`Merchant login failed (${response.status})`);
  }

  const body = await response.json();
  return body.accessToken;
}

async function createOrder(token) {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(JAKARTA_FIXTURE),
  });

  if (!response.ok) {
    const err = await response.text();
    fail(`Create order failed (${response.status}): ${err}`);
  }

  return response.json();
}

async function waitForOrderStatus(token, orderId, statuses, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${API_BASE}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      fail(`Get order failed (${response.status})`);
    }

    const order = await response.json();
    if (statuses.includes(order.status)) {
      return order;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  fail(`Order ${orderId} did not reach [${statuses.join(', ')}] within ${timeoutMs}ms`);
}

async function resetAvailableDrivers() {
  const prisma = new PrismaClient();

  try {
    const result = await prisma.driver.updateMany({
      where: { status: DriverStatus.ON_TRIP },
      data: { status: DriverStatus.AVAILABLE },
    });

    if (result.count > 0) {
      log('INFO', `Reset ${result.count} ON_TRIP driver(s) to AVAILABLE before dispatch test`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyLiveDispatch() {
  await resetAvailableDrivers();

  log('INFO', 'Creating order to prove BullMQ worker processes dispatch jobs...');

  const token = await loginMerchant();
  const created = await createOrder(token);

  if (created.status !== 'PENDING') {
    fail(`Expected PENDING after create, got ${created.status}`);
  }

  log('PASS', `Order ${created.id} enqueued (status PENDING)`);

  const order = await waitForOrderStatus(token, created.id, [
    'ASSIGNED',
    'CANCELLED',
  ]);

  if (order.status === 'CANCELLED') {
    const note = order.timeline?.at(-1)?.note ?? 'unknown reason';
    fail(
      `Order cancelled (${note}). Run \`pnpm qa:reset-drivers\` or ensure BIKE drivers are AVAILABLE near Jakarta.`,
    );
  }

  if (!order.assignedDriver?.fullName) {
    fail('ASSIGNED order missing driver — queue worker may not be running');
  }

  log(
    'PASS',
    `BullMQ worker assigned driver ${order.assignedDriver.fullName} via Redis queue`,
  );
}

async function verifyApiReady() {
  const response = await fetch(`${API_BASE}/health/ready`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    fail(
      `API /health/ready not ready (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  if (body?.checks?.redis?.status !== 'ok') {
    fail(`API reports Redis unhealthy: ${JSON.stringify(body?.checks?.redis)}`);
  }

  if (body?.checks?.database?.status !== 'ok') {
    fail(
      `API reports database unhealthy: ${JSON.stringify(body?.checks?.database)}`,
    );
  }

  log('PASS', 'API readiness confirms PostgreSQL + Redis');
}

async function main() {
  console.log('[verify-queue] FleetFlow Redis + BullMQ verification');
  console.log(`[verify-queue] Redis ${REDIS_HOST}:${REDIS_PORT} · API ${API_BASE}`);

  await verifyRedisPing();
  await inspectQueue();
  await verifyApiReady();
  await verifyLiveDispatch();

  console.log('[verify-queue] All checks passed — Redis & BullMQ are live.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
