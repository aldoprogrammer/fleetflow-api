#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');

const args = new Set(process.argv.slice(2));
const shouldSeed = args.has('--seed');
const useDevMigrate = args.has('--dev');
const forceKillApi = args.has('--force-kill-api');
const skipKill = args.has('--no-kill');

function log(message) {
  console.log(`[prisma-sync] ${message}`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${commandArgs.join(' ')}`);
  }
}

function killWindowsByPort(port) {
  const script = `
    $connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue
    if ($null -eq $connections) { exit 0 }
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  `;

  spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdio: 'ignore', shell: false },
  );
}

function killUnixByPort(port) {
  spawnSync('bash', ['-lc', `lsof -ti tcp:${port} | xargs -r kill -9`], {
    stdio: 'ignore',
  });
}

function killByPort(port) {
  if (process.platform === 'win32') {
    killWindowsByPort(port);
    return;
  }

  killUnixByPort(port);
}

function releasePrismaLocks() {
  if (skipKill) {
    log('Skipping process cleanup (--no-kill).');
    return;
  }

  log('Releasing Prisma locks (Studio on :5555)...');
  killByPort(5555);

  if (forceKillApi) {
    log('Stopping API dev process on :3000 (--force-kill-api)...');
    killByPort(3000);
  }

  if (process.platform === 'win32') {
    spawnSync(
      'taskkill',
      ['/F', '/IM', 'prisma.exe', '/T'],
      { stdio: 'ignore' },
    );
  }
}

function runGenerateWithRetry(maxAttempts = 6) {
  return runGenerateAttempt(1, maxAttempts);
}

async function runGenerateAttempt(attempt, maxAttempts) {
  log(`Generating Prisma client (attempt ${attempt}/${maxAttempts})...`);

  const result = spawnSync('npx', ['prisma', 'generate'], {
    cwd: apiRoot,
    stdio: 'pipe',
    shell: true,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    log('Prisma client generated.');
    return;
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const lockError =
    output.includes('EPERM') ||
    output.includes('operation not permitted') ||
    output.includes('EBUSY');

  process.stderr.write(result.stderr ?? '');
  process.stdout.write(result.stdout ?? '');

  if (!lockError || attempt >= maxAttempts) {
    throw new Error('Prisma generate failed.');
  }

  if (attempt === 2 && !forceKillApi) {
    log('Engine still locked. Retrying after stopping Prisma Studio...');
    killByPort(5555);
  }

  if (attempt === 4 && !forceKillApi) {
    log('Engine still locked. Stopping API on :3000 temporarily...');
    killByPort(3000);
  }

  const waitMs = attempt * 1000;
  log(`Waiting ${waitMs}ms before retry...`);
  await delay(waitMs);
  await runGenerateAttempt(attempt + 1, maxAttempts);
}

function runMigrate() {
  if (useDevMigrate) {
    const migrationName = process.env.PRISMA_MIGRATION_NAME;
    const migrateArgs = ['prisma', 'migrate', 'dev'];
    if (migrationName) {
      migrateArgs.push('--name', migrationName);
    }
    log('Running prisma migrate dev...');
    run('npx', migrateArgs);
    return;
  }

  log('Running prisma migrate deploy...');
  run('npx', ['prisma', 'migrate', 'deploy']);
}

function runSeed() {
  log('Running prisma db seed...');
  run('npx', ['prisma', 'db', 'seed']);
}

async function main() {
  if (!existsSync(join(apiRoot, 'prisma', 'schema.prisma'))) {
    throw new Error('prisma/schema.prisma not found.');
  }

  log('Starting Prisma sync...');
  releasePrismaLocks();
  runMigrate();
  await runGenerateWithRetry();

  if (shouldSeed) {
    runSeed();
  }

  log('Prisma sync complete.');
  if (!forceKillApi) {
    log('If API was stopped for unlock, restart with: pnpm dev:api');
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[prisma-sync] ${message}`);
  process.exit(1);
});
