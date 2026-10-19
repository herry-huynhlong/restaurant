import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export async function getRestaurantBySlug(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    include: { settings: true }
  });

  if (!restaurant) {
    notFound();
  }

  return restaurant;
}

export function getEffectiveSubscriptionStatus(
  subscriptionEnd: Date | null,
  storedStatus: string,
  gracePeriodDays = 0,
  now = new Date()
) {
  if (storedStatus !== "ACTIVE") {
    return storedStatus;
  }

  const graceEndsAt = subscriptionEnd
    ? subscriptionEnd.getTime() + Math.max(gracePeriodDays, 0) * 24 * 60 * 60 * 1000
    : null;
  if (graceEndsAt !== null && graceEndsAt < now.getTime()) {
    return "EXPIRED";
  }

  return storedStatus;
}

export async function canRestaurantOperate(input: {
  restaurantStatus: string;
  subscriptionStatus: string;
  subscriptionEnd: Date | null;
}) {
  const policy = await prisma.platformSubscriptionPolicy.upsert({
    where: { singletonKey: "default" },
    create: { singletonKey: "default" },
    update: {}
  });
  const effectiveSubscriptionStatus = getEffectiveSubscriptionStatus(
    input.subscriptionEnd,
    input.subscriptionStatus,
    policy.gracePeriodDays
  );

  return input.restaurantStatus === "ACTIVE" && effectiveSubscriptionStatus === "ACTIVE";
}
