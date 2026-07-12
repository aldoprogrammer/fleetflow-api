-- Drop legacy tables from prior scaffold
DROP TABLE IF EXISTS "order_timelines" CASCADE;
DROP TABLE IF EXISTS "transactions" CASCADE;
DROP TABLE IF EXISTS "orders" CASCADE;
DROP TABLE IF EXISTS "drivers" CASCADE;
DROP TABLE IF EXISTS "vehicles" CASCADE;
DROP TABLE IF EXISTS "merchants" CASCADE;

DROP TYPE IF EXISTS "TxType";
DROP TYPE IF EXISTS "DriverStatus";
DROP TYPE IF EXISTS "VehicleType";
DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "PackageType";

CREATE TYPE "VehicleType" AS ENUM ('BIKE', 'CAR', 'TRUCK');
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING', 'MATCHING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED');
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ON_TRIP', 'OFFLINE');
CREATE TYPE "TxType" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "capacityKg" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentLat" DOUBLE PRECISION NOT NULL,
    "currentLng" DOUBLE PRECISION NOT NULL,
    "vehicleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "vehicleTypeRequired" "VehicleType" NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "deliveryLat" DOUBLE PRECISION NOT NULL,
    "deliveryLng" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedDriverId" UUID,
    "price" DOUBLE PRECISION NOT NULL,
    "matchDistanceKm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_timelines" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_timelines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "driverId" UUID,
    "merchantId" UUID,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "TxType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");
CREATE UNIQUE INDEX "merchants_apiKey_key" ON "merchants"("apiKey");
CREATE INDEX "merchants_apiKey_idx" ON "merchants"("apiKey");

CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");

CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");
CREATE UNIQUE INDEX "drivers_vehicleId_key" ON "drivers"("vehicleId");
CREATE INDEX "drivers_status_idx" ON "drivers"("status");
CREATE INDEX "drivers_currentLat_currentLng_idx" ON "drivers"("currentLat", "currentLng");

CREATE INDEX "orders_merchantId_idx" ON "orders"("merchantId");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_assignedDriverId_idx" ON "orders"("assignedDriverId");
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

CREATE INDEX "order_timelines_orderId_idx" ON "order_timelines"("orderId");
CREATE INDEX "order_timelines_createdAt_idx" ON "order_timelines"("createdAt");

CREATE INDEX "transactions_driverId_idx" ON "transactions"("driverId");
CREATE INDEX "transactions_merchantId_idx" ON "transactions"("merchantId");
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_timelines" ADD CONSTRAINT "order_timelines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
