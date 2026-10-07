import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import type { RestaurantRole } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hasAnyRestaurantRole } from "@/lib/rbac/roles";
import { restaurantRoutes } from "@/lib/routes";

export async function requireAuthenticatedUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user;
}

export async function requirePlatformAdmin() {
  const user = await requireAuthenticatedUser();

  if (user.platformRole !== "PLATFORM_ADMIN") {
    redirect("/unauthorized");
  }

  return user;
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
      subscriptionStatus: true
    }
  });

  if (!restaurant) {
    notFound();
  }

  if (restaurant.status !== "ACTIVE") {
    redirect(restaurantRoutes.locked(restaurant.slug));
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

  return { user, restaurant, membership };
}
