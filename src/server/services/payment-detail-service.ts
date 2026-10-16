import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatInTimeZone, getBucketKey, getPeriodRange, localDateBoundaryToUtc } from "@/lib/period";
import { customerDisplayName, normalizeCustomerName } from "@/lib/customer-name";

export async function getPaymentBillDetail({
  restaurantId,
  paymentId
}: {
  restaurantId: string;
  paymentId: string;
}) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      restaurantId,
      status: "PAID",
      paidAt: { not: null }
    },
    include: {
      restaurant: true,
      confirmedBy: true,
      diningSession: {
        include: {
          table: true,
          orders: {
            orderBy: { createdAt: "asc" },
            include: {
              items: { orderBy: { createdAt: "asc" } }
            }
          }
        }
      }
    }
  });

  if (!payment) return null;

  const itemMap = new Map<string, {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    note: string | null;
  }>();

  for (const order of payment.diningSession.orders) {
    for (const item of order.items) {
      const key = `${item.productNameViSnapshot}:${item.unitPriceSnapshot}:${item.note ?? ""}`;
      const existing = itemMap.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.subtotal += item.subtotal;
      } else {
        itemMap.set(key, {
          id: item.id,
          name: item.productNameViSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPriceSnapshot,
          subtotal: item.subtotal,
          note: item.note
        });
      }
    }
  }

  const firstOrder = payment.diningSession.orders[0];
  const subtotal = payment.subtotalAmount || payment.amount;
  const taxRate = Number(payment.taxRate);
  const grandTotal = payment.grandTotal || payment.amount;

  return {
    id: payment.id,
    restaurantName: payment.restaurant.name,
    businessName: payment.invoiceBusinessName ?? payment.invoiceDisplayName ?? payment.restaurant.name,
    taxCode: payment.invoiceTaxCode,
    address: payment.invoiceAddress,
    phone: payment.invoicePhone,
    email: payment.invoiceEmail,
    invoiceNumber: payment.invoiceNumber,
    tableName: payment.tableNameSnapshot ?? payment.diningSession.table.name,
    customerName: normalizeCustomerName(firstOrder?.customerName),
    cashierName: payment.confirmedBy?.name ?? null,
    paidAt: payment.paidAt ? formatInTimeZone(payment.paidAt, timeZone, { dateStyle: "short", timeStyle: "short" }) : null,
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    subtotal,
    taxRate,
    taxAmount: payment.taxAmount,
    grandTotal,
    orders: payment.diningSession.orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: customerDisplayName(order.customerName),
      subtotal: order.subtotal,
      createdAt: formatInTimeZone(order.createdAt, timeZone, { dateStyle: "short", timeStyle: "short" }),
      items: order.items.map((item) => ({
        id: item.id,
        name: item.productNameViSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPriceSnapshot,
        subtotal: item.subtotal,
        note: item.note
      }))
    })),
    items: Array.from(itemMap.values())
  };
}

export async function getRecentPaidPaymentSummaries(restaurantId: string, take = 8) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const payments = await prisma.payment.findMany({
    where: {
      restaurantId,
      status: "PAID",
      paidAt: { not: null }
    },
    include: {
      confirmedBy: { select: { name: true } },
      diningSession: { include: { table: { select: { name: true } } } }
    },
    orderBy: { paidAt: "desc" },
    take
  });

  return payments.map((payment) => ({
    id: payment.id,
    tableId: payment.tableIdSnapshot ?? payment.diningSession.tableId,
    invoiceNumber: payment.invoiceNumber,
    paidAtLabel: formatInTimeZone(payment.paidAt!, timeZone, { dateStyle: "short", timeStyle: "short" }),
    tableName: payment.tableNameSnapshot ?? payment.diningSession.table.name,
    amount: payment.grandTotal || payment.amount,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    confirmedByName: payment.confirmedBy?.name ?? null
  }));
}

