-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ON_DELIVERY', 'OFFLINE');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE',
    "vehicleType" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "pickupLatitude" DOUBLE PRECISION,
ADD COLUMN "pickupLongitude" DOUBLE PRECISION,
ADD COLUMN "deliveryLatitude" DOUBLE PRECISION,
ADD COLUMN "deliveryLongitude" DOUBLE PRECISION,
ADD COLUMN "assignedDriverId" UUID,
ADD COLUMN "matchDistanceKm" DOUBLE PRECISION,
ADD COLUMN "matchScore" DOUBLE PRECISION;

UPDATE "orders"
SET
  "pickupLatitude" = -6.200000,
  "pickupLongitude" = 106.816666,
  "deliveryLatitude" = -6.175110,
  "deliveryLongitude" = 106.865036
WHERE "pickupLatitude" IS NULL;

ALTER TABLE "orders"
  ALTER COLUMN "pickupLatitude" SET NOT NULL,
  ALTER COLUMN "pickupLongitude" SET NOT NULL,
  ALTER COLUMN "deliveryLatitude" SET NOT NULL,
  ALTER COLUMN "deliveryLongitude" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");
CREATE INDEX "drivers_status_idx" ON "drivers"("status");
CREATE INDEX "drivers_latitude_longitude_idx" ON "drivers"("latitude", "longitude");
CREATE INDEX "orders_assignedDriverId_idx" ON "orders"("assignedDriverId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
