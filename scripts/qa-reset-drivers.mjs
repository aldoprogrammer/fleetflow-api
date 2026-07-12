#!/usr/bin/env node
/**
 * Resets ON_TRIP drivers to AVAILABLE so matching e2e tests stay deterministic.
 * Run before live QA: pnpm --filter @fleetflow/api exec node ./scripts/qa-reset-drivers.mjs
 */
import { DriverStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.driver.updateMany({
    where: { status: DriverStatus.ON_TRIP },
    data: { status: DriverStatus.AVAILABLE },
  });

  console.log(`[qa-reset-drivers] ${result.count} driver(s) set to AVAILABLE.`);
}

main()
  .catch((error) => {
    console.error('[qa-reset-drivers] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
