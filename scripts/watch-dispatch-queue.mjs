#!/usr/bin/env node

/**
 * Live BullMQ dispatch-queue monitor (polls Redis).
 *
 * Usage:
 *   pnpm qa:watch-dispatch-queue
 *   node scripts/watch-dispatch-queue.mjs --interval=500
 *
 * Run in a second terminal while load-test fires orders.
 */

import { Queue } from 'bullmq';

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? '6379');
const DISPATCH_QUEUE = 'dispatch-queue';
const DEFAULT_INTERVAL_MS = 1000;

function resolveIntervalMs() {
  const fromEnv = process.env.INTERVAL_MS;
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  const flag = process.argv.find((arg) => arg.startsWith('--interval='));
  if (flag) {
    const parsed = Number(flag.slice('--interval='.length));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return DEFAULT_INTERVAL_MS;
}

function formatCounts(counts) {
  return [
    `waiting=${counts.waiting}`,
    `active=${counts.active}`,
    `completed=${counts.completed}`,
    `failed=${counts.failed}`,
    `delayed=${counts.delayed}`,
    `paused=${counts.paused}`,
  ].join(' · ');
}

async function main() {
  const intervalMs = resolveIntervalMs();
  const queue = new Queue(DISPATCH_QUEUE, {
    connection: { host: REDIS_HOST, port: REDIS_PORT },
  });

  console.log(
    `[watch-queue] Live monitor for "${DISPATCH_QUEUE}" @ ${REDIS_HOST}:${REDIS_PORT} (every ${intervalMs}ms). Ctrl+C to stop.`,
  );

  const poll = async () => {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    const at = new Date().toLocaleTimeString();
    process.stdout.write(`\r[watch-queue] ${at}  ${formatCounts(counts)}   `);
  };

  try {
    await poll();
    const timer = setInterval(() => {
      poll().catch((error) => {
        clearInterval(timer);
        console.error(
          `\n[watch-queue] FAIL ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      });
    }, intervalMs);

    process.on('SIGINT', async () => {
      clearInterval(timer);
      console.log('\n[watch-queue] Stopped.');
      await queue.close();
      process.exit(0);
    });
  } catch (error) {
    await queue.close();
    throw error;
  }
}

main().catch((error) => {
  console.error(
    `[watch-queue] FAIL ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
