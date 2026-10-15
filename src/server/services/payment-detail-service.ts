import { prisma } from "@/lib/db/prisma";
import { formatInTimeZone } from "@/lib/period";
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
  }>();

  for (const order of payment.diningSession.orders) {
    for (const item of order.items) {
      const key = `${item.productNameViSnapshot}:${item.unitPriceSnapshot}`;
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
          subtotal: item.subtotal
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
        subtotal: item.subtotal
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
    invoiceNumber: payment.invoiceNumber,
    paidAtLabel: formatInTimeZone(payment.paidAt!, timeZone, { dateStyle: "short", timeStyle: "short" }),
    tableName: payment.tableNameSnapshot ?? payment.diningSession.table.name,
    amount: payment.grandTotal || payment.amount,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    confirmedByName: payment.confirmedBy?.name ?? null
  }));
}
