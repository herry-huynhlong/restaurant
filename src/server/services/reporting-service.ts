import { prisma } from "@/lib/db/prisma";
import { formatInTimeZone, getBucketKey, getBucketLabel, getPeriodRange, type ReportPeriod } from "@/lib/period";

export async function getRestaurantPaymentReport(restaurantId: string, period: ReportPeriod) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const { start, end } = getPeriodRange(period, timeZone);

  const payments = await prisma.payment.findMany({
    where: {
      restaurantId,
      status: "PAID",
      paidAt: { gte: start, lt: end }
    },
    orderBy: { paidAt: "desc" },
    include: {
      diningSession: {
        include: {
          table: true
        }
      },
      confirmedBy: true
    }
  });

  const revenue = payments.reduce((sum, payment) => sum + (payment.grandTotal || payment.amount), 0);
  const tableKeys = new Set(payments.map((payment) => payment.tableIdSnapshot ?? payment.diningSession.tableId));
  const bucketMap = new Map<string, number>();

  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const key = getBucketKey(payment.paidAt, period, timeZone);
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + (payment.grandTotal || payment.amount));
  }

  const buckets = Array.from(bucketMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, amount]) => ({
      key,
      label: getBucketLabel(key, period),
      amount
    }));

  return {
    timeZone,
    range: { start, end },
    summary: {
      revenue,
      invoiceCount: payments.length,
      paidTableCount: tableKeys.size
    },
    buckets,
    payments: payments.map((payment) => ({
      id: payment.id,
      invoiceNumber: payment.invoiceNumber,
      paidAt: payment.paidAt,
      paidAtLabel: payment.paidAt ? formatInTimeZone(payment.paidAt, timeZone, { dateStyle: "short", timeStyle: "short" }) : "-",
      tableName: payment.tableNameSnapshot ?? payment.diningSession.table.name,
      amount: payment.grandTotal || payment.amount,
      subtotal: payment.subtotalAmount,
      taxAmount: payment.taxAmount,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      confirmedByName: payment.confirmedBy?.name ?? null
    }))
  };
}
