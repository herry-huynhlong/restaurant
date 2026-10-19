import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getSubscriptionCheckoutOrder } from "@/server/services/subscription-checkout-service";

export async function GET(
  _request: Request,
  { params }: { params: { rSlug: string; paymentOrderId: string } }
) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER"], { allowExpiredSubscription: true });
  const checkout = await getSubscriptionCheckoutOrder({
    restaurantId: access.restaurant.id,
    paymentOrderId: params.paymentOrderId
  });

  if (!checkout) {
    return NextResponse.json({ error: "Không tìm thấy lệnh thanh toán." }, { status: 404 });
  }

  return NextResponse.json(checkout, {
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
