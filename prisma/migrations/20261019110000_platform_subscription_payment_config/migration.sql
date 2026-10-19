-- Platform subscription bank details are not RestaurantSetting values. Existing
-- orders keep nullable snapshot columns so they are never silently redirected.
CREATE TABLE "PlatformSubscriptionPaymentConfig" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bankCode" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastChangedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSubscriptionPaymentConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSubscriptionPaymentConfig_singletonKey_key"
ON "PlatformSubscriptionPaymentConfig"("singletonKey");

ALTER TABLE "SubscriptionPaymentOrder"
ADD COLUMN "receiverBankCode" TEXT,
ADD COLUMN "receiverAccountNumber" TEXT,
ADD COLUMN "receiverAccountName" TEXT,
ADD COLUMN "paymentConfigVersion" INTEGER;
