-- AlterTable
ALTER TABLE "RestaurantSetting"
  ADD COLUMN IF NOT EXISTS "cashEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "qrPaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notificationSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyNewOrder" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyServiceRequest" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyPaymentRequest" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "recipientUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_recipientUserId_isRead_idx" ON "Notification"("recipientUserId", "isRead");
