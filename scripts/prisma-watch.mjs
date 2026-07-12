#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');
const syncScript = join(__dirname, 'prisma-sync.mjs');

const args = process.argv.slice(2);
const syncArgs = ['--seed', ...args.filter((arg) => arg !== '--seed')];

let debounceTimer = null;
let running = false;
let queued = false;

function log(message) {
  console.log(`[prisma-watch] ${message}`);
}

function runSync() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  log('Schema changed. Running prisma sync...');

  const child = spawn(process.execPath, [syncScript, ...syncArgs], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('close', (code) => {
    running = false;

    if (code === 0) {
      log('Sync finished.');
    } else {
      log(`Sync failed with exit code ${code ?? 'unknown'}.`);
    }

    if (queued) {
      queued = false;
      runSync();
    }
  });
}

function scheduleSync(source) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    log(`Change detected in ${source}`);
    runSync();
  }, 700);
}

const schemaPath = join(apiRoot, 'prisma', 'schema.prisma');
const migrationsPath = join(apiRoot, 'prisma', 'migrations');

log('Watching prisma/schema.prisma and prisma/migrations ...');
log('Press Ctrl+C to stop.');

runSync();

watch(schemaPath, () => {
  scheduleSync('schema.prisma');
});

watch(migrationsPath, { recursive: true }, () => {
  scheduleSync('migrations');
});
