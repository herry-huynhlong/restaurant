import { prisma } from "@/lib/db/prisma";
import { canRoleAccessPlan } from "@/lib/plan/features";
import { platformRoutes, restaurantRoutes } from "@/lib/routes";

export async function getPostLoginPath(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_ADMIN") {
    return platformRoutes.dashboard;
  }

  const memberships = await prisma.restaurantUser.findMany({
    where: { userId, isActive: true },
    include: {
      restaurant: {
        select: { slug: true, status: true, plan: true, businessType: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (memberships.length !== 1) {
    return "/select-restaurant";
  }

  const membership = memberships[0];
  if (membership.restaurant.status !== "ACTIVE") {
    return restaurantRoutes.locked(membership.restaurant.slug);
  }

  if (!canRoleAccessPlan(membership.restaurant.plan, membership.role, membership.restaurant.businessType)) {
    return "/unauthorized";
  }

  const slug = membership.restaurant.slug;

  switch (membership.role) {
    case "OWNER":
    case "MANAGER":
      return restaurantRoutes.admin(slug);
    case "WAITER":
      return `${restaurantRoutes.deviceSetup(slug)}?next=${encodeURIComponent(restaurantRoutes.staff(slug))}`;
    case "KITCHEN":
      return `${restaurantRoutes.deviceSetup(slug)}?next=${encodeURIComponent(restaurantRoutes.kitchen(slug))}`;
    case "CASHIER":
      return `${restaurantRoutes.deviceSetup(slug)}?next=${encodeURIComponent(restaurantRoutes.cashier(slug))}`;
    default:
      return "/unauthorized";
  }
}
