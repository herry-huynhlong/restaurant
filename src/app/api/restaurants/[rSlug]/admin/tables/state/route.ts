import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getAdminTablesState } from "@/server/services/table-state-service";

export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const state = await getAdminTablesState(access.restaurant.id, access.restaurant.slug, baseUrl);
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
