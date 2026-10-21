import {
  completeTrialGoogle,
  trialQavioOrigin,
} from "@/server/services/trial-google-service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const u = new URL(request.url);
  try {
    const target = await completeTrialGoogle(
      u.searchParams.get("state") || "",
      u.searchParams.get("code") || "",
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: target,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    let origin: string;
    try {
      origin = trialQavioOrigin();
    } catch {
      return new Response("Đăng ký dùng thử chưa được cấu hình.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: origin + "/trial?auth=failed",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
}
