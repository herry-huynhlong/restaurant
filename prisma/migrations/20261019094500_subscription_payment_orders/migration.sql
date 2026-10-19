-- Payment records are intentionally separate from dining payments. They are
-- only an auditable payment-order foundation; this migration does not activate
-- a subscription or connect to a real bank provider.
CREATE TYPE "SubscriptionPaymentProvider" AS ENUM ('MOCK', 'SEPAY');
CREATE TYPE "SubscriptionPaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'NEEDS_REVIEW');
CREATE TYPE "SubscriptionPaymentTransactionStatus" AS ENUM ('RECEIVED', 'MATCHED', 'UNMATCHED', 'DUPLICATE', 'REJECTED');
CREATE TYPE "PaymentWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "SubscriptionEntitlementStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'VOID');

CREATE TABLE "SubscriptionPaymentOrder" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "subscriptionRequestId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "provider" "SubscriptionPaymentProvider" NOT NULL DEFAULT 'MOCK',
    "status" "SubscriptionPaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "transferCode" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "plan" "RestaurantPlan" NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "priceSnapshotJson" JSONB NOT NULL,
    "entitlementSnapshotJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionPaymentTransaction" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "provider" "SubscriptionPaymentProvider" NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "status" "SubscriptionPaymentTransactionStatus" NOT NULL DEFAULT 'RECEIVED',
    "amountVnd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "transferContent" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerOccurredAt" TIMESTAMP(3),
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPaymentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "paymentTransactionId" TEXT,
    "provider" "SubscriptionPaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "status" "PaymentWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payloadHash" TEXT NOT NULL,
    "payloadJson" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionEntitlement" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "subscriptionRequestId" TEXT,
    "paymentOrderId" TEXT,
    "status" "SubscriptionEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" "RestaurantPlan" NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priceSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPaymentOrder_transferCode_key" ON "SubscriptionPaymentOrder"("transferCode");
CREATE UNIQUE INDEX "SubscriptionPaymentOrder_restaurantId_idempotencyKey_key" ON "SubscriptionPaymentOrder"("restaurantId", "idempotencyKey");
CREATE UNIQUE INDEX "SubscriptionPaymentOrder_subscriptionRequestId_idempotencyKey_key" ON "SubscriptionPaymentOrder"("subscriptionRequestId", "idempotencyKey");
CREATE INDEX "SubscriptionPaymentOrder_restaurantId_status_createdAt_idx" ON "SubscriptionPaymentOrder"("restaurantId", "status", "createdAt");
CREATE INDEX "SubscriptionPaymentOrder_status_expiresAt_idx" ON "SubscriptionPaymentOrder"("status", "expiresAt");
CREATE INDEX "SubscriptionPaymentOrder_requestedByUserId_createdAt_idx" ON "SubscriptionPaymentOrder"("requestedByUserId", "createdAt");

CREATE UNIQUE INDEX "SubscriptionPaymentTransaction_provider_providerTransactionId_key" ON "SubscriptionPaymentTransaction"("provider", "providerTransactionId");
CREATE INDEX "SubscriptionPaymentTransaction_restaurantId_status_receivedAt_idx" ON "SubscriptionPaymentTransaction"("restaurantId", "status", "receivedAt");
CREATE INDEX "SubscriptionPaymentTransaction_paymentOrderId_createdAt_idx" ON "SubscriptionPaymentTransaction"("paymentOrderId", "createdAt");

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");
CREATE INDEX "PaymentWebhookEvent_restaurantId_status_receivedAt_idx" ON "PaymentWebhookEvent"("restaurantId", "status", "receivedAt");
CREATE INDEX "PaymentWebhookEvent_status_createdAt_idx" ON "PaymentWebhookEvent"("status", "createdAt");
CREATE INDEX "PaymentWebhookEvent_paymentOrderId_idx" ON "PaymentWebhookEvent"("paymentOrderId");
CREATE INDEX "PaymentWebhookEvent_paymentTransactionId_idx" ON "PaymentWebhookEvent"("paymentTransactionId");

CREATE UNIQUE INDEX "SubscriptionEntitlement_paymentOrderId_key" ON "SubscriptionEntitlement"("paymentOrderId");
CREATE INDEX "SubscriptionEntitlement_restaurantId_status_endsAt_idx" ON "SubscriptionEntitlement"("restaurantId", "status", "endsAt");
CREATE INDEX "SubscriptionEntitlement_restaurantId_plan_startsAt_idx" ON "SubscriptionEntitlement"("restaurantId", "plan", "startsAt");
CREATE INDEX "SubscriptionEntitlement_subscriptionRequestId_idx" ON "SubscriptionEntitlement"("subscriptionRequestId");

ALTER TABLE "SubscriptionPaymentOrder" ADD CONSTRAINT "SubscriptionPaymentOrder_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPaymentOrder" ADD CONSTRAINT "SubscriptionPaymentOrder_subscriptionRequestId_fkey" FOREIGN KEY ("subscriptionRequestId") REFERENCES "RestaurantSubscriptionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPaymentOrder" ADD CONSTRAINT "SubscriptionPaymentOrder_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionPaymentTransaction" ADD CONSTRAINT "SubscriptionPaymentTransaction_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPaymentTransaction" ADD CONSTRAINT "SubscriptionPaymentTransaction_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "SubscriptionPaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "SubscriptionPaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "SubscriptionPaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionEntitlement" ADD CONSTRAINT "SubscriptionEntitlement_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEntitlement" ADD CONSTRAINT "SubscriptionEntitlement_subscriptionRequestId_fkey" FOREIGN KEY ("subscriptionRequestId") REFERENCES "RestaurantSubscriptionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEntitlement" ADD CONSTRAINT "SubscriptionEntitlement_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "SubscriptionPaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
