import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { readPaymentMethod } from "@/server/services/billing-service";
import { confirmDiningSessionPaid } from "@/server/services/payment-service";
import { requireRestaurantAccess } from "@/lib/rbac/guards";

export async function POST(request: Request, { params }: { params: { rSlug: string } }) {
  try {
    const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
    const body = await request.json().catch(() => ({}));
    const diningSessionId = typeof body.diningSessionId === "string" ? body.diningSessionId : "";

    console.log("CONFIRM PAYMENT REQUEST", {
      slug: params.rSlug,
      restaurantId: access.restaurant.id,
      userId: access.user.id,
      diningSessionId,
      paymentMethod: body.paymentMethod ?? "CASH"
    });

    if (!diningSessionId) {
      return NextResponse.json({ ok: false, error: "missing_dining_session", message: "Thiếu diningSessionId." }, { status: 400 });
    }

    const result = await confirmDiningSessionPaid({
      restaurantId: access.restaurant.id,
      diningSessionId,
      confirmedByUserId: access.user.id,
      paymentMethod: readPaymentMethod(body.paymentMethod ?? null)
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason, message: "Không tìm thấy phiên phục vụ đang mở để thanh toán." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, payment: result }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("CONFIRM PAYMENT ERROR", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("PRISMA CODE", error.code);
      console.error("PRISMA META", error.meta);
    }

    const isPrismaError = error instanceof Prisma.PrismaClientKnownRequestError;
    const message = error instanceof Error ? error.message : "Không xác nhận được thanh toán.";
    return NextResponse.json({
      ok: false,
      error: isPrismaError ? error.code : "CONFIRM_PAYMENT_FAILED",
      message,
      prismaMeta: isPrismaError ? error.meta : undefined
    }, { status: 500 });
  }
}
