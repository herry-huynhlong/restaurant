DO $$ BEGIN
  CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'DRINK_SHOP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "businessType" "BusinessType" NOT NULL DEFAULT 'RESTAURANT';

CREATE INDEX IF NOT EXISTS "Restaurant_businessType_idx" ON "Restaurant"("businessType");
