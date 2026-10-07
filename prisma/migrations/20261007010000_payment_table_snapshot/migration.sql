ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "tableIdSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "tableNameSnapshot" TEXT;