export async function getLatestPaidPaymentSummariesByTable(restaurantId: string) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    invoiceNumber: string | null;
    paidAt: Date;
    tableId: string;
    tableName: string;
    amount: number;
    grandTotal: number;
    paymentMethod: PaymentMethod;
    confirmedByName: string | null;
  }>>(Prisma.sql`
    SELECT DISTINCT ON (COALESCE(p."tableIdSnapshot", ds."tableId"))
      p.id,
      p."invoiceNumber",
      p."paidAt",
      COALESCE(p."tableIdSnapshot", ds."tableId") AS "tableId",
      COALESCE(p."tableNameSnapshot", t.name) AS "tableName",
      p.amount,
      p."grandTotal",
      p."paymentMethod",
      u.name AS "confirmedByName"
    FROM "Payment" p
    JOIN "DiningSession" ds ON ds.id = p."diningSessionId"
    JOIN "RestaurantTable" t ON t.id = ds."tableId"
    LEFT JOIN "User" u ON u.id = p."confirmedByUserId"
    WHERE p."restaurantId" = ${restaurantId}
      AND p.status = 'PAID'
      AND p."paidAt" IS NOT NULL
    ORDER BY COALESCE(p."tableIdSnapshot", ds."tableId"), p."paidAt" DESC, p.id DESC
  `);

  return rows
    .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime() || right.id.localeCompare(left.id))
    .map((payment) => ({
      id: payment.id,
      tableId: payment.tableId,
      invoiceNumber: payment.invoiceNumber,
      paidAtLabel: formatInTimeZone(payment.paidAt, timeZone, { dateStyle: "short", timeStyle: "short" }),
      tableName: payment.tableName,
      amount: payment.grandTotal || payment.amount,
      status: "PAID" as const,
      paymentMethod: payment.paymentMethod,
      confirmedByName: payment.confirmedByName
    }));
}

export async function getPaidPaymentHistoryPage({
  restaurantId,
  page = 1,
  pageSize = 20,
  query = "",
  tableId,
  from,
  to
}: {
  restaurantId: string;
  page?: number;
  pageSize?: number;
  query?: string;
  tableId?: string;
  from?: string;
  to?: string;
}) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedPageSize = Math.min(50, Math.max(10, Math.floor(pageSize)));
  const keyword = query.trim().slice(0, 80);
  const start = from ? localDateBoundaryToUtc(from, timeZone) : null;
  const end = to ? localDateBoundaryToUtc(to, timeZone, 1) : null;
  const where: Prisma.PaymentWhereInput = {
    restaurantId,
    status: "PAID",
    paidAt: {
      not: null,
      ...(start ? { gte: start } : {}),
      ...(end ? { lt: end } : {})
    },
    ...(tableId ? {
      OR: [
        { tableIdSnapshot: tableId },
        { diningSession: { tableId } }
      ]
    } : {}),
    ...(keyword ? {
      AND: [{
        OR: [
          { invoiceNumber: { contains: keyword, mode: "insensitive" } },
          { id: { contains: keyword, mode: "insensitive" } }
        ]
      }]
    } : {})
  };

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: {
        confirmedBy: { select: { name: true } },
        diningSession: { include: { table: { select: { id: true, name: true } } } }
      },
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      skip: (normalizedPage - 1) * normalizedPageSize,
      take: normalizedPageSize
    })
  ]);
  const todayRange = getPeriodRange("today", timeZone);
  const todayKey = getBucketKey(new Date(), "today", timeZone);
  const yesterdayKey = getBucketKey(new Date(todayRange.start.getTime() - 1), "today", timeZone);

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
    timeZone,
    items: payments.map((payment) => {
      const paidAt = payment.paidAt!;
      const dateKey = getBucketKey(paidAt, "today", timeZone);
      const dateLabel = formatInTimeZone(paidAt, timeZone, { day: "2-digit", month: "2-digit", year: "numeric" });
      return {
        id: payment.id,
        tableId: payment.tableIdSnapshot ?? payment.diningSession.table.id,
        invoiceNumber: payment.invoiceNumber,
        tableName: payment.tableNameSnapshot ?? payment.diningSession.table.name,
        amount: payment.grandTotal || payment.amount,
        paymentMethod: payment.paymentMethod,
        paidAt: paidAt.toISOString(),
        timeLabel: formatInTimeZone(paidAt, timeZone, { timeStyle: "short" }),
        dateKey,
        dateLabel,
        dayHeading: dateKey === todayKey ? `Hôm nay — ${dateLabel}` : dateKey === yesterdayKey ? `Hôm qua — ${dateLabel}` : dateLabel,
        confirmedByName: payment.confirmedBy?.name ?? null
      };
    })
  };
}
