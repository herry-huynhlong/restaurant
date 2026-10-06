import { prisma } from "@/lib/db/prisma";

export async function getPlatformOverview() {
  const [totalRestaurants, activeRestaurants, inactiveRestaurants, totalOrders, restaurants] =
    await Promise.all([
      prisma.restaurant.count(),
      prisma.restaurant.count({ where: { status: "ACTIVE" } }),
      prisma.restaurant.count({ where: { status: "INACTIVE" } }),
      prisma.order.count(),
      prisma.restaurant.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              tables: true,
              users: true,
              orders: true
            }
          }
        }
      })
    ]);

  return {
    totalRestaurants,
    activeRestaurants,
    inactiveRestaurants,
    totalOrders,
    restaurants
  };
}
