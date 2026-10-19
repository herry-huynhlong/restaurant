import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createSubscriptionPaymentOrder } from "@/server/services/subscription-payment-service";
import { processSePaySubscriptionWebhook } from "@/server/services/subscription-sepay-webhook-service";
import {
  createSubscriptionRequest,
  expireStaleSubscriptionRequests
} from "@/server/services/subscription-service";

const databaseUrl = process.env.SUBSCRIPTION_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("SUBSCRIPTION_TEST_DATABASE_URL is required. This test refuses to choose a database automatically.");
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
if (!/(^|[_-])test([_-]|$)/i.test(databaseName)) {
  throw new Error("SUBSCRIPTION_TEST_DATABASE_URL must point to a database whose name contains 'test'.");
}
if (process.env.DATABASE_URL !== databaseUrl) {
  throw new Error("Set DATABASE_URL equal to SUBSCRIPTION_TEST_DATABASE_URL before running this integration test.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
const email = `subscription-it-${suffix}@example.test`;
const slug = `subscription-it-${suffix}`;

async function run() {
  process.env.SEPAY_SUBSCRIPTION_WEBHOOK_API_KEY = "subscription-integration-test";
  const previousPaymentConfig = await prisma.platformSubscriptionPaymentConfig.findUnique({
    where: { singletonKey: "default" }
  });
  const user = await prisma.user.create({
    data: {
      name: "Subscription integration test",
      email,
      passwordHash: "not-used-by-test"
    }
  });
  const restaurant = await prisma.restaurant.create({
    data: { name: "Subscription integration test", slug }
  });
  let secondUserId: string | null = null;
  let secondRestaurantId: string | null = null;
  let disabledUserId: string | null = null;
  let disabledRestaurantId: string | null = null;

  try {
    await prisma.platformSubscriptionPaymentConfig.upsert({
      where: { singletonKey: "default" },
      create: {
        singletonKey: "default",
        isEnabled: true,
        bankCode: "VCB",
        accountNumber: "123456789",
        accountName: "QuánPilot Test"
      },
      update: {
        isEnabled: true,
        bankCode: "VCB",
        accountNumber: "123456789",
        accountName: "QuánPilot Test"
      }
    });
    await Promise.all([
      prisma.platformPlanPrice.upsert({
        where: { plan_termMonths: { plan: "BASIC", termMonths: 3 } },
        create: { plan: "BASIC", termMonths: 3, priceVnd: 657000, monthlyPriceVnd: 219000, isActive: true },
        update: { isActive: true }
      }),
      prisma.platformPlanPrice.upsert({
        where: { plan_termMonths: { plan: "PRO", termMonths: 3 } },
        create: { plan: "PRO", termMonths: 3, priceVnd: 1197000, monthlyPriceVnd: 399000, isActive: true },
        update: { isActive: true }
      })
    ]);

    const concurrentRequests = await Promise.allSettled([
      createSubscriptionRequest({ restaurantId: restaurant.id, requestedByUserId: user.id, plan: "BASIC", termMonths: 3 }),
      createSubscriptionRequest({ restaurantId: restaurant.id, requestedByUserId: user.id, plan: "BASIC", termMonths: 3 })
    ]);
    const createdRequests = concurrentRequests.filter((result) => result.status === "fulfilled");
    assert.equal(createdRequests.length, 1, "Concurrent subscription requests must leave exactly one pending request.");
    const createdRequest = createdRequests[0];
    if (createdRequest.status !== "fulfilled") {
      throw new Error("Expected one fulfilled subscription request.");
    }
    const requestId = createdRequest.value.id;

    const concurrentOrders = await Promise.all([
      createSubscriptionPaymentOrder({ restaurantId: restaurant.id, requestedByUserId: user.id, subscriptionRequestId: requestId }),
      createSubscriptionPaymentOrder({ restaurantId: restaurant.id, requestedByUserId: user.id, subscriptionRequestId: requestId })
    ]);
    assert.equal(concurrentOrders[0].id, concurrentOrders[1].id, "Retrying payment-order creation must return the same pending order.");
    assert.equal(concurrentOrders[0].receiverBankCode, "VCB", "Payment order must snapshot the platform bank.");
    assert.equal(concurrentOrders[0].receiverAccountNumber, "123456789", "Payment order must snapshot the platform account.");
    assert.equal(concurrentOrders[0].provider, "SEPAY", "A configured SePay webhook must mark new orders as SePay orders.");

    const verifiedResults = await Promise.all([
      processSePaySubscriptionWebhook({
        payload: {
          id: `sepay-${suffix}`,
          accountNumber: "123456789",
          transferType: "in",
          transferAmount: concurrentOrders[0].amountVnd,
          code: concurrentOrders[0].transferCode
        },
        rawPayload: {
          id: `sepay-${suffix}`,
          accountNumber: "123456789",
          transferType: "in",
          transferAmount: concurrentOrders[0].amountVnd,
          code: concurrentOrders[0].transferCode
        }
      }),
      processSePaySubscriptionWebhook({
        payload: {
          id: `sepay-${suffix}`,
          accountNumber: "123456789",
          transferType: "in",
          transferAmount: concurrentOrders[0].amountVnd,
          code: concurrentOrders[0].transferCode
        },
        rawPayload: {
          id: `sepay-${suffix}`,
          accountNumber: "123456789",
          transferType: "in",
          transferAmount: concurrentOrders[0].amountVnd,
          code: concurrentOrders[0].transferCode
        }
      })
    ]);
    assert.equal(verifiedResults.filter((result) => result.status === "PAID" || result.duplicate).length, 2, "Repeated SePay callbacks must be idempotent.");
    assert.equal(await prisma.subscriptionPaymentTransaction.count({ where: { paymentOrderId: concurrentOrders[0].id } }), 1, "One provider transaction must create only one payment record.");
    assert.equal((await prisma.subscriptionPaymentOrder.findUniqueOrThrow({ where: { id: concurrentOrders[0].id } })).status, "PAID", "A matching SePay transaction must mark the order paid.");
    assert.equal((await prisma.restaurantSubscriptionRequest.findUniqueOrThrow({ where: { id: requestId } })).status, "CONFIRMED", "A matching SePay transaction must activate the subscription automatically.");
    assert.equal(await prisma.subscriptionEntitlement.count({ where: { paymentOrderId: concurrentOrders[0].id } }), 1, "Repeated SePay callbacks must create only one entitlement.");

    const secondUser = await prisma.user.create({
      data: { name: "Second subscription integration test", email: `subscription-it-second-${suffix}@example.test`, passwordHash: "not-used-by-test" }
    });
    secondUserId = secondUser.id;
    const secondRestaurant = await prisma.restaurant.create({
      data: { name: "Second subscription integration test", slug: `subscription-second-${suffix}` }
    });
    secondRestaurantId = secondRestaurant.id;
    const secondRequest = await createSubscriptionRequest({
      restaurantId: secondRestaurant.id,
      requestedByUserId: secondUser.id,
      plan: "BASIC",
      termMonths: 3
    });
    const secondOrder = await createSubscriptionPaymentOrder({
      restaurantId: secondRestaurant.id,
      requestedByUserId: secondUser.id,
      subscriptionRequestId: secondRequest.id
    });
    assert.notEqual(secondOrder.transferCode, concurrentOrders[0].transferCode, "Each restaurant must receive a unique transfer code.");
    assert.equal(secondOrder.receiverBankCode, "VCB", "Concurrent restaurants must snapshot the configured bank.");
    assert.equal(secondOrder.receiverAccountNumber, "123456789", "Concurrent restaurants must snapshot the configured account.");
    const reviewResult = await processSePaySubscriptionWebhook({
      payload: {
        id: `sepay-review-${suffix}`,
        accountNumber: "123456789",
        transferType: "in",
        transferAmount: secondOrder.amountVnd - 1,
        code: secondOrder.transferCode
      },
      rawPayload: {
        id: `sepay-review-${suffix}`,
        accountNumber: "123456789",
        transferType: "in",
        transferAmount: secondOrder.amountVnd - 1,
        code: secondOrder.transferCode
      }
    });
    assert.equal(reviewResult.status, "NEEDS_REVIEW", "A SePay transaction with the wrong amount must require review.");

    await prisma.platformSubscriptionPaymentConfig.update({
      where: { singletonKey: "default" },
      data: {
        bankCode: "MB",
        accountNumber: "987654321",
        accountName: "QuánPilot Updated",
        version: { increment: 1 }
      }
    });
    const originalOrder = await prisma.subscriptionPaymentOrder.findUniqueOrThrow({ where: { id: concurrentOrders[0].id } });
    assert.equal(originalOrder.receiverAccountNumber, "123456789", "Changing bank config must not modify an existing payment order.");

    await prisma.platformSubscriptionPaymentConfig.update({
      where: { singletonKey: "default" },
      data: { isEnabled: false }
    });
    const disabledUser = await prisma.user.create({
      data: { name: "Disabled payment test", email: `subscription-it-disabled-${suffix}@example.test`, passwordHash: "not-used-by-test" }
    });
    disabledUserId = disabledUser.id;
    const disabledRestaurant = await prisma.restaurant.create({
      data: { name: "Disabled payment test", slug: `subscription-disabled-${suffix}` }
    });
    disabledRestaurantId = disabledRestaurant.id;
    const disabledRequest = await createSubscriptionRequest({
      restaurantId: disabledRestaurant.id,
      requestedByUserId: disabledUser.id,
      plan: "BASIC",
      termMonths: 3
    });
    await assert.rejects(
      () => createSubscriptionPaymentOrder({ restaurantId: disabledRestaurant.id, requestedByUserId: disabledUser.id, subscriptionRequestId: disabledRequest.id }),
      /chưa sẵn sàng/i,
      "Disabled platform payment must reject new checkout attempts."
    );

    const expiringRequest = await createSubscriptionRequest({
      restaurantId: restaurant.id,
      requestedByUserId: user.id,
      plan: "BASIC",
      termMonths: 3
    });
    await prisma.restaurantSubscriptionRequest.update({
      where: { id: expiringRequest.id },
      data: { quoteExpiresAt: new Date(Date.now() - 1000) }
    });
    await expireStaleSubscriptionRequests(new Date());
    const expired = await prisma.restaurantSubscriptionRequest.findUniqueOrThrow({ where: { id: expiringRequest.id } });
    assert.equal(expired.status, "EXPIRED", "Expired quotes must not remain pending.");

    console.log("Subscription PostgreSQL integration checks passed.");
  } finally {
    if (disabledRestaurantId) {
      await prisma.auditLog.deleteMany({ where: { restaurantId: disabledRestaurantId } });
      await prisma.restaurantSubscriptionRequest.deleteMany({ where: { restaurantId: disabledRestaurantId } });
      await prisma.restaurant.delete({ where: { id: disabledRestaurantId } });
    }
    if (disabledUserId) await prisma.user.delete({ where: { id: disabledUserId } });
    if (secondRestaurantId) {
      await prisma.paymentWebhookEvent.deleteMany({ where: { restaurantId: secondRestaurantId } });
      await prisma.subscriptionPaymentTransaction.deleteMany({ where: { restaurantId: secondRestaurantId } });
      await prisma.subscriptionEntitlement.deleteMany({ where: { restaurantId: secondRestaurantId } });
      await prisma.subscriptionPaymentOrder.deleteMany({ where: { restaurantId: secondRestaurantId } });
      await prisma.restaurantSubscriptionEvent.deleteMany({ where: { restaurantId: secondRestaurantId } });
      await prisma.auditLog.deleteMany({ where: { restaurantId: secondRestaurantId } });
      await prisma.restaurantSubscriptionRequest.deleteMany({ where: { restaurantId: secondRestaurantId } });
      await prisma.restaurant.delete({ where: { id: secondRestaurantId } });
    }
    if (secondUserId) await prisma.user.delete({ where: { id: secondUserId } });
    await prisma.paymentWebhookEvent.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.subscriptionPaymentTransaction.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.subscriptionEntitlement.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.subscriptionPaymentOrder.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantSubscriptionEvent.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantSubscriptionRequest.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
    await prisma.user.delete({ where: { id: user.id } });
    if (previousPaymentConfig) {
      await prisma.platformSubscriptionPaymentConfig.update({
        where: { id: previousPaymentConfig.id },
        data: {
          isEnabled: previousPaymentConfig.isEnabled,
          bankCode: previousPaymentConfig.bankCode,
          accountNumber: previousPaymentConfig.accountNumber,
          accountName: previousPaymentConfig.accountName,
          version: previousPaymentConfig.version,
          lastChangedByUserId: previousPaymentConfig.lastChangedByUserId
        }
      });
    } else {
      await prisma.platformSubscriptionPaymentConfig.deleteMany({ where: { singletonKey: "default" } });
    }
  }
}

run().finally(() => prisma.$disconnect());
