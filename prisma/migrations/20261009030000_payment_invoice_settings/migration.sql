ALTER TABLE "RestaurantSetting"
  ADD COLUMN IF NOT EXISTS "paymentTransferContent" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "invoicePhone" TEXT;
