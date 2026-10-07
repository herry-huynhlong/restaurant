import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";
import { publishNotificationRefresh } from "@/server/services/notification-event-service";

export async function PATCH(_request: Request, { params }: { params: { rSlug: string; requestId: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER", "CASHIER"]);

  const result = await prisma.serviceRequest.updateMany({
    where: {
      id: params.requestId,
      restaurantId: access.restaurant.id,
      status: { in: ["NEW", "ACKNOWLEDGED"] },
      diningSession: activeDiningSessionWhere()
    },
    data: {
      status: "COMPLETED",
      resolvedAt: new Date()
    }
  });

  if (result.count === 0) {
    return NextResponse.json({ ok: false, error: "REQUEST_NOT_FOUND" }, { status: 404 });
  }

  publishNotificationRefresh(access.restaurant.id);
  return NextResponse.json({ ok: true });
}
