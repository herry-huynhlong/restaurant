CREATE TABLE "PlatformSubscriptionPolicy" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "trialEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trialDays" INTEGER NOT NULL DEFAULT 60,
    "trialRestaurantLimit" INTEGER NOT NULL DEFAULT 20,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSubscriptionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSubscriptionPolicy_singletonKey_key" ON "PlatformSubscriptionPolicy"("singletonKey");
