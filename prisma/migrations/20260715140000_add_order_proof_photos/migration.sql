-- CreateEnum
CREATE TYPE "OrderPhotoType" AS ENUM ('DEPARTURE', 'DELIVERY');

-- CreateEnum
CREATE TYPE "OrderAuditAction" AS ENUM (
  'DEPARTURE_PHOTO_UPLOADED',
  'DELIVERY_PHOTO_UPLOADED',
  'JOURNEY_STARTED',
  'BOOKING_COMPLETED',
  'MANUAL_COMPLETION_BY_OPS',
  'COMPLETION_WITHOUT_PROOF_PHOTOS'
);

-- CreateTable
CREATE TABLE "order_photos" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "type" "OrderPhotoType" NOT NULL,
  "url" TEXT NOT NULL,
  "uploadedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_audit_events" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "userRole" "UserRole" NOT NULL,
  "action" "OrderAuditAction" NOT NULL,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_photos_orderId_type_idx" ON "order_photos"("orderId", "type");

-- CreateIndex
CREATE INDEX "order_audit_events_orderId_idx" ON "order_audit_events"("orderId");

-- CreateIndex
CREATE INDEX "order_audit_events_userId_idx" ON "order_audit_events"("userId");

-- CreateIndex
CREATE INDEX "order_audit_events_createdAt_idx" ON "order_audit_events"("createdAt");

-- AddForeignKey
ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_photos" ADD CONSTRAINT "order_photos_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_audit_events" ADD CONSTRAINT "order_audit_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_audit_events" ADD CONSTRAINT "order_audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
