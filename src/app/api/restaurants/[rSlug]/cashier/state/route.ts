import { NextRequest, NextResponse } from "next/server";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";
import { getCashierState } from "@/server/services/cashier-state-service";
import { getActiveStaffDeviceSession, isStaffDeviceRole } from "@/server/services/staff-device-session-service";

export async function GET(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  requireRestaurantFeature(access, "CASHIER_FLOW");

  if (isStaffDeviceRole(access.membership.role)) {
    const deviceId = request.nextUrl.searchParams.get("deviceId");
    const deviceSession = await getActiveStaffDeviceSession({
      restaurantId: access.restaurant.id,
      userId: access.user.id,
      deviceId
    });
    if (!deviceSession?.operatorName || !deviceSession.isActive || deviceSession.revokedAt) {
      return NextResponse.json({ ok: false, code: "DEVICE_REVOKED" }, { status: 403 });
    }
  }

  const state = await getCashierState(access.restaurant.id);
  return NextResponse.json({
    sessions: state.sessions,
    summary: state.summary,
    updatedAt: state.updatedAt
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
