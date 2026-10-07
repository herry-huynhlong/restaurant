import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getActiveTableOrders } from "@/server/services/order-board-service";

export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const tables = await getActiveTableOrders(access.restaurant.id);

  return NextResponse.json({ tables }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
