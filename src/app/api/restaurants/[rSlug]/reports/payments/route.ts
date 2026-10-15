import { NextRequest, NextResponse } from "next/server";
import { hasPlanFeature } from "@/lib/plan/features";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getPaidPaymentHistoryPage } from "@/server/services/payment-detail-service";

export async function GET(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  if (!hasPlanFeature(access.restaurant.plan, "BILL_PRINT", access.restaurant.businessType, access.restaurant.planEntitlement)) {
    return NextResponse.json({ error: "Gói hiện tại chưa hỗ trợ in hóa đơn." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const result = await getPaidPaymentHistoryPage({
    restaurantId: access.restaurant.id,
    page: Number(searchParams.get("page") ?? 1),
    pageSize: 20,
    query: searchParams.get("q") ?? "",
    tableId: searchParams.get("tableId") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
