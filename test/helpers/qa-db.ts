import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getMerchantBalance(merchantId: string): Promise<number> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { balance: true },
  });
  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found.`);
  }
  return merchant.balance;
}

export async function countMerchantDebits(merchantId: string): Promise<number> {
  return prisma.transaction.count({
    where: { merchantId, type: 'DEBIT' },
  });
}

export async function disconnectQaDb(): Promise<void> {
  await prisma.$disconnect();
}

export async function getDriverStatus(driverId: string): Promise<string> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { status: true },
  });
  if (!driver) {
    throw new Error(`Driver ${driverId} not found.`);
  }
  return driver.status;
}
