import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPendingSubscriptionRequestCount } from "@/server/services/platform-service";

export async function GET() {
  await requirePlatformAdmin();
  const count = await getPendingSubscriptionRequestCount();

  return NextResponse.json(
    { count, collectedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
