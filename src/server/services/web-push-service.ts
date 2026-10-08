import webPush from "web-push";
import { prisma } from "@/lib/db/prisma";
import type { PushPayload } from "@/lib/push";
import type { RestaurantRole } from "@prisma/client";

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn("[push] missing VAPID config", {
      hasPublicKey: Boolean(publicKey),
      hasPrivateKey: Boolean(privateKey),
      hasSubject: Boolean(subject)
    });
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function endpointSuffix(endpoint: string) {
  return endpoint.slice(-18);
}

export async function sendPushToSubscription(subscriptionId: string, payload: PushPayload) {
  if (!configureWebPush()) {
    return { ok: false, reason: "missing-vapid" };
  }

  const subscription = await prisma.pushSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription?.isActive) {
    return { ok: false, reason: "inactive" };
  }

  try {
    const result = await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      },
      JSON.stringify(payload)
    );
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { lastUsedAt: new Date(), isActive: true }
    });
    console.info("[push] sent", {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      restaurantId: subscription.restaurantId,
      endpointSuffix: endpointSuffix(subscription.endpoint),
      title: payload.title,
      tag: payload.tag,
      statusCode: result.statusCode
    });
    return { ok: true };
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : undefined;
    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.delete({
        where: { id: subscription.id },
      });
    } else {
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastUsedAt: new Date() }
      }).catch(() => undefined);
    }
    console.error("[push] failed", {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      restaurantId: subscription.restaurantId,
      endpointSuffix: endpointSuffix(subscription.endpoint),
      title: payload.title,
      tag: payload.tag,
      statusCode,
      reason: error instanceof Error ? error.message : String(error)
    });
    return { ok: false, reason: `push-error-${statusCode ?? "unknown"}` };
  }
}

export async function sendPushToRestaurantRoles({
  restaurantId,
  roles,
  payload
}: {
  restaurantId: string;
  roles: RestaurantRole[];
  payload: PushPayload;
}) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      restaurantId,
      isActive: true,
      user: {
        memberships: {
          some: {
            restaurantId,
            isActive: true,
            role: { in: roles }
          }
        }
      }
    }
  });

  console.info("[push] recipients", {
    restaurantId,
    roles,
    count: subscriptions.length,
    title: payload.title
  });

  const results = await Promise.all(subscriptions.map((subscription) => sendPushToSubscription(subscription.id, payload)));
  console.info("[push] result", {
    restaurantId,
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    reasons: results.filter((result) => !result.ok).map((result) => result.reason)
  });

  return results;
}

export function getPushTargetsForEvent(type: "ORDER_CREATED" | "SERVICE_REQUEST_CREATED" | "PAYMENT_REQUESTED" | "ORDER_READY"): RestaurantRole[] {
  switch (type) {
    case "ORDER_CREATED":
      return ["WAITER", "KITCHEN", "OWNER", "MANAGER"];
    case "SERVICE_REQUEST_CREATED":
      return ["WAITER", "OWNER", "MANAGER"];
    case "PAYMENT_REQUESTED":
      return ["CASHIER", "WAITER", "OWNER", "MANAGER"];
    case "ORDER_READY":
      return ["WAITER", "OWNER", "MANAGER"];
  }
}
