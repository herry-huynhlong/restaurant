import { prisma } from "@/lib/db/prisma";
import { getPeriodRange } from "@/lib/period";

export async function getRestaurantAdminOverview(restaurantId: string) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const { start, end } = getPeriodRange("today", settings?.timezone ?? "Asia/Ho_Chi_Minh");

  const [
    paidTablesToday,
    paidPaymentsToday,
    occupiedTables,
    availableTables,
    pendingRequests
  ] = await Promise.all([
    prisma.payment.count({
      where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } }
    }),
    prisma.payment.findMany({
      where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } },
      select: { amount: true, grandTotal: true }
    }),
    prisma.restaurantTable.count({ where: { restaurantId, status: { not: "AVAILABLE" } } }),
    prisma.restaurantTable.count({ where: { restaurantId, status: "AVAILABLE" } }),
    prisma.serviceRequest.count({ where: { restaurantId, status: "NEW" } })
  ]);

  return {
    paidTablesToday,
    revenueToday: paidPaymentsToday.reduce((sum, payment) => sum + (payment.grandTotal || payment.amount), 0),
    occupiedTables,
    availableTables,
    pendingRequests
  };
}
