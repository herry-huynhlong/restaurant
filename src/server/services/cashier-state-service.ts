import { prisma } from "@/lib/db/prisma";
import { customerDisplayName, normalizeCustomerName } from "@/lib/customer-name";
import { formatInTimeZone, getPeriodRange } from "@/lib/period";
import { calculateBillSummary } from "@/server/services/billing-service";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

export type CashierSession = {
  id: string;
  tableName: string;
  areaName: string;
  status: string;
  paymentStatus: string;
  customerName: string | null;
  openedAtLabel: string;
  itemCount: number;
  orderCount: number;
  bill: {
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    grandTotal: number;
  };
  orders: Array<{
    id: string;
    orderNumber: number;
    customerName: string;
    statusLabel: string;
    createdAtLabel: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      note: string | null;
      statusLabel: string;
    }>;
  }>;
  paymentRequest: {
    id: string;
    status: string;
    customerName: string;
    createdAtLabel: string;
  } | null;
};

export type CashierSummary = {
  activeSessionCount: number;
  paymentRequestCount: number;
  paidBillCount: number;
  paidRevenue: number;
};

export async function getCashierState(restaurantId: string) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const todayRange = getPeriodRange("today", timeZone);
  const [sessions, paidToday] = await Promise.all([
    prisma.diningSession.findMany({
      where: { restaurantId, ...activeDiningSessionWhere() },
      include: {
        table: { include: { area: true } },
        orders: {
          orderBy: { createdAt: "asc" },
          include: { items: { orderBy: { createdAt: "asc" } } }
        },
        serviceRequests: {
          where: {
            requestType: "REQUEST_PAYMENT",
            status: { in: ["NEW", "ACKNOWLEDGED"] }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { openedAt: "asc" }
    }),
    prisma.payment.aggregate({
      where: {
        restaurantId,
        status: "PAID",
        paidAt: { gte: todayRange.start, lt: todayRange.end }
      },
      _count: { _all: true },
      _sum: { amount: true }
    })
  ]);

  const cashierSessions: CashierSession[] = sessions.map((session) => {
    const bill = calculateBillSummary(session.orders, settings);
    const latestOrder = session.orders[session.orders.length - 1];
    const paymentRequest = session.serviceRequests[0] ?? null;

    return {
      id: session.id,
      tableName: session.table.name,
      areaName: session.table.area.name,
      status: session.status,
      paymentStatus: session.paymentStatus,
      customerName: normalizeCustomerName(paymentRequest?.customerName ?? latestOrder?.customerName),
      openedAtLabel: formatInTimeZone(session.openedAt, timeZone, { dateStyle: "short", timeStyle: "short" }),
      itemCount: session.orders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.quantity, 0), 0),
      orderCount: session.orders.length,
      bill,
      orders: session.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: customerDisplayName(order.customerName),
        statusLabel: orderStatusLabel(order.status),
        createdAtLabel: formatInTimeZone(order.createdAt, timeZone, { timeStyle: "short" }),
        items: order.items.map((item) => ({
          id: item.id,
          name: item.productNameViSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPriceSnapshot,
          subtotal: item.subtotal,
          note: item.note,
          statusLabel: orderItemStatusLabel(item.status)
        }))
      })),
      paymentRequest: paymentRequest ? {
        id: paymentRequest.id,
        status: paymentRequest.status,
        customerName: customerDisplayName(paymentRequest.customerName),
        createdAtLabel: formatInTimeZone(paymentRequest.createdAt, timeZone, { timeStyle: "short" })
      } : null
    };
  }).sort((left, right) => Number(Boolean(right.paymentRequest)) - Number(Boolean(left.paymentRequest)));

  const summary: CashierSummary = {
    activeSessionCount: cashierSessions.length,
    paymentRequestCount: cashierSessions.filter((session) => session.paymentRequest).length,
    paidBillCount: paidToday._count._all,
    paidRevenue: paidToday._sum.amount ?? 0
  };

  return {
    settings,
    sessions: cashierSessions,
    summary,
    updatedAt: new Date().toISOString()
  };
}

function orderStatusLabel(status: string) {
  if (status === "NEW") return "Mới";
  if (status === "CONFIRMED") return "Đã nhận";
  if (status === "PREPARING") return "Đang làm";
  if (status === "READY") return "Sẵn sàng";
  if (status === "SERVED") return "Đã phục vụ";
  return "Đang cập nhật";
}

function orderItemStatusLabel(status: string) {
  if (status === "NEW") return "Chờ làm";
  if (status === "COOKING") return "Đang làm";
  if (status === "READY") return "Sẵn sàng";
  if (status === "SERVED") return "Đã phục vụ";
  return "Đang cập nhật";
}
