#!/usr/bin/env node

/**
 * Mass-dispatch load test — fires concurrent POST /v1/orders requests.
 *
 * Usage:
 *   pnpm qa:load-test-dispatch
 *   node scripts/load-test-dispatch.mjs --total=100 --concurrency=25
 */

import { Queue } from 'bullmq';

const API_BASE = process.env.QA_API_BASE_URL ?? 'http://localhost:3000/v1';
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'FleetFlow!2026';
const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? '6379');
const DISPATCH_QUEUE = 'dispatch-queue';
const DEFAULT_TOTAL_ORDERS = 50;
const DEFAULT_CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 30_000;

const BASE_FIXTURE = {
  vehicleTypeRequired: 'BIKE',
  pickupAddress: 'Jl. Thamrin No. 1, Jakarta Pusat',
  deliveryAddress: 'Jl. Sudirman No. 52, Jakarta Selatan',
  pickupLat: -6.2,
  pickupLng: 106.816666,
  deliveryLat: -6.17511,
  deliveryLng: 106.865036,
  packageDescription: 'Load test parcel',
};

function log(level, message) {
  console.log(`[load-test] ${level} ${message}`);
}

function resolvePositiveInt(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function resolveTotalOrders() {
  const fromEnv = process.env.TOTAL_ORDERS;
  if (fromEnv !== undefined && fromEnv !== '') {
    return resolvePositiveInt(fromEnv, DEFAULT_TOTAL_ORDERS);
  }

  const flagArg = process.argv.find((arg) => arg.startsWith('--total='));
  if (flagArg) {
    return resolvePositiveInt(flagArg.slice('--total='.length), DEFAULT_TOTAL_ORDERS);
  }

  const positional = process.argv[2];
  if (positional && !positional.startsWith('-')) {
    return resolvePositiveInt(positional, DEFAULT_TOTAL_ORDERS);
  }

  return DEFAULT_TOTAL_ORDERS;
}

function resolveConcurrency(totalOrders) {
  const fromEnv = process.env.CONCURRENCY;
  if (fromEnv !== undefined && fromEnv !== '') {
    return Math.min(resolvePositiveInt(fromEnv, DEFAULT_CONCURRENCY), totalOrders);
  }

  const flagArg = process.argv.find((arg) => arg.startsWith('--concurrency='));
  if (flagArg) {
    return Math.min(
      resolvePositiveInt(flagArg.slice('--concurrency='.length), DEFAULT_CONCURRENCY),
      totalOrders,
    );
  }

  return Math.min(DEFAULT_CONCURRENCY, totalOrders);
}

function formatFetchError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return `${error.message} (${cause.code})`;
  }

  return error.message;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyApiReachable(maxWaitMs = 30_000) {
  const deadline = Date.now() + maxWaitMs;
  let lastError = 'unknown';

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/health/ready`);
      if (response.ok) {
        return;
      }
      const body = await response.text();
      lastError = `not ready (${response.status}): ${body}`;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = `timeout after ${FETCH_TIMEOUT_MS}ms`;
      } else {
        lastError = formatFetchError(error);
      }
    }

    if (Date.now() < deadline) {
      log('INFO', `API not ready (${lastError}) — retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  throw new Error(
    `API not reachable at ${API_BASE} (${lastError}). Start it with: pnpm run start:dev`,
  );
}

function buildOrderPayload(index) {
  const jitter = index * 0.0001;
  return {
    ...BASE_FIXTURE,
    packageDescription: `Load test parcel #${index + 1}`,
    pickupLat: BASE_FIXTURE.pickupLat + jitter,
    pickupLng: BASE_FIXTURE.pickupLng + jitter,
  };
}

async function loginMerchant() {
  const response = await fetchWithTimeout(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'merchant.admin@acme-commerce.id',
      password: SEED_PASSWORD,
      role: 'MERCHANT_ADMIN',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Merchant login failed (${response.status}): ${body}`);
  }

  const body = await response.json();
  return body.accessToken;
}

async function createOrder(token, index) {
  const startedAt = performance.now();

  try {
    const response = await fetchWithTimeout(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildOrderPayload(index)),
    });

    const elapsedMs = Math.round(performance.now() - startedAt);
    const bodyText = await response.text();
    let body = null;

    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        elapsedMs,
        error: body?.message ?? bodyText ?? 'Unknown error',
      };
    }

    return {
      ok: true,
      status: response.status,
      elapsedMs,
      orderId: body?.id,
      orderStatus: body?.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: formatFetchError(error),
    };
  }
}

async function runBatchedOrders(token, totalOrders, concurrency) {
  const results = [];

  for (let offset = 0; offset < totalOrders; offset += concurrency) {
    const batchSize = Math.min(concurrency, totalOrders - offset);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, index) =>
        createOrder(token, offset + index),
      ),
    );
    results.push(...batch);
  }

  return results;
}

async function inspectQueue() {
  const queue = new Queue(DISPATCH_QUEUE, {
    connection: { host: REDIS_HOST, port: REDIS_PORT },
  });

  try {
    return await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );
  } finally {
    await queue.close();
  }
}

async function main() {
  const totalOrders = resolveTotalOrders();
  const concurrency = resolveConcurrency(totalOrders);

  log('INFO', `FleetFlow mass-dispatch load test`);
  log(
    'INFO',
    `API ${API_BASE} · ${totalOrders} order(s) · concurrency ${concurrency}`,
  );

  await verifyApiReachable();
  log('PASS', 'API reachable');

  const token = await loginMerchant();
  log('PASS', 'Merchant authenticated');

  const queueBefore = await inspectQueue();
  log('INFO', `BullMQ before: ${JSON.stringify(queueBefore)}`);

  const startedAt = performance.now();
  const results = await runBatchedOrders(token, totalOrders, concurrency);
  const totalElapsedMs = Math.round(performance.now() - startedAt);

  const succeeded = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const latencies = succeeded.map((result) => result.elapsedMs);
  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : 0;
  const maxLatencyMs = latencies.length > 0 ? Math.max(...latencies) : 0;

  const statusBreakdown = succeeded.reduce((acc, result) => {
    const key = result.orderStatus ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const errorBreakdown = failed.reduce((acc, result) => {
    const key =
      result.status > 0
        ? `${result.status}: ${result.error}`
        : `network: ${result.error}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  log('PASS', `${succeeded.length}/${totalOrders} orders created in ${totalElapsedMs}ms`);
  log('INFO', `Latency avg ${avgLatencyMs}ms · max ${maxLatencyMs}ms`);
  log('INFO', `Order statuses: ${JSON.stringify(statusBreakdown)}`);

  if (failed.length > 0) {
    log('WARN', `${failed.length} request(s) failed`);
    for (const [message, count] of Object.entries(errorBreakdown)) {
      log('WARN', `  ${count}x ${message}`);
    }
  }

  const queueAfter = await inspectQueue();
  log('INFO', `BullMQ after: ${JSON.stringify(queueAfter)}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log('FAIL', message);
  process.exit(1);
});
