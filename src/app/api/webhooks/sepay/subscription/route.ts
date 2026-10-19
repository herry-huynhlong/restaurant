import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  getSePaySubscriptionWebhookSecret,
  isAuthorizedSePayWebhook,
  parseSePayWebhookPayload,
  processSePaySubscriptionWebhook
} from "@/server/services/subscription-sepay-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumPayloadBytes = 32 * 1024;

export async function POST(request: Request) {
  const secret = getSePaySubscriptionWebhookSecret();
  if (!secret) {
    return NextResponse.json({ success: false, message: "Webhook chưa được cấu hình." }, { status: 503 });
  }
  if (!isAuthorizedSePayWebhook(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ success: false, message: "Không được phép." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumPayloadBytes) {
    return NextResponse.json({ success: false, message: "Payload quá lớn." }, { status: 413 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Payload JSON không hợp lệ." }, { status: 400 });
  }

  try {
    const payload = parseSePayWebhookPayload(rawPayload);
    const result = await processSePaySubscriptionWebhook({
      payload,
      rawPayload: payload as unknown as Prisma.InputJsonValue
    });
    return NextResponse.json({ success: true, duplicate: result.duplicate, status: result.status });
  } catch {
    // Do not disclose payment data or internal errors to a third-party caller.
    return NextResponse.json({ success: false, message: "Không thể xử lý giao dịch." }, { status: 500 });
  }
}
