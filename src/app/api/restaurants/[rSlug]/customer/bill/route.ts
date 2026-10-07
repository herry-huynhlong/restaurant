import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCustomerContext } from "@/server/services/customer-context";
import { calculateBillSummary } from "@/server/services/billing-service";

function buildBill(orders: Array<{
  id: string;
  orderNumber: number;
  customerName: string;
  status: string;
  subtotal: number;
  createdAt: Date;
  items: Array<{
    id: string;
    productNameViSnapshot: string;
    unitPriceSnapshot: number;
    quantity: number;
    subtotal: number;
  }>;
}>, bill: { subtotal: number; taxRate: number; taxAmount: number; grandTotal: number }) {
  const itemMap = new Map<string, {
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>();

  for (const order of orders) {
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
          subtotal: item.subtotal
        });
      }
    }
  }

  return {
    totalAmount: bill.grandTotal,
    subtotal: bill.subtotal,
    taxRate: bill.taxRate,
    taxAmount: bill.taxAmount,
    grandTotal: bill.grandTotal,
    items: Array.from(itemMap.values()),
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      subtotal: order.subtotal,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productNameViSnapshot,
        unitPrice: item.unitPriceSnapshot,
        quantity: item.quantity,
        subtotal: item.subtotal
      }))
    }))
  };
}

export async function GET(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const context = await getCustomerContext(request, params.rSlug);
  if (!context) {
    return NextResponse.json({ error: "Phiên gọi món không hợp lệ." }, { status: 401 });
  }

  const refreshedSession = await prisma.diningSession.findFirst({
    where: {
      id: context.diningSession.id,
      restaurantId: context.restaurant.id,
      tableId: context.table.id
    },
    include: {
      restaurant: { include: { settings: true } },
      orders: {
        orderBy: { createdAt: "asc" },
        include: { items: { orderBy: { createdAt: "asc" } } }
      }
    }
  });

  if (!refreshedSession) {
    return NextResponse.json({ error: "Không tìm thấy phiên gọi món." }, { status: 404 });
  }

  const bill = calculateBillSummary(refreshedSession.orders, refreshedSession.restaurant.settings);
  return NextResponse.json(buildBill(refreshedSession.orders, bill));
}
