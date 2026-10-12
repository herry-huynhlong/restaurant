-- Add a soft-delete lifecycle state for tenant restaurants.
ALTER TYPE "RestaurantStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Restaurant_deletedAt_idx" ON "Restaurant"("deletedAt");
