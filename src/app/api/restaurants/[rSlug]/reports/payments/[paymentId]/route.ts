import { NextResponse } from "next/server";
import { hasPlanFeature } from "@/lib/plan/features";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getPaymentBillDetail } from "@/server/services/payment-detail-service";

export async function GET(_request: Request, { params }: { params: { rSlug: string; paymentId: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  if (!hasPlanFeature(access.restaurant.plan, "BILL_PRINT", access.restaurant.businessType, access.restaurant.planEntitlement)) {
    return NextResponse.json({ error: "Gói hiện tại chưa hỗ trợ in hóa đơn." }, { status: 403 });
  }
  const detail = await getPaymentBillDetail({
    restaurantId: access.restaurant.id,
    paymentId: params.paymentId
  });

  if (!detail) {
    return NextResponse.json({ error: "Không tìm thấy hóa đơn." }, { status: 404 });
  }

  return NextResponse.json(detail, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
