#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('[qa-live] Resetting ON_TRIP drivers for deterministic matching...');
run('node', ['./scripts/qa-reset-drivers.mjs']);

console.log('[qa-live] Running API live e2e (orders matching)...');
run('npx', ['jest', '--config', './test/jest-e2e.json', '--runInBand'], {
  QA_RUN_LIVE_STACK: 'true',
});
