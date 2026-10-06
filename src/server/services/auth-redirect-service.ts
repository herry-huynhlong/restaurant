import { prisma } from "@/lib/db/prisma";
import { platformRoutes, restaurantRoutes } from "@/lib/routes";

export async function getPostLoginPath(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_ADMIN") {
    return platformRoutes.dashboard;
  }

  const memberships = await prisma.restaurantUser.findMany({
    where: { userId, isActive: true },
    include: {
      restaurant: {
        select: { slug: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (memberships.length !== 1) {
    return "/select-restaurant";
  }

  const membership = memberships[0];
  const slug = membership.restaurant.slug;

  switch (membership.role) {
    case "OWNER":
    case "MANAGER":
      return restaurantRoutes.admin(slug);
    case "WAITER":
      return restaurantRoutes.staff(slug);
    case "KITCHEN":
      return restaurantRoutes.kitchen(slug);
    case "CASHIER":
      return restaurantRoutes.cashier(slug);
    default:
      return "/unauthorized";
  }
}
