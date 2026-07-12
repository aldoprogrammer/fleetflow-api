-- AlterTable
ALTER TABLE "orders" ADD COLUMN "packageDescription" TEXT;
ALTER TABLE "orders" ADD COLUMN "packageWeightKg" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "createdByUserId" UUID;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "orders_createdByUserId_idx" ON "orders"("createdByUserId");
