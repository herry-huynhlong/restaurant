import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerContext } from "@/server/services/customer-context";
import { getPushTargetsForEvent, sendPushToRestaurantRoles } from "@/server/services/web-push-service";

const requestSchema = z.object({
  requestType: z.enum(["CALL_STAFF", "REQUEST_WATER", "REQUEST_UTENSILS", "REQUEST_PAYMENT", "OTHER"]),
  message: z.string().max(300).optional()
});

const requestLabels: Record<string, string> = {
  CALL_STAFF: "gọi nhân viên",
  REQUEST_WATER: "xin thêm nước",
  REQUEST_UTENSILS: "xin thêm dụng cụ",
  REQUEST_PAYMENT: "yêu cầu thanh toán",
  OTHER: "cần hỗ trợ"
};

export async function POST(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const context = await getCustomerContext(request, params.rSlug);
  if (!context) {
    return NextResponse.json({ error: "Phiên gọi món không hợp lệ." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const serviceRequest = await prisma.$transaction(async (tx) => {
    const created = await tx.serviceRequest.create({
      data: {
        restaurantId: context.restaurant.id,
        diningSessionId: context.diningSession.id,
        tableId: context.table.id,
        customerName: context.session.customerName,
        requestType: parsed.data.requestType,
        message: parsed.data.message || null,
        status: "NEW"
      }
    });

    if (parsed.data.requestType === "REQUEST_PAYMENT") {
      await tx.diningSession.update({
        where: { id: context.diningSession.id },
        data: { status: "AWAITING_PAYMENT", paymentStatus: "PENDING" }
      });
      await tx.restaurantTable.update({
        where: { id: context.table.id },
        data: { status: "PAYMENT_REQUESTED" }
      });
    }

    await tx.notification.create({
      data: {
        restaurantId: context.restaurant.id,
        type: parsed.data.requestType === "REQUEST_PAYMENT" ? "PAYMENT_REQUESTED" : "SERVICE_REQUEST_CREATED",
        title: `Bàn ${context.table.name} ${requestLabels[parsed.data.requestType]}`,
        message: parsed.data.message || `${context.session.customerName} ${requestLabels[parsed.data.requestType]}`,
        tableId: context.table.id,
        serviceRequestId: created.id
      }
    });

    return created;
  });

  const eventType = parsed.data.requestType === "REQUEST_PAYMENT" ? "PAYMENT_REQUESTED" : "SERVICE_REQUEST_CREATED";
  void sendPushToRestaurantRoles({
    restaurantId: context.restaurant.id,
    roles: getPushTargetsForEvent(eventType),
    payload: {
      title: `Bàn ${context.table.name} ${requestLabels[parsed.data.requestType]}`,
      body: parsed.data.message || `${context.session.customerName} ${requestLabels[parsed.data.requestType]}`,
      url: parsed.data.requestType === "REQUEST_PAYMENT" ? `/${context.restaurant.slug}/cashier` : `/${context.restaurant.slug}/staff`,
      tag: `service-${serviceRequest.id}`
    }
  });

  return NextResponse.json({ ok: true, serviceRequestId: serviceRequest.id });
}
