import type {
  RestaurantPlan,
  PlanEntitlement,
  BusinessType,
  RestaurantStatus,
  SubscriptionStatus,
} from "@prisma/client";
import type { prisma } from "@/lib/db/prisma";
type ProvisionTransaction = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
export type RestaurantProvisionInput = {
  name: string;
  slug: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
  timezone: string;
  primaryLanguage: string;
  currency: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  businessType: BusinessType;
  plan: RestaurantPlan;
  planEntitlement: PlanEntitlement;
  subscriptionStatus: SubscriptionStatus;
  status: RestaurantStatus;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
};
// Both Platform Admin and self-registration use these records in their caller's transaction.
export async function createRestaurantRecords(
  tx: ProvisionTransaction,
  input: RestaurantProvisionInput,
  passwordHash: string,
  actorId: string | null,
  ownerMode: "reuse" | "new" = "reuse",
) {
  const restaurant = await tx.restaurant.create({
    data: {
      name: input.name,
      slug: input.slug,
      logoUrl: input.logoUrl ?? null,
      status: input.status,
      businessType: input.businessType,
      plan: input.plan,
      planEntitlement:
        input.plan === "TRAIN"
          ? input.planEntitlement
          : input.plan === "PRO"
            ? "PRO"
            : "BASIC",
      subscriptionStatus: input.subscriptionStatus,
      subscriptionStart: input.subscriptionStart,
      subscriptionEnd: input.subscriptionEnd,
    },
  });
  const ownerData = {
    name: input.ownerName,
    email: input.ownerEmail,
    phone: input.ownerPhone ?? null,
    passwordHash,
  };
  const owner =
    ownerMode === "new"
      ? await tx.user.create({ data: ownerData })
      : await tx.user.upsert({
          where: { email: input.ownerEmail },
          update: { name: input.ownerName, phone: input.ownerPhone ?? null },
          create: ownerData,
        });
  await tx.restaurantUser.create({
    data: {
      restaurantId: restaurant.id,
      userId: owner.id,
      username: input.ownerEmail,
      role: "OWNER",
    },
  });
  await tx.restaurantSetting.create({
    data: {
      restaurantId: restaurant.id,
      restaurantName: input.name,
      logoUrl: input.logoUrl ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      timezone: input.timezone,
      primaryLanguage: input.primaryLanguage,
      currency: input.currency,
    },
  });
  await tx.area.create({
    data: { restaurantId: restaurant.id, name: "Khu vực mặc định" },
  });
  await tx.auditLog.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        userId: actorId,
        action: "RESTAURANT_CREATED",
        entityType: "Restaurant",
        entityId: restaurant.id,
        metadataJson: {
          slug: restaurant.slug,
          plan: restaurant.plan,
          planEntitlement: restaurant.planEntitlement,
          businessType: restaurant.businessType,
        },
      },
      {
        restaurantId: restaurant.id,
        userId: actorId,
        action: "OWNER_CREATED",
        entityType: "User",
        entityId: owner.id,
        metadataJson: { email: owner.email },
      },
    ],
  });
  return { restaurant, owner };
}
