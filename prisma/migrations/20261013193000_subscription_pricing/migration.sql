CREATE TABLE "PlatformPlanPrice" (
    "id" TEXT NOT NULL,
    "plan" "RestaurantPlan" NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "priceVnd" INTEGER NOT NULL,
    "monthlyPriceVnd" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPlanPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformPlanPriceHistory" (
    "id" TEXT NOT NULL,
    "priceId" TEXT,
    "plan" TEXT NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "oldPriceVnd" INTEGER,
    "newPriceVnd" INTEGER NOT NULL,
    "oldIsActive" BOOLEAN,
    "newIsActive" BOOLEAN NOT NULL,
    "oldIsRecommended" BOOLEAN,
    "newIsRecommended" BOOLEAN NOT NULL,
    "oldDescription" TEXT,
    "newDescription" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPlanPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantSubscriptionRequest" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "plan" "RestaurantPlan" NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "priceVnd" INTEGER NOT NULL,
    "monthlyPriceVnd" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "adminNote" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "activatedStart" TIMESTAMP(3),
    "activatedEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSubscriptionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantSubscriptionEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "requestId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "plan" TEXT,
    "termMonths" INTEGER,
    "priceVnd" INTEGER,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantSubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPlanPrice_plan_termMonths_key" ON "PlatformPlanPrice"("plan", "termMonths");
CREATE INDEX "PlatformPlanPrice_plan_isActive_idx" ON "PlatformPlanPrice"("plan", "isActive");
CREATE INDEX "PlatformPlanPrice_sortOrder_idx" ON "PlatformPlanPrice"("sortOrder");
CREATE INDEX "PlatformPlanPriceHistory_plan_termMonths_idx" ON "PlatformPlanPriceHistory"("plan", "termMonths");
CREATE INDEX "PlatformPlanPriceHistory_createdAt_idx" ON "PlatformPlanPriceHistory"("createdAt");
CREATE INDEX "RestaurantSubscriptionRequest_restaurantId_status_idx" ON "RestaurantSubscriptionRequest"("restaurantId", "status");
CREATE INDEX "RestaurantSubscriptionRequest_status_createdAt_idx" ON "RestaurantSubscriptionRequest"("status", "createdAt");
CREATE INDEX "RestaurantSubscriptionRequest_requestedByUserId_idx" ON "RestaurantSubscriptionRequest"("requestedByUserId");
CREATE INDEX "RestaurantSubscriptionEvent_restaurantId_createdAt_idx" ON "RestaurantSubscriptionEvent"("restaurantId", "createdAt");
CREATE INDEX "RestaurantSubscriptionEvent_requestId_idx" ON "RestaurantSubscriptionEvent"("requestId");
CREATE INDEX "RestaurantSubscriptionEvent_action_idx" ON "RestaurantSubscriptionEvent"("action");
