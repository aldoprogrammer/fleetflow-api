import {
  DriverStatus,
  PrismaClient,
  TxType,
  UserRole,
  VehicleType,
} from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const SEED_USER_PASSWORD =
  process.env.SEED_USER_PASSWORD ?? 'FleetFlow!2026';

const MERCHANT_SEED_API_KEY =
  process.env.SEED_MERCHANT_API_KEY ?? 'ff_live_merchant_acme_7f3c9a2e';
const MERCHANT_LOW_BALANCE_API_KEY =
  process.env.SEED_MERCHANT_LOW_BALANCE_API_KEY ??
  'ff_live_merchant_startup_1b4d8e6f';
const MERCHANT_ENTERPRISE_API_KEY =
  process.env.SEED_MERCHANT_ENTERPRISE_API_KEY ??
  'ff_live_merchant_enterprise_9c2a5d1b';

async function main(): Promise<void> {
  await prisma.transaction.deleteMany();
  await prisma.orderTimeline.deleteMany();
  await prisma.order.deleteMany();
  await prisma.user.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.merchant.deleteMany();

  const merchants = await Promise.all([
    prisma.merchant.create({
      data: {
        companyName: 'Startup Logistics ID',
        email: 'ops@startup-logistics.id',
        balance: 25000,
        apiKey: MERCHANT_LOW_BALANCE_API_KEY,
      },
    }),
    prisma.merchant.create({
      data: {
        companyName: 'Acme Commerce Jakarta',
        email: 'dispatch@acme-commerce.id',
        balance: 5000000,
        apiKey: MERCHANT_SEED_API_KEY,
      },
    }),
    prisma.merchant.create({
      data: {
        companyName: 'Enterprise Retail Nusantara',
        email: 'fleet@enterprise-retail.id',
        balance: 12500000,
        apiKey: MERCHANT_ENTERPRISE_API_KEY,
      },
    }),
  ]);

  const vehicleSeed = [
    {
      plateNumber: 'B-1001-FF',
      type: VehicleType.BIKE,
      capacityKg: 15,
      driver: {
        fullName: 'Alex Rivera',
        phone: '+628123450001',
        currentLat: -6.2012,
        currentLng: 106.8175,
        status: DriverStatus.AVAILABLE,
      },
    },
    {
      plateNumber: 'B-2002-FF',
      type: VehicleType.BIKE,
      capacityKg: 20,
      driver: {
        fullName: 'Citra Dewi',
        phone: '+628123450003',
        currentLat: -6.1954,
        currentLng: 106.8098,
        status: DriverStatus.AVAILABLE,
      },
    },
    {
      plateNumber: 'B-3003-FF',
      type: VehicleType.CAR,
      capacityKg: 120,
      driver: {
        fullName: 'Budi Santoso',
        phone: '+628123450002',
        currentLat: -6.2088,
        currentLng: 106.8221,
        status: DriverStatus.AVAILABLE,
      },
    },
    {
      plateNumber: 'B-4004-FF',
      type: VehicleType.CAR,
      capacityKg: 180,
      driver: {
        fullName: 'Dedi Pratama',
        phone: '+628123450004',
        currentLat: -6.2145,
        currentLng: 106.8312,
        status: DriverStatus.AVAILABLE,
      },
    },
    {
      plateNumber: 'B-5005-FF',
      type: VehicleType.TRUCK,
      capacityKg: 1200,
      driver: {
        fullName: 'Eka Wijaya',
        phone: '+628123450005',
        currentLat: -6.1891,
        currentLng: 106.8044,
        status: DriverStatus.OFFLINE,
      },
    },
  ] as const;

  for (const item of vehicleSeed) {
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber: item.plateNumber,
        type: item.type,
        capacityKg: item.capacityKg,
      },
    });

    await prisma.driver.create({
      data: {
        fullName: item.driver.fullName,
        phone: item.driver.phone,
        status: item.driver.status,
        currentLat: item.driver.currentLat,
        currentLng: item.driver.currentLng,
        vehicleId: vehicle.id,
      },
    });
  }

  const passwordHash = await hash(SEED_USER_PASSWORD, 12);
  const alexDriver = await prisma.driver.findFirst({
    where: { fullName: 'Alex Rivera' },
    select: { id: true },
  });

  const rbacUsers = [
    {
      email: 'superadmin@fleetflow.dev',
      displayName: 'FleetFlow Super Admin',
      role: UserRole.SUPERADMIN,
    },
    {
      email: 'regional.manager@fleetflow.dev',
      displayName: 'Jakarta Regional Manager',
      role: UserRole.REGIONAL_MANAGER,
    },
    {
      email: 'warehouse.head@fleetflow.dev',
      displayName: 'Central Warehouse Head',
      role: UserRole.HEAD_OF_WAREHOUSE,
    },
    {
      email: 'fleet.operator@fleetflow.dev',
      displayName: 'Fleet Operations Lead',
      role: UserRole.FLEET_OPERATOR,
    },
    {
      email: 'merchant.admin@acme-commerce.id',
      displayName: 'Acme Merchant Admin',
      role: UserRole.MERCHANT_ADMIN,
      merchantId: merchants[1].id,
    },
    {
      email: 'driver.partner@fleetflow.dev',
      displayName: 'Alex Rivera',
      role: UserRole.DRIVER_PARTNER,
      driverId: alexDriver?.id,
    },
  ] as const;

  for (const account of rbacUsers) {
    await prisma.user.create({
      data: {
        email: account.email,
        displayName: account.displayName,
        role: account.role,
        passwordHash,
        merchantId: 'merchantId' in account ? account.merchantId : undefined,
        driverId: 'driverId' in account ? account.driverId ?? undefined : undefined,
      },
    });
  }

  const ledgerEntries = [
    {
      merchantId: merchants[1].id,
      amount: 2500000,
      type: TxType.CREDIT,
      description: 'Initial merchant wallet top-up',
    },
    {
      merchantId: merchants[1].id,
      amount: 2500000,
      type: TxType.CREDIT,
      description: 'Promotional dispatch credits',
    },
    {
      merchantId: merchants[2].id,
      amount: 12500000,
      type: TxType.CREDIT,
      description: 'Enterprise onboarding credit line',
    },
    {
      merchantId: merchants[0].id,
      amount: 25000,
      type: TxType.CREDIT,
      description: 'Starter plan wallet funding',
    },
    {
      merchantId: merchants[1].id,
      amount: 150000,
      type: TxType.DEBIT,
      description: 'Pilot dispatch settlement',
    },
  ];

  for (const entry of ledgerEntries) {
    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        merchantId: entry.merchantId,
        amount: entry.amount,
        type: entry.type,
        description: entry.description,
      },
    });
  }

  console.log('Seeded FleetFlow enterprise dataset:');
  console.log(`- Merchants: ${merchants.length}`);
  console.log(`- Drivers: ${vehicleSeed.length}`);
  console.log(`- RBAC users: ${rbacUsers.length}`);
  console.log(`- Ledger transactions: ${ledgerEntries.length}`);
  console.log(`- Primary API key: ${MERCHANT_SEED_API_KEY}`);
  console.log(`- Seed user password: ${SEED_USER_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
