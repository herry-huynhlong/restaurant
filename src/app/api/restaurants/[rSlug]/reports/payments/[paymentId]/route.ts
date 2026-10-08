import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getPaymentBillDetail } from "@/server/services/payment-detail-service";

export async function GET(_request: Request, { params }: { params: { rSlug: string; paymentId: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const detail = await getPaymentBillDetail({
    restaurantId: access.restaurant.id,
    paymentId: params.paymentId
  });

  if (!detail) {
    return NextResponse.json({ error: "Không tìm thấy hóa đơn." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
