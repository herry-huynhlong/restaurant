import { prisma } from "@/lib/db/prisma";

export async function getRestaurantAdminOverview(restaurantId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    categories,
    products,
    tables,
    staff,
    ordersToday,
    revenueTodayResult,
    occupiedTables,
    availableTables,
    pendingRequests,
    topItem
  ] = await Promise.all([
    prisma.category.count({ where: { restaurantId } }),
    prisma.product.count({ where: { restaurantId } }),
    prisma.restaurantTable.count({ where: { restaurantId } }),
    prisma.restaurantUser.count({ where: { restaurantId, isActive: true } }),
    prisma.order.count({ where: { restaurantId, createdAt: { gte: startOfToday } } }),
    prisma.payment.aggregate({
      where: { restaurantId, status: "PAID", paidAt: { gte: startOfToday } },
      _sum: { amount: true }
    }),
    prisma.restaurantTable.count({ where: { restaurantId, status: { not: "AVAILABLE" } } }),
    prisma.restaurantTable.count({ where: { restaurantId, status: "AVAILABLE" } }),
    prisma.serviceRequest.count({ where: { restaurantId, status: "NEW" } }),
    prisma.orderItem.groupBy({
      by: ["productNameViSnapshot"],
      where: { restaurantId },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1
    })
  ]);

  return {
    categories,
    products,
    tables,
    staff,
    ordersToday,
    revenueToday: revenueTodayResult._sum.amount ?? 0,
    occupiedTables,
    availableTables,
    pendingRequests,
    topProduct: topItem[0]?.productNameViSnapshot
  };
}
