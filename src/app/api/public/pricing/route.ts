import { NextResponse } from "next/server";
import { getPublishedPlanPricing } from "@/server/services/plan-pricing-service";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getPublishedPlanPricing(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Pricing temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
