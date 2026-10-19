ALTER TABLE "PaymentWebhookEvent"
  DROP CONSTRAINT "PaymentWebhookEvent_restaurantId_fkey";

ALTER TABLE "PaymentWebhookEvent"
  ALTER COLUMN "restaurantId" DROP NOT NULL;

ALTER TABLE "PaymentWebhookEvent"
  ADD CONSTRAINT "PaymentWebhookEvent_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
