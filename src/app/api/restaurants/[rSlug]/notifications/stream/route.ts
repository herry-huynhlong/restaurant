import { NextRequest } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { notificationEmitter } from "@/server/services/notification-event-service";
import { isStaffDeviceRole } from "@/server/services/staff-device-session-service";

const streamRoles = ["OWNER", "MANAGER", "WAITER", "CASHIER", "KITCHEN"] as const;

export async function GET(_request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, [...streamRoles]);
  const deviceId = _request.nextUrl.searchParams.get("deviceId");
  if (isStaffDeviceRole(access.membership.role) && deviceId) {
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
      return new Response(JSON.stringify({ ok: false, code: "DEVICE_REVOKED" }), { status: 403 });
    }

    if (deviceSession?.onShift === false) {
      return new Response(null, { status: 204 });
    }
  }

  const encoder = new TextEncoder();
  const eventName = `restaurant:${access.restaurant.id}`;
  let keepAlive: ReturnType<typeof setInterval>;
  let send: ((event: unknown) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      send = (event: unknown) => {
        controller.enqueue(encoder.encode(`event: notification\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
      }, 25000);

      notificationEmitter.on(eventName, send);
      controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`));
    },
    cancel() {
      if (send) notificationEmitter.off(eventName, send);
      clearInterval(keepAlive);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
