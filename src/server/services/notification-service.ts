import { prisma } from "@/lib/db/prisma";
import type { NotificationType, RestaurantRole } from "@prisma/client";
import { publishNotificationRefresh } from "@/server/services/notification-event-service";

export async function getRecentNotifications(restaurantId: string, userId?: string) {
  return prisma.notification.findMany({
    where: {
      restaurantId,
      OR: userId ? [{ recipientUserId: null }, { recipientUserId: userId }] : [{ recipientUserId: null }]
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });
}

export async function createNotificationsForRestaurantRoles({
  restaurantId,
  roles,
  type,
  title,
  message,
  tableId,
  orderId,
  serviceRequestId
}: {
  restaurantId: string;
  roles: RestaurantRole[];
  type: NotificationType;
  title: string;
  message: string;
  tableId: string;
  orderId?: string;
  serviceRequestId?: string;
}) {
  const memberships = await prisma.restaurantUser.findMany({
    where: {
      restaurantId,
      isActive: true,
      role: { in: roles },
      user: { isActive: true }
    },
    select: { userId: true }
  });

  const uniqueUserIds = Array.from(new Set(memberships.map((membership) => membership.userId)));
  if (!uniqueUserIds.length) {
    return [];
  }

  const result = await prisma.notification.createMany({
    data: uniqueUserIds.map((recipientUserId) => ({
      restaurantId,
      recipientUserId,
      type,
      title,
      message,
      tableId,
      orderId: orderId ?? null,
      serviceRequestId: serviceRequestId ?? null
    }))
  });

  publishNotificationRefresh(restaurantId);
  return result;
}
