ALTER TYPE "RestaurantPlan" ADD VALUE IF NOT EXISTS 'TRAIN';

CREATE TYPE "PlanEntitlement" AS ENUM ('BASIC', 'PRO');

ALTER TABLE "Restaurant"
ADD COLUMN "planEntitlement" "PlanEntitlement" NOT NULL DEFAULT 'BASIC';

UPDATE "Restaurant"
SET "planEntitlement" = CASE WHEN "plan" = 'PRO' THEN 'PRO'::"PlanEntitlement" ELSE 'BASIC'::"PlanEntitlement" END;

CREATE INDEX "Restaurant_planEntitlement_idx" ON "Restaurant"("planEntitlement");

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_EXPIRING';

ALTER TABLE "Notification" ALTER COLUMN "tableId" DROP NOT NULL;
