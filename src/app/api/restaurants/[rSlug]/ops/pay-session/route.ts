import { NextResponse } from "next/server";
import { readPaymentMethod } from "@/server/services/billing-service";
import { confirmDiningSessionPaid } from "@/server/services/payment-service";
import { requireRestaurantAccess } from "@/lib/rbac/guards";

export async function POST(request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  const body = await request.json().catch(() => ({}));
  const diningSessionId = typeof body.diningSessionId === "string" ? body.diningSessionId : "";

  if (!diningSessionId) {
    return NextResponse.json({ ok: false, error: "missing_dining_session" }, { status: 400 });
  }

  const result = await confirmDiningSessionPaid({
    restaurantId: access.restaurant.id,
    diningSessionId,
    confirmedByUserId: access.user.id,
    paymentMethod: readPaymentMethod(body.paymentMethod ?? null)
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ ok: true, payment: result }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
