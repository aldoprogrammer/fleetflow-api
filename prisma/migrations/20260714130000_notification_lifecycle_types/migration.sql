-- AlterEnum (public schema)
SET search_path TO public;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ORDER_PICKED_UP';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ORDER_DELIVERED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ORDER_CANCELLED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
