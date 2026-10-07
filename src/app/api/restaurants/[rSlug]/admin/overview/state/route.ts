import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRestaurantAdminOverview } from "@/server/services/restaurant-service";

export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const overview = await getRestaurantAdminOverview(access.restaurant.id);
  return NextResponse.json(overview, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

