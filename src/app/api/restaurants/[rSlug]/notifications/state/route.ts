import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER", "CASHIER", "KITCHEN"]);
  const where = {
    restaurantId: access.restaurant.id,
    OR: [{ recipientUserId: null }, { recipientUserId: access.user.id }]
  };

  const [unreadCount, latest] = await Promise.all([
    prisma.notification.count({ where: { ...where, isRead: false } }),
    prisma.notification.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true }
    })
  ]);

  return NextResponse.json({
    unreadCount,
    latestNotificationId: latest?.id ?? null,
    latestCreatedAt: latest?.createdAt.toISOString() ?? null
  });
}
