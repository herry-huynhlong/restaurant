import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createSubscriptionPaymentOrder } from "@/server/services/subscription-payment-service";
import {
  confirmSubscriptionRequest,
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

  try {
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

    const concurrentConfirmations = await Promise.allSettled([
      confirmSubscriptionRequest(requestId, user.id),
      confirmSubscriptionRequest(requestId, user.id)
    ]);
    assert.equal(
      concurrentConfirmations.filter((result) => result.status === "fulfilled").length,
      1,
      "A request must be confirmed only once under concurrent confirmation."
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
    await prisma.paymentWebhookEvent.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.subscriptionPaymentTransaction.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.subscriptionEntitlement.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.subscriptionPaymentOrder.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantSubscriptionEvent.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantSubscriptionRequest.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

run().finally(() => prisma.$disconnect());
