ALTER TABLE "RestaurantSubscriptionRequest"
ADD COLUMN "requestType" TEXT NOT NULL DEFAULT 'RENEWAL',
ADD COLUMN "currentPlan" TEXT,
ADD COLUMN "currentSubscriptionStart" TIMESTAMP(3),
ADD COLUMN "currentSubscriptionEnd" TIMESTAMP(3),
ADD COLUMN "quoteExpiresAt" TIMESTAMP(3),
ADD COLUMN "pricingSnapshotJson" JSONB;

CREATE INDEX "RestaurantSubscriptionRequest_requestType_status_idx" ON "RestaurantSubscriptionRequest"("requestType", "status");
