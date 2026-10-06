import { prisma } from "@/lib/db/prisma";

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
