-- Additive only: existing selling prices and payment snapshots are unchanged.
-- Existing rows remain unpublished until a Platform Owner/Admin approves them.
BEGIN;
ALTER TABLE "PlatformPlanPrice"
  ADD COLUMN "originalPriceVnd" INTEGER,
  ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformPlanPriceHistory"
  ADD COLUMN "oldOriginalPriceVnd" INTEGER,
  ADD COLUMN "newOriginalPriceVnd" INTEGER,
  ADD COLUMN "oldIsPublished" BOOLEAN,
  ADD COLUMN "newIsPublished" BOOLEAN;
ALTER TABLE "PlatformPlanPrice" ADD CONSTRAINT "PlatformPlanPrice_original_price_check"
  CHECK ("originalPriceVnd" IS NULL OR ("originalPriceVnd" > "priceVnd" AND "priceVnd" > 0));
COMMIT;
