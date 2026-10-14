import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { readPaymentMethod } from "@/server/services/billing-service";
import { confirmDiningSessionPaid } from "@/server/services/payment-service";
import { debugLog } from "@/lib/debug-log";
import { hasPlanFeature } from "@/lib/plan/features";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { rethrowNextNavigation } from "@/lib/safe-user-message";
import { assertActiveStaffDeviceForAction } from "@/server/services/staff-device-session-service";
import { publishNotificationRefresh } from "@/server/services/notification-event-service";

export async function POST(request: Request, { params }: { params: { rSlug: string } }) {
  try {
    const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
    if (!hasPlanFeature(access.restaurant.plan, "PAYMENT_CONFIRM", access.restaurant.businessType, access.restaurant.planEntitlement)) {
      return NextResponse.json({ ok: false, error: "plan_locked", message: "Gói hiện tại chưa hỗ trợ xác nhận thanh toán." }, { status: 403 });
    }
    await assertActiveStaffDeviceForAction({
      restaurantId: access.restaurant.id,
      userId: access.user.id,
      role: access.membership.role
    });
    const body = await request.json().catch(() => ({}));
    const diningSessionId = typeof body.diningSessionId === "string" ? body.diningSessionId : "";

    debugLog("CONFIRM PAYMENT REQUEST", {
      slug: params.rSlug,
      restaurantId: access.restaurant.id,
      userId: access.user.id,
      diningSessionId,
      paymentMethod: body.paymentMethod ?? "CASH"
    });

    if (!diningSessionId) {
      return NextResponse.json({ ok: false, error: "missing_dining_session", message: "Thiếu diningSessionId." }, { status: 400 });
    }

    const result = await confirmDiningSessionPaid({
      restaurantId: access.restaurant.id,
      diningSessionId,
      confirmedByUserId: access.user.id,
      paymentMethod: readPaymentMethod(body.paymentMethod ?? null)
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason, message: "Không tìm thấy phiên phục vụ đang mở để thanh toán." }, { status: 409 });
    }

    publishNotificationRefresh(access.restaurant.id);

    return NextResponse.json({ ok: true, payment: result }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    rethrowNextNavigation(error);
    console.error("CONFIRM PAYMENT ERROR", error);
    if (error instanceof Error && error.message === "DEVICE_REVOKED") {
      return NextResponse.json({ ok: false, code: "DEVICE_REVOKED", message: "Thiết bị này đã bị quản lý khóa." }, { status: 403 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      debugLog("CONFIRM PAYMENT PRISMA ERROR", { code: error.code, meta: error.meta });
    }

    return NextResponse.json({
      ok: false,
      error: "CONFIRM_PAYMENT_FAILED",
      message: "Không xác nhận được thanh toán. Vui lòng thử lại."
    }, { status: 500 });
  }
}
