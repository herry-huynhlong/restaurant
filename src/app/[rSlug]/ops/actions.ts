"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus, ServiceRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { restaurantRoutes } from "@/lib/routes";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";
import { createNotificationsForRestaurantRoles } from "@/server/services/notification-service";
import { publishNotificationRefresh } from "@/server/services/notification-event-service";
import { getPushTargetsForEvent, sendPushToRestaurantRoles } from "@/server/services/web-push-service";
import { readPaymentMethod } from "@/server/services/billing-service";
import { confirmDiningSessionPaid } from "@/server/services/payment-service";

export async function updateOrderStatusAction(slug: string, orderId: string, status: OrderStatus) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "WAITER", "KITCHEN"]);
  if (status === "PREPARING" || status === "READY") {
    requireRestaurantFeature(access, "KITCHEN_FLOW");
  }
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
    await sendPushToRestaurantRoles({
      restaurantId: access.restaurant.id,
      roles: getPushTargetsForEvent("ORDER_READY"),
      payload: {
        title,
        body: message,
        url: `/${access.restaurant.slug}/staff`,
        tag: `order-ready-${order.id}`,
        type: "ORDER_READY"
      }
    });
  }

  publishNotificationRefresh(access.restaurant.id);
  revalidatePath(restaurantRoutes.staff(slug));
  revalidatePath(restaurantRoutes.kitchen(slug));
  revalidatePath(restaurantRoutes.cashier(slug));
}

export async function claimKitchenItemAction(slug: string, orderItemId: string) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "KITCHEN"]);
  requireRestaurantFeature(access, "KITCHEN_FLOW");
  const now = new Date();
  const result = await prisma.orderItem.updateMany({
    where: {
      id: orderItemId,
      restaurantId: access.restaurant.id,
      status: "NEW",
      kitchenAssignedToUserId: null,
      product: { menuType: { in: ["MAIN", "EXTRA"] } }
    },
    data: {
      status: "COOKING",
      kitchenAssignedToUserId: access.user.id,
      kitchenClaimedAt: now
    }
  });

  if (result.count === 0) {
    revalidatePath(restaurantRoutes.kitchen(slug));
    return;
  }

  publishNotificationRefresh(access.restaurant.id);
  revalidatePath(restaurantRoutes.kitchen(slug));
}

export async function markKitchenItemReadyAction(slug: string, orderItemId: string) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "KITCHEN"]);
  requireRestaurantFeature(access, "KITCHEN_FLOW");
  const now = new Date();
  const item = await prisma.orderItem.findFirst({
    where: {
      id: orderItemId,
      restaurantId: access.restaurant.id,
      status: "COOKING",
      product: { menuType: { in: ["MAIN", "EXTRA"] } },
      OR: [
        { kitchenAssignedToUserId: access.user.id },
        { kitchenAssignedToUserId: null }
      ]
    },
    include: {
      order: { include: { table: true } }
    }
  });

  if (!item) {
    revalidatePath(restaurantRoutes.kitchen(slug));
    return;
  }

  await prisma.orderItem.update({
    where: { id: item.id },
    data: {
      status: "READY",
      readyAt: now
    }
  });

  const title = `Món đã xong - Bàn ${item.order.table.name}`;
  const message = `${item.productNameViSnapshot} x${item.quantity} đã xong. Vui lòng nhận món.`;
  await createNotificationsForRestaurantRoles({
    restaurantId: access.restaurant.id,
    roles: getPushTargetsForEvent("ORDER_READY"),
    type: "ORDER_READY",
    title,
    message,
    tableId: item.order.tableId,
    orderId: item.orderId
  });
  await sendPushToRestaurantRoles({
    restaurantId: access.restaurant.id,
    roles: getPushTargetsForEvent("ORDER_READY"),
    payload: {
      title,
      body: message,
      url: `/${access.restaurant.slug}/staff`,
      tag: `order-item-ready-${item.id}`,
      type: "ORDER_READY"
    }
  });

  publishNotificationRefresh(access.restaurant.id);
  revalidatePath(restaurantRoutes.kitchen(slug));
  revalidatePath(restaurantRoutes.staff(slug));
}

export async function claimWaiterItemAction(slug: string, orderItemId: string) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "WAITER"]);
  const now = new Date();
  const result = await prisma.orderItem.updateMany({
    where: {
      id: orderItemId,
      restaurantId: access.restaurant.id,
      status: "READY",
      waiterAssignedToUserId: null
    },
    data: {
      waiterAssignedToUserId: access.user.id,
      waiterClaimedAt: now
    }
  });

  if (result.count === 0) {
    revalidatePath(restaurantRoutes.staff(slug));
    return;
  }

  publishNotificationRefresh(access.restaurant.id);
  revalidatePath(restaurantRoutes.staff(slug));
}

export async function markWaiterItemServedAction(slug: string, orderItemId: string) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "WAITER"]);
  const now = new Date();
  const result = await prisma.orderItem.updateMany({
    where: {
      id: orderItemId,
      restaurantId: access.restaurant.id,
      status: "READY",
      waiterAssignedToUserId: access.user.id
    },
    data: {
      status: "SERVED",
      servedAt: now
    }
  });

  if (result.count === 0) {
    revalidatePath(restaurantRoutes.staff(slug));
    return;
  }

  publishNotificationRefresh(access.restaurant.id);
  revalidatePath(restaurantRoutes.staff(slug));
  revalidatePath(restaurantRoutes.adminOrders(slug));
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
  publishNotificationRefresh(access.restaurant.id);

  revalidatePath(restaurantRoutes.staff(slug));
  revalidatePath(restaurantRoutes.cashier(slug));
}

export async function markDiningSessionPaidAction(slug: string, diningSessionId: string, formData?: FormData) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "CASHIER"]);
  requireRestaurantFeature(access, "PAYMENT_CONFIRM");
  const paymentMethod = readPaymentMethod(formData?.get("paymentMethod") ?? null);
  await confirmDiningSessionPaid({
    restaurantId: access.restaurant.id,
    diningSessionId,
    confirmedByUserId: access.user.id,
    paymentMethod
  });

  revalidatePath(restaurantRoutes.cashier(slug));
  revalidatePath(restaurantRoutes.staff(slug));
  revalidatePath(restaurantRoutes.adminTables(slug));
  revalidatePath(restaurantRoutes.admin(slug));
  revalidatePath(restaurantRoutes.adminReports(slug));
}
