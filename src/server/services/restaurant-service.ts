import { prisma } from "@/lib/db/prisma";
import { formatInTimeZone, getBucketKey, getPeriodRange } from "@/lib/period";

export async function getRestaurantAdminOverview(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      status: true,
      plan: true,
      planEntitlement: true,
      businessType: true,
      settings: {
        select: {
          logoUrl: true,
          timezone: true
        }
      }
    }
  });
  const timeZone = restaurant?.settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const { start, end } = getPeriodRange("today", timeZone);
  const yesterdayRange = getPeriodRange("today", timeZone, new Date(start.getTime() - 1000));
  const sevenDayStart = new Date(start);
  sevenDayStart.setUTCDate(sevenDayStart.getUTCDate() - 6);

  const [
    paidTablesToday,
    paidPaymentsToday,
    paidPaymentsYesterday,
    paidPaymentsSevenDays,
    ordersToday,
    recentOrders,
    occupiedTables,
    availableTables,
    waitingPaymentTables,
    pendingRequests
  ] = await Promise.all([
    prisma.payment.count({
      where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } }
    }),
    prisma.payment.findMany({
      where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } },
      select: { amount: true, grandTotal: true }
    }),
    prisma.payment.findMany({
      where: { restaurantId, status: "PAID", paidAt: { gte: yesterdayRange.start, lt: yesterdayRange.end } },
      select: { amount: true, grandTotal: true }
    }),
    prisma.payment.findMany({
      where: { restaurantId, status: "PAID", paidAt: { gte: sevenDayStart, lt: end } },
      select: { amount: true, grandTotal: true, paidAt: true }
    }),
    prisma.order.count({
      where: { restaurantId, createdAt: { gte: start, lt: end } }
    }),
    prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        subtotal: true,
        status: true,
        createdAt: true,
        table: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.restaurantTable.count({ where: { restaurantId, status: { not: "AVAILABLE" } } }),
    prisma.restaurantTable.count({ where: { restaurantId, status: "AVAILABLE" } }),
    prisma.restaurantTable.count({ where: { restaurantId, status: "PAYMENT_REQUESTED" } }),
    prisma.serviceRequest.count({ where: { restaurantId, status: "NEW" } })
  ]);

  const revenueToday = sumPayments(paidPaymentsToday);
  const revenueYesterday = sumPayments(paidPaymentsYesterday);
  const revenueTrendMap = new Map<string, number>();

  for (const payment of paidPaymentsSevenDays) {
    if (!payment.paidAt) continue;
    const key = getBucketKey(payment.paidAt, "today", timeZone);
    revenueTrendMap.set(key, (revenueTrendMap.get(key) ?? 0) + (payment.grandTotal || payment.amount));
  }

  const revenueTrend = Array.from({ length: 7 }).map((_, index) => {
    const bucketDate = new Date(sevenDayStart);
    bucketDate.setUTCDate(sevenDayStart.getUTCDate() + index);
    const key = getBucketKey(bucketDate, "today", timeZone);

    return {
      key,
      label: formatInTimeZone(bucketDate, timeZone, { day: "2-digit", month: "2-digit" }),
      amount: revenueTrendMap.get(key) ?? 0
    };
  });
  const totalTables = occupiedTables + availableTables;

  return {
    restaurant: restaurant ? {
      name: restaurant.name,
      slug: restaurant.slug,
      logoUrl: restaurant.settings?.logoUrl ?? restaurant.logoUrl,
      status: restaurant.status,
      plan: restaurant.plan,
      planEntitlement: restaurant.planEntitlement,
      businessType: restaurant.businessType,
      timeZone
    } : null,
    paidTablesToday,
    revenueToday,
    revenueYesterday,
    revenueComparison: buildRevenueComparison(revenueToday, revenueYesterday),
    orderCountToday: ordersToday,
    occupiedTables,
    availableTables,
    waitingPaymentTables,
    totalTables,
    tableUtilization: totalTables > 0 ? Math.round(occupiedTables / totalTables * 100) : 0,
    pendingRequests,
    revenueTrend,
    revenueTrendTotal: revenueTrend.reduce((sum, item) => sum + item.amount, 0),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      tableName: order.table.name,
      subtotal: order.subtotal,
      status: order.status,
      createdAtLabel: formatInTimeZone(order.createdAt, timeZone, { timeStyle: "short" })
    }))
  };
}

function sumPayments(payments: Array<{ amount: number; grandTotal: number }>) {
  return payments.reduce((sum, payment) => sum + (payment.grandTotal || payment.amount), 0);
}

function buildRevenueComparison(current: number, previous: number) {
  if (previous > 0) {
    const percent = (current - previous) / previous * 100;
    return {
      direction: percent > 0 ? "up" as const : percent < 0 ? "down" as const : "flat" as const,
      label: percent === 0 ? "Không đổi so với hôm qua" : `${percent > 0 ? "↑" : "↓"} ${Math.abs(percent).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% so với hôm qua`
    };
  }

  if (current > 0) {
    return {
      direction: "up" as const,
      label: "Có doanh thu mới hôm nay"
    };
  }

  return {
    direction: "flat" as const,
    label: "Chưa có doanh thu hôm nay"
  };
}
