import { NextRequest, NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER", "CASHIER", "KITCHEN"]);
  const deviceId = request.nextUrl.searchParams.get("deviceId");
  if (deviceId) {
    const deviceSession = await prisma.staffDeviceSession.findUnique({
      where: {
        restaurantId_userId_deviceId: {
          restaurantId: access.restaurant.id,
          userId: access.user.id,
          deviceId
        }
      },
      select: { onShift: true, isActive: true, revokedAt: true, operatorName: true }
    });

    if (!deviceSession?.operatorName || !deviceSession.isActive || deviceSession.revokedAt) {
      return NextResponse.json({ ok: false, code: "DEVICE_REVOKED", error: "Thiết bị này đã bị quản lý khóa." }, { status: 403 });
    }

    if (deviceSession?.onShift === false) {
      return NextResponse.json({
        unreadCount: 0,
        latestNotificationId: null,
        latestCreatedAt: null,
        onShift: false
      });
    }
  }

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
