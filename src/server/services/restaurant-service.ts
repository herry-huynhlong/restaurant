import { prisma } from "@/lib/db/prisma";
import { getPeriodRange } from "@/lib/period";

export async function getRestaurantAdminOverview(restaurantId: string) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const { start, end } = getPeriodRange("today", settings?.timezone ?? "Asia/Ho_Chi_Minh");

  const [
    ordersToday,
    paidPaymentsToday,
    occupiedTables,
    availableTables,
    pendingRequests,
    topItem
  ] = await Promise.all([
    prisma.order.count({ where: { restaurantId, createdAt: { gte: start, lt: end } } }),
    prisma.payment.findMany({
      where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } },
      select: { amount: true, grandTotal: true }
    }),
    prisma.restaurantTable.count({ where: { restaurantId, status: { not: "AVAILABLE" } } }),
    prisma.restaurantTable.count({ where: { restaurantId, status: "AVAILABLE" } }),
    prisma.serviceRequest.count({ where: { restaurantId, status: "NEW" } }),
    prisma.orderItem.groupBy({
      by: ["productNameViSnapshot"],
      where: { restaurantId, createdAt: { gte: start, lt: end } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1
    })
  ]);

  return {
    ordersToday,
    revenueToday: paidPaymentsToday.reduce((sum, payment) => sum + (payment.grandTotal || payment.amount), 0),
    occupiedTables,
    availableTables,
    pendingRequests,
    topProduct: topItem[0]?.productNameViSnapshot
  };
}
