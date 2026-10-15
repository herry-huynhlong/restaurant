import { prisma } from "@/lib/db/prisma";
import { customerDisplayName } from "@/lib/customer-name";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

export type ActiveTableOrder = {
  diningSessionId: string;
  tableId: string;
  tableName: string;
  areaName: string;
  status: string;
  paymentStatus: string;
  openedAt: string;
  totalAmount: number;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    imageUrl: string | null;
  }>;
  orders: Array<{
    id: string;
    orderNumber: number;
    customerName: string;
    status: string;
    subtotal: number;
    createdAt: string;
    items: Array<{
      id: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      note: string | null;
      status: string;
      imageUrl: string | null;
    }>;
  }>;
  requests: Array<{
    id: string;
    requestType: string;
    customerName: string;
    message: string | null;
    status: string;
    createdAt: string;
  }>;
};

export async function getActiveTableOrders(restaurantId: string): Promise<ActiveTableOrder[]> {
  const sessions = await prisma.diningSession.findMany({
    where: {
      restaurantId,
      ...activeDiningSessionWhere(),
      OR: [
        { orders: { some: {} } },
        { serviceRequests: { some: { status: { in: ["NEW", "ACKNOWLEDGED"] } } } }
      ]
    },
    include: {
      table: { include: { area: true } },
      orders: {
        orderBy: { createdAt: "asc" },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: { product: { select: { imageUrl: true } } }
          }
        }
      },
      serviceRequests: {
        where: { status: { in: ["NEW", "ACKNOWLEDGED"] } },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { openedAt: "asc" }
  });

  return sessions.map((session) => {
    const itemMap = new Map<string, {
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      imageUrl: string | null;
    }>();

    for (const order of session.orders) {
      for (const item of order.items) {
        const key = `${item.productNameViSnapshot}:${item.unitPriceSnapshot}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.subtotal += item.subtotal;
        } else {
          itemMap.set(key, {
            productName: item.productNameViSnapshot,
            quantity: item.quantity,
            unitPrice: item.unitPriceSnapshot,
            subtotal: item.subtotal,
            imageUrl: item.product.imageUrl
          });
        }
      }
    }

    return {
      diningSessionId: session.id,
      tableId: session.tableId,
      tableName: session.table.name,
      areaName: session.table.area.name,
      status: session.status,
      paymentStatus: session.paymentStatus,
      openedAt: session.openedAt.toISOString(),
      totalAmount: session.totalAmount || session.orders.reduce((sum, order) => sum + order.subtotal, 0),
      items: Array.from(itemMap.values()),
      orders: session.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: customerDisplayName(order.customerName),
        status: order.status,
        subtotal: order.subtotal,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productNameViSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPriceSnapshot,
          subtotal: item.subtotal,
          note: item.note,
          status: item.status,
          imageUrl: item.product.imageUrl
        }))
      })),
      requests: session.serviceRequests.map((request) => ({
        id: request.id,
        requestType: request.requestType,
        customerName: customerDisplayName(request.customerName),
        message: request.message,
        status: request.status,
        createdAt: request.createdAt.toISOString()
      }))
    };
  }).sort((a, b) => {
    const priority = (table: ActiveTableOrder) => {
      if (table.requests.length > 0) return 0;
      if (table.status === "AWAITING_PAYMENT" || table.paymentStatus === "PENDING") return 1;
      return 2;
    };

    return priority(a) - priority(b) || new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
  });
}
