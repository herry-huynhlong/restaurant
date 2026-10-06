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

export function getEffectiveSubscriptionStatus(subscriptionEnd: Date | null, storedStatus: string) {
  if (subscriptionEnd && subscriptionEnd.getTime() < Date.now()) {
    return "EXPIRED";
  }

  return storedStatus;
}

export function canRestaurantOperate(input: {
  restaurantStatus: string;
  subscriptionStatus: string;
  subscriptionEnd: Date | null;
}) {
  const effectiveSubscriptionStatus = getEffectiveSubscriptionStatus(
    input.subscriptionEnd,
    input.subscriptionStatus
  );

  return input.restaurantStatus === "ACTIVE" && effectiveSubscriptionStatus === "ACTIVE";
}
