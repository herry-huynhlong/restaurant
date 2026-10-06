"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus, ServiceRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { restaurantRoutes } from "@/lib/routes";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { createNotificationsForRestaurantRoles } from "@/server/services/notification-service";
import { getPushTargetsForEvent, sendPushToRestaurantRoles } from "@/server/services/web-push-service";

export async function updateOrderStatusAction(slug: string, orderId: string, status: OrderStatus) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "WAITER", "KITCHEN"]);
  const order = await prisma.order.update({
    where: { id: orderId, restaurantId: access.restaurant.id },
    data: { status },
    include: { table: true }
  });

  if (status === "READY") {
    const title = `Món xong - Bàn ${order.table.name}`;
    const message = `Order #${order.orderNumber} đã sẵn sàng phục vụ.`;
    await createNotificationsForRestaurantRoles({
      restaurantId: access.restaurant.id,
      roles: getPushTargetsForEvent("ORDER_READY"),
      type: "ORDER_READY",
      title,
      message,
      tableId: order.tableId,
      orderId: order.id
    });
    void sendPushToRestaurantRoles({
      restaurantId: access.restaurant.id,
      roles: getPushTargetsForEvent("ORDER_READY"),
      payload: {
        title,
        body: message,
        url: `/${access.restaurant.slug}/staff`,
        tag: `order-ready-${order.id}`
      }
    });
  }

  revalidatePath(restaurantRoutes.staff(slug));
  revalidatePath(restaurantRoutes.kitchen(slug));
  revalidatePath(restaurantRoutes.cashier(slug));
}

export async function updateServiceRequestStatusAction(slug: string, requestId: string, status: ServiceRequestStatus) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "WAITER", "CASHIER"]);
  await prisma.serviceRequest.update({
    where: { id: requestId, restaurantId: access.restaurant.id },
    data: {
      status,
      resolvedAt: status === "COMPLETED" ? new Date() : undefined
    }
  });

  revalidatePath(restaurantRoutes.staff(slug));
  revalidatePath(restaurantRoutes.cashier(slug));
}

export async function markDiningSessionPaidAction(slug: string, diningSessionId: string) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "CASHIER"]);
  const session = await prisma.diningSession.findFirst({
    where: {
      id: diningSessionId,
      restaurantId: access.restaurant.id,
      status: { in: ["OPEN", "AWAITING_PAYMENT"] }
    },
    include: { table: true }
  });

  if (!session) return;

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        restaurantId: access.restaurant.id,
        diningSessionId: session.id,
        amount: session.totalAmount,
        paymentMethod: "CASH",
        status: "PAID",
        idempotencyKey: `cash-${session.id}-${Date.now()}`,
        paidAt: new Date(),
        confirmedByUserId: access.user.id
      }
    }),
    prisma.diningSession.update({
      where: { id: session.id },
      data: { status: "PAID", paymentStatus: "PAID", closedAt: new Date() }
    }),
    prisma.restaurantTable.update({
      where: { id: session.tableId },
      data: { status: "AVAILABLE" }
    }),
    prisma.serviceRequest.updateMany({
      where: {
        restaurantId: access.restaurant.id,
        diningSessionId: session.id,
        requestType: "REQUEST_PAYMENT",
        status: { in: ["NEW", "ACKNOWLEDGED"] }
      },
      data: { status: "COMPLETED", resolvedAt: new Date() }
    })
  ]);

  revalidatePath(restaurantRoutes.cashier(slug));
  revalidatePath(restaurantRoutes.staff(slug));
}
