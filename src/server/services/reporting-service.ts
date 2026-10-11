import { prisma } from "@/lib/db/prisma";
import { formatInTimeZone, getBucketKey, getBucketLabel, getPeriodRange, getPreviousPeriodRange, type ReportPeriod } from "@/lib/period";
import { paymentMethodLabels } from "@/lib/payment-method";

export async function getRestaurantPaymentReport(restaurantId: string, period: ReportPeriod) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const { start, end } = getPeriodRange(period, timeZone);
  const previousRange = getPreviousPeriodRange(period, timeZone);

  const [payments, previousPayments] = await Promise.all([
    prisma.payment.findMany({
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
    }),
    prisma.payment.findMany({
      where: {
        restaurantId,
        status: "PAID",
        paidAt: { gte: previousRange.start, lt: previousRange.end }
      },
      include: {
        diningSession: {
          select: {
            tableId: true
          }
        }
      }
    })
  ]);

  const revenue = payments.reduce((sum, payment) => sum + (payment.grandTotal || payment.amount), 0);
  const tableKeys = new Set(payments.map((payment) => payment.tableIdSnapshot ?? payment.diningSession.tableId));
  const previousRevenue = previousPayments.reduce((sum, payment) => sum + (payment.grandTotal || payment.amount), 0);
  const previousTableKeys = new Set(previousPayments.map((payment) => payment.tableIdSnapshot ?? payment.diningSession.tableId));
  const bucketMap = new Map<string, number>();
  const paymentMethodMap = new Map<string, number>();

  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const key = getBucketKey(payment.paidAt, period, timeZone);
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + (payment.grandTotal || payment.amount));
    const methodLabel = paymentMethodLabels[payment.paymentMethod] ?? payment.paymentMethod;
    paymentMethodMap.set(methodLabel, (paymentMethodMap.get(methodLabel) ?? 0) + (payment.grandTotal || payment.amount));
  }

  const buckets = buildPeriodBuckets(period, start, end, timeZone, bucketMap);
  const paymentMethods = Array.from(paymentMethodMap.entries())
    .sort(([, left], [, right]) => right - left)
    .map(([label, amount]) => ({
      label,
      amount,
      percent: revenue > 0 ? Math.round(amount / revenue * 100) : 0
    }));

  return {
    timeZone,
    range: { start, end },
    previousRange,
    summary: {
      revenue,
      invoiceCount: payments.length,
      paidTableCount: tableKeys.size
    },
    previousSummary: {
      revenue: previousRevenue,
      invoiceCount: previousPayments.length,
      paidTableCount: previousTableKeys.size
    },
    comparisons: {
      revenue: buildMoneyComparison(revenue, previousRevenue),
      invoiceCount: buildCountComparison(payments.length, previousPayments.length, "bill"),
      paidTableCount: buildCountComparison(tableKeys.size, previousTableKeys.size, "bàn")
    },
    buckets,
    paymentMethods,
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

function buildPeriodBuckets(period: ReportPeriod, start: Date, end: Date, timeZone: string, amounts: Map<string, number>) {
  const buckets: Array<{ key: string; label: string; amount: number }> = [];
  const cursor = new Date(start);

  while (cursor < end) {
    const key = getBucketKey(cursor, period, timeZone);
    if (!buckets.some((bucket) => bucket.key === key)) {
      buckets.push({
        key,
        label: getBucketLabel(key, period),
        amount: amounts.get(key) ?? 0
      });
    }

    if (period === "today") {
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    } else if (period === "year") {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return buckets;
}

function buildMoneyComparison(current: number, previous: number) {
  if (previous > 0) {
    const percent = (current - previous) / previous * 100;
    return {
      direction: percent > 0 ? "up" as const : percent < 0 ? "down" as const : "flat" as const,
      percent: Math.abs(percent),
      label: percent === 0 ? "Không thay đổi" : `${percent > 0 ? "↑" : "↓"} ${formatPercent(Math.abs(percent))}`
    };
  }

  if (current > 0) {
    return {
      direction: "up" as const,
      percent: 100,
      label: "Mới phát sinh doanh thu"
    };
  }

  return {
    direction: "flat" as const,
    percent: 0,
    label: "Không thay đổi"
  };
}

function buildCountComparison(current: number, previous: number, unit: string) {
  const diff = current - previous;
  if (diff === 0) {
    return {
      direction: "flat" as const,
      value: 0,
      label: "Không thay đổi"
    };
  }

  return {
    direction: diff > 0 ? "up" as const : "down" as const,
    value: Math.abs(diff),
    label: `${diff > 0 ? "↑" : "↓"} ${Math.abs(diff)} ${unit}`
  };
}

function formatPercent(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}
