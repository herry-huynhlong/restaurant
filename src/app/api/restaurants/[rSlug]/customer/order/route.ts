import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerContext } from "@/server/services/customer-context";
import { getPushTargetsForEvent, sendPushToRestaurantRoles } from "@/server/services/web-push-service";
import { createNotificationsForRestaurantRoles } from "@/server/services/notification-service";

const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  note: z.string().max(300).optional()
});

const orderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  idempotencyKey: z.string().min(8).max(120)
});

export async function POST(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const context = await getCustomerContext(request, params.rSlug);
  if (!context) {
    return NextResponse.json({ error: "Phiên gọi món không hợp lệ." }, { status: 401 });
  }

  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Giỏ hàng không hợp lệ." }, { status: 400 });
  }

  const productIds = parsed.data.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      restaurantId: context.restaurant.id,
      id: { in: productIds },
      isActive: true
    }
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  for (const item of parsed.data.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: "Có món không còn hoạt động. Vui lòng cập nhật giỏ hàng." }, { status: 409 });
    }
    if (product.isSoldOut) {
      return NextResponse.json({ error: `${product.nameVi} đã hết món. Vui lòng cập nhật giỏ hàng.` }, { status: 409 });
    }
  }

  const subtotal = parsed.data.items.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;
    return sum + product.price * item.quantity;
  }, 0);

  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: {
        restaurantId_idempotencyKey: {
          restaurantId: context.restaurant.id,
          idempotencyKey: parsed.data.idempotencyKey
        }
      },
      include: { items: true }
    });
    if (existing) return existing;

    const lastOrder = await tx.order.findFirst({
      where: {
        restaurantId: context.restaurant.id,
        diningSessionId: context.diningSession.id
      },
      orderBy: { orderNumber: "desc" }
    });

    const created = await tx.order.create({
      data: {
        restaurantId: context.restaurant.id,
        diningSessionId: context.diningSession.id,
        tableId: context.table.id,
        customerName: context.session.customerName,
        orderNumber: (lastOrder?.orderNumber ?? 0) + 1,
        status: "NEW",
        subtotal,
        idempotencyKey: parsed.data.idempotencyKey,
        items: {
          create: parsed.data.items.map((item) => {
            const product = productMap.get(item.productId)!;
            const isDrink = product.menuType === "DRINK";
            return {
              restaurantId: context.restaurant.id,
              productId: product.id,
              productNameViSnapshot: product.nameVi,
              productNameEnSnapshot: product.nameEn,
              unitPriceSnapshot: product.price,
              quantity: item.quantity,
              optionSnapshotJson: undefined,
              optionTotalSnapshot: 0,
              note: item.note || null,
              subtotal: product.price * item.quantity,
              status: isDrink ? "READY" : "NEW",
              readyAt: isDrink ? new Date() : undefined
            };
          })
        }
      },
      include: { items: true }
    });

    await tx.diningSession.update({
      where: { id: context.diningSession.id },
      data: { totalAmount: { increment: subtotal } }
    });

    await tx.restaurantTable.update({
      where: { id: context.table.id },
      data: { status: "WAITING_FOOD" }
    });

    return created;
  });

  const notificationTitle = `Đơn mới - Bàn ${context.table.name}`;
  const notificationMessage = `${context.session.customerName} vừa gọi ${order.items.length} món - ${subtotal.toLocaleString("vi-VN")}đ`;
  await createNotificationsForRestaurantRoles({
    restaurantId: context.restaurant.id,
    roles: getPushTargetsForEvent("ORDER_CREATED"),
    type: "ORDER_CREATED",
    title: notificationTitle,
    message: notificationMessage,
    tableId: context.table.id,
    orderId: order.id
  });

  await sendPushToRestaurantRoles({
    restaurantId: context.restaurant.id,
    roles: getPushTargetsForEvent("ORDER_CREATED"),
    payload: {
      title: notificationTitle,
      body: notificationMessage,
      url: `/${context.restaurant.slug}/staff`,
      tag: `order-${order.id}`,
      type: "ORDER_CREATED"
    }
  });

  return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber });
}
