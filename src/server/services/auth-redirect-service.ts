import { prisma } from "@/lib/db/prisma";
import { canRoleAccessPlan } from "@/lib/plan/features";
import { isPlatformAdminRole } from "@/lib/rbac/guards";
import { platformRoutes, restaurantRoutes } from "@/lib/routes";

export async function getPostLoginPath(userId: string, platformRole: string) {
  if (isPlatformAdminRole(platformRole)) {
    return platformRoutes.dashboard;
  }

  return getRestaurantPostLoginPath(userId);
}

// Customer entry deliberately resolves memberships, never the platform role.
export async function getRestaurantPostLoginPath(userId: string, restaurantSlug?: string) {
  const user = await prisma.user.findUnique({where:{id:userId},select:{isActive:true}});
  if (!user?.isActive) return "/restaurant-login";
  const memberships = await prisma.restaurantUser.findMany({
    where: { userId, isActive: true, deletedAt: null, ...(restaurantSlug ? { restaurant: { slug: restaurantSlug } } : {}) },
    include: {
      restaurant: {
        select: { slug: true, status: true, plan: true, planEntitlement: true, businessType: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (restaurantSlug && memberships.length === 0) return "/unauthorized";
  if (memberships.length !== 1) {
    return "/select-restaurant";
  }

  const membership = memberships[0];
  if (membership.restaurant.status !== "ACTIVE") {
    return restaurantRoutes.locked(membership.restaurant.slug);
  }

  if (!canRoleAccessPlan(membership.restaurant.plan, membership.role, membership.restaurant.businessType, membership.restaurant.planEntitlement)) {
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
