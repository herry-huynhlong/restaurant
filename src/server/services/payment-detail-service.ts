import { prisma } from "@/lib/db/prisma";
import { formatInTimeZone } from "@/lib/period";

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
      restaurantId
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
    customerName: firstOrder?.customerName ?? null,
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
      customerName: order.customerName,
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
