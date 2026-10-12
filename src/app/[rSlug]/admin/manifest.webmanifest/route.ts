import { NextResponse } from "next/server";
import { buildTenantPwaManifest, getTenantPwaBranding } from "@/server/services/tenant-pwa-service";

export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const branding = await getTenantPwaBranding(params.rSlug);

  if (!branding) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return NextResponse.json(buildTenantPwaManifest(branding, "admin"), {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/manifest+json; charset=utf-8"
    }
  });
}
