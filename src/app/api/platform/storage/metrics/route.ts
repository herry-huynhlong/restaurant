import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPlatformResourceMetrics } from "@/server/services/platform-resource-service";

export async function GET() {
  await requirePlatformAdmin();
  const metrics = await getPlatformResourceMetrics();
  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
