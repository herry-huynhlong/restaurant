import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";
import { createNotificationsForRestaurantRoles } from "@/server/services/notification-service";
import { getPushTargetsForEvent, sendPushToRestaurantRoles } from "@/server/services/web-push-service";

const staffOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(300).optional()
});

const staffOrderSchema = z.object({
  idempotencyKey: z.string().min(8).max(120),
  items: z.array(staffOrderItemSchema).min(1)
});

export async function POST(request: NextRequest, { params }: { params: { rSlug: string; tableId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  const access = await prisma.restaurant.findUnique({
    where: { slug: params.rSlug },
    select: {
      id: true,
      slug: true,
      status: true,
      users: {
        where: { userId: session.user.id },
        select: { role: true, isActive: true },
        take: 1
      }
    }
  });

  if (!access) {
    return NextResponse.json({ error: "Không tìm thấy nhà hàng." }, { status: 404 });
  }
  if (access.status !== "ACTIVE") {
    return NextResponse.json({ error: "Nhà hàng hiện đang bị khóa." }, { status: 403 });
  }

  const membership = access.users[0];
  if (!membership?.isActive || !["OWNER", "MANAGER"].includes(membership.role)) {
    return NextResponse.json({ error: "Bạn không có quyền thêm món tại bàn." }, { status: 403 });
  }

  const parsed = staffOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Giỏ món không hợp lệ." }, { status: 400 });
  }

  const table = await prisma.restaurantTable.findFirst({
    where: {
      id: params.tableId,
      restaurantId: access.id
    },
    select: { id: true, name: true, isActive: true }
  });
  if (!table) {
    return NextResponse.json({ error: "Không tìm thấy bàn." }, { status: 404 });
  }
  if (!table.isActive) {
    return NextResponse.json({ error: "Bàn này đang ngừng sử dụng." }, { status: 409 });
  }

  const existingOrder = await findOrderByIdempotencyKey(access.id, parsed.data.idempotencyKey);
  if (existingOrder) {
    return NextResponse.json({ ok: true, duplicate: true, orderId: existingOrder.id, orderNumber: existingOrder.orderNumber });
  }

  const productIds = parsed.data.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      restaurantId: access.id,
      id: { in: productIds },
      isActive: true
    }
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  for (const item of parsed.data.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: "Có món không còn hoạt động. Vui lòng cập nhật giỏ món." }, { status: 409 });
    }
    if (product.isSoldOut) {
      return NextResponse.json({ error: `${product.nameVi} đã hết món. Vui lòng cập nhật giỏ món.` }, { status: 409 });
    }
  }

  const subtotal = parsed.data.items.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;
    return sum + product.price * item.quantity;
  }, 0);

  const staffName = session.user.name?.trim() || session.user.email || "Nhân viên";
  const result = await prisma.$transaction(async (tx) => {
    const lockedTable = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "RestaurantTable"
      WHERE id = ${table.id}
        AND "restaurantId" = ${access.id}
      FOR UPDATE
    `;

    if (lockedTable.length === 0) {
      return { order: null };
    }

    let activeSession = await tx.diningSession.findFirst({
      where: {
        restaurantId: access.id,
        tableId: table.id,
        ...activeDiningSessionWhere()
      },
      orderBy: { openedAt: "desc" }
    });

    if (!activeSession) {
      activeSession = await tx.diningSession.create({
        data: {
          restaurantId: access.id,
          tableId: table.id,
          status: "OPEN",
          paymentStatus: "UNPAID"
        }
      });
    }

    const lastOrder = await tx.order.findFirst({
      where: {
        restaurantId: access.id,
        diningSessionId: activeSession.id
      },
      orderBy: { orderNumber: "desc" }
    });

    const order = await tx.order.create({
      data: {
        restaurantId: access.id,
        diningSessionId: activeSession.id,
        tableId: table.id,
        customerName: `Nhân viên: ${staffName}`,
        orderNumber: (lastOrder?.orderNumber ?? 0) + 1,
        status: "NEW",
        subtotal,
        idempotencyKey: parsed.data.idempotencyKey,
        items: {
          create: parsed.data.items.map((item) => {
            const product = productMap.get(item.productId)!;
            const isDrink = product.menuType === "DRINK";
            return {
              restaurantId: access.id,
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
      where: { id: activeSession.id },
      data: { totalAmount: { increment: subtotal } }
    });

    await tx.restaurantTable.update({
      where: { id: table.id },
      data: { status: "WAITING_FOOD" }
    });

    return { order };
  }).catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await findOrderByIdempotencyKey(access.id, parsed.data.idempotencyKey);
      if (duplicate) return { order: duplicate, duplicate: true };
    }
    throw error;
  });

  if (!result.order) {
    return NextResponse.json({ error: "Không thể thêm món vào bàn này." }, { status: 409 });
  }

  if ("duplicate" in result && result.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true, orderId: result.order.id, orderNumber: result.order.orderNumber });
  }

  const notificationTitle = `Đơn mới - Bàn ${table.name}`;
  const notificationMessage = `Nhân viên vừa thêm ${result.order.items.length} món - ${subtotal.toLocaleString("vi-VN")}đ`;
  await createNotificationsForRestaurantRoles({
    restaurantId: access.id,
    roles: getPushTargetsForEvent("ORDER_CREATED"),
    type: "ORDER_CREATED",
    title: notificationTitle,
    message: notificationMessage,
    tableId: table.id,
    orderId: result.order.id
  });

  await sendPushToRestaurantRoles({
    restaurantId: access.id,
    roles: getPushTargetsForEvent("ORDER_CREATED"),
    payload: {
      title: notificationTitle,
      body: notificationMessage,
      url: `/${access.slug}/staff`,
      tag: `order-${result.order.id}`,
      type: "ORDER_CREATED"
    }
  });

  return NextResponse.json({ ok: true, orderId: result.order.id, orderNumber: result.order.orderNumber });
}

function findOrderByIdempotencyKey(restaurantId: string, idempotencyKey: string) {
  return prisma.order.findUnique({
    where: {
      restaurantId_idempotencyKey: {
        restaurantId,
        idempotencyKey
      }
    },
    include: { items: true }
  });
}
