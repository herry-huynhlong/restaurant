import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { getStaffDeviceIdCookie } from "@/server/services/staff-device-session-service";
import { resolveStaffPwaStartup } from "@/server/services/staff-pwa-startup-service";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    const session = await getServerSession(authOptions);
    const result = await resolveStaffPwaStartup(params.rSlug, session?.user?.id, getStaffDeviceIdCookie());
    const status = result.state === "NO_SESSION" ? 401 : result.state === "FORBIDDEN" || result.state === "DEVICE_REVOKED" ? 403 : result.state === "TENANT_UNAVAILABLE" ? 423 : 200;
    return NextResponse.json(result, { status, headers });
  } catch {
    return NextResponse.json({ state: "NETWORK_ERROR" }, { status: 503, headers });
  }
}
