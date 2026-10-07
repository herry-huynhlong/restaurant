import { NextRequest, NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";

const notificationAccessRoles = ["OWNER", "MANAGER", "WAITER", "CASHIER", "KITCHEN"] as const;

function notificationWhere(restaurantId: string, userId: string) {
  return {
    restaurantId,
    OR: [{ recipientUserId: null }, { recipientUserId: userId }]
  };
}

function notificationPayload(notification: {
  id: string;
  type: string;
  title: string;
  message: string;
  tableId: string;
  orderId: string | null;
  serviceRequestId: string | null;
  isRead: boolean;
  createdAt: Date;
}) {
  return {
    ...notification,
    createdAt: notification.createdAt.toISOString()
  };
}

export async function GET(_request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, [...notificationAccessRoles]);
  const where = notificationWhere(access.restaurant.id, access.user.id);

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        tableId: true,
        orderId: true,
        serviceRequestId: true,
        isRead: true,
        createdAt: true
      }
    }),
    prisma.notification.count({ where: { ...where, isRead: false } })
  ]);

  return NextResponse.json({
    notifications: notifications.map(notificationPayload),
    unreadCount
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, [...notificationAccessRoles]);
  const body = await request.json().catch(() => ({})) as { notificationId?: string; markAll?: boolean };
  const where = notificationWhere(access.restaurant.id, access.user.id);

  if (body.markAll) {
    await prisma.notification.updateMany({
      where: { ...where, isRead: false },
      data: { isRead: true }
    });
    return NextResponse.json({ ok: true });
  }

  if (!body.notificationId) {
    return NextResponse.json({ ok: false, error: "Thiếu notificationId." }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: { ...where, id: body.notificationId },
    data: { isRead: true }
  });

  return NextResponse.json({ ok: true });
}
