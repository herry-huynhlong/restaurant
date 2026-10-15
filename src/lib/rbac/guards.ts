import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import type { PlatformRole, RestaurantRole } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { canRoleAccessPlan, hasPlanFeature, type PlanFeature } from "@/lib/plan/features";
import { hasAnyRestaurantRole } from "@/lib/rbac/roles";
import { restaurantRoutes } from "@/lib/routes";
import { isRestaurantInMaintenance } from "@/lib/restaurant-maintenance";

export async function requireAuthenticatedUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user;
}

export async function requirePlatformAdmin() {
  const user = await requireAuthenticatedUser();

  if (!isPlatformAdminRole(user.platformRole)) {
    redirect("/unauthorized");
  }

  return user;
}

export async function requirePlatformOwner() {
  const user = await requireAuthenticatedUser();

  if (!isPlatformOwnerRole(user.platformRole)) {
    redirect("/unauthorized");
  }

  return user;
}

export function isPlatformOwnerRole(role: PlatformRole | string | null | undefined) {
  return role === "PLATFORM_OWNER" || role === "PLATFORM_ADMIN";
}

export function isPlatformSubAdminRole(role: PlatformRole | string | null | undefined) {
  return role === "PLATFORM_SUB_ADMIN";
}

export function isPlatformAdminRole(role: PlatformRole | string | null | undefined) {
  return isPlatformOwnerRole(role) || isPlatformSubAdminRole(role);
}

export async function requireRestaurantAccess(rSlug: string, allowedRoles?: RestaurantRole[]) {
  const user = await requireAuthenticatedUser();

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: rSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      subscriptionStatus: true,
      subscriptionStart: true,
      subscriptionEnd: true,
      plan: true,
      planEntitlement: true,
      businessType: true
    }
  });

  if (!restaurant) {
    notFound();
  }

  if (restaurant.status !== "ACTIVE") {
    redirect(restaurantRoutes.locked(restaurant.slug));
  }

  if (await isRestaurantInMaintenance(restaurant.id)) {
    redirect(`${restaurantRoutes.locked(restaurant.slug)}?maintenance=1`);
  }

  const membership = await prisma.restaurantUser.findUnique({
    where: {
      restaurantId_userId: {
        restaurantId: restaurant.id,
        userId: user.id
      }
    },
    select: {
      id: true,
      role: true,
      isActive: true
    }
  });

  if (!membership?.isActive) {
    redirect("/unauthorized");
  }

  if (allowedRoles && !hasAnyRestaurantRole(membership.role, allowedRoles)) {
    redirect("/unauthorized");
  }

  if (!canRoleAccessPlan(restaurant.plan, membership.role, restaurant.businessType, restaurant.planEntitlement)) {
    redirect("/unauthorized");
  }

  return { user, restaurant, membership };
}

export function requireRestaurantFeature(
  access: Awaited<ReturnType<typeof requireRestaurantAccess>>,
  feature: PlanFeature
) {
  if (!hasPlanFeature(access.restaurant.plan, feature, access.restaurant.businessType, access.restaurant.planEntitlement)) {
    redirect("/unauthorized");
  }
}
