import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerContext } from "@/server/services/customer-context";
import { getPushTargetsForEvent, sendPushToRestaurantRoles } from "@/server/services/web-push-service";
import { createNotificationsForRestaurantRoles } from "@/server/services/notification-service";
import { calculateBillSummary } from "@/server/services/billing-service";

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

  const eventType = parsed.data.requestType === "REQUEST_PAYMENT" ? "PAYMENT_REQUESTED" : "SERVICE_REQUEST_CREATED";
  const { serviceRequest, isDuplicate, totalAmount } = await prisma.$transaction(async (tx) => {
    const existingOpenRequest = await tx.serviceRequest.findFirst({
      where: {
        restaurantId: context.restaurant.id,
        diningSessionId: context.diningSession.id,
        tableId: context.table.id,
        requestType: parsed.data.requestType,
        status: { in: ["NEW", "ACKNOWLEDGED"] }
      },
      orderBy: { createdAt: "desc" }
    });

    const orders = parsed.data.requestType === "REQUEST_PAYMENT"
      ? await tx.order.findMany({
          where: {
            restaurantId: context.restaurant.id,
            diningSessionId: context.diningSession.id
          },
          include: { items: true }
        })
      : [];
    const settings = parsed.data.requestType === "REQUEST_PAYMENT"
      ? await tx.restaurantSetting.findUnique({ where: { restaurantId: context.restaurant.id } })
      : null;
    const bill = parsed.data.requestType === "REQUEST_PAYMENT" ? calculateBillSummary(orders, settings) : null;

    if (existingOpenRequest) {
      if (parsed.data.requestType === "REQUEST_PAYMENT") {
        await tx.payment.upsert({
          where: {
            restaurantId_idempotencyKey: {
              restaurantId: context.restaurant.id,
              idempotencyKey: `payment-request-${context.diningSession.id}`
            }
          },
          update: {
            amount: bill?.grandTotal ?? 0,
            subtotalAmount: bill?.subtotal ?? 0,
            taxRate: bill?.taxRate ?? 0,
            taxAmount: bill?.taxAmount ?? 0,
            grandTotal: bill?.grandTotal ?? 0,
            paymentMethod: "CASH",
            status: "PENDING"
          },
          create: {
            restaurantId: context.restaurant.id,
            diningSessionId: context.diningSession.id,
            amount: bill?.grandTotal ?? 0,
            subtotalAmount: bill?.subtotal ?? 0,
            taxRate: bill?.taxRate ?? 0,
            taxAmount: bill?.taxAmount ?? 0,
            grandTotal: bill?.grandTotal ?? 0,
            tableIdSnapshot: context.table.id,
            tableNameSnapshot: context.table.name,
            paymentMethod: "CASH",
            status: "PENDING",
            idempotencyKey: `payment-request-${context.diningSession.id}`
          }
        });
      }
      return { serviceRequest: existingOpenRequest, isDuplicate: true, totalAmount: bill?.grandTotal ?? 0 };
    }

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
      await tx.payment.upsert({
        where: {
          restaurantId_idempotencyKey: {
            restaurantId: context.restaurant.id,
            idempotencyKey: `payment-request-${context.diningSession.id}`
          }
        },
        update: {
          amount: bill?.grandTotal ?? 0,
          subtotalAmount: bill?.subtotal ?? 0,
          taxRate: bill?.taxRate ?? 0,
          taxAmount: bill?.taxAmount ?? 0,
          grandTotal: bill?.grandTotal ?? 0,
          paymentMethod: "CASH",
          status: "PENDING"
        },
        create: {
          restaurantId: context.restaurant.id,
          diningSessionId: context.diningSession.id,
          amount: bill?.grandTotal ?? 0,
          subtotalAmount: bill?.subtotal ?? 0,
          taxRate: bill?.taxRate ?? 0,
          taxAmount: bill?.taxAmount ?? 0,
          grandTotal: bill?.grandTotal ?? 0,
          tableIdSnapshot: context.table.id,
          tableNameSnapshot: context.table.name,
          paymentMethod: "CASH",
          status: "PENDING",
          idempotencyKey: `payment-request-${context.diningSession.id}`
        }
      });
      await tx.diningSession.update({
        where: { id: context.diningSession.id },
        data: { status: "AWAITING_PAYMENT", paymentStatus: "PENDING" }
      });
      await tx.restaurantTable.update({
        where: { id: context.table.id },
        data: { status: "PAYMENT_REQUESTED" }
      });
    }

    return { serviceRequest: created, isDuplicate: false, totalAmount: bill?.grandTotal ?? 0 };
  });

  if (isDuplicate) {
    return NextResponse.json({
      ok: true,
      serviceRequestId: serviceRequest.id,
      duplicate: true,
      totalAmount,
      message: parsed.data.requestType === "REQUEST_PAYMENT" ? "Yêu cầu thanh toán đã được gửi. Vui lòng ra quầy để hoàn tất thanh toán." : "Nhân viên đang được gọi."
    });
  }

  const notificationTitle = parsed.data.requestType === "REQUEST_PAYMENT"
    ? `Bàn ${context.table.name} yêu cầu thanh toán tiền mặt`
    : `Bàn ${context.table.name} ${requestLabels[parsed.data.requestType]}`;
  const notificationMessage = parsed.data.requestType === "REQUEST_PAYMENT"
    ? `Tổng hiện tại ${totalAmount.toLocaleString("vi-VN")}đ. Khách ra quầy thanh toán tiền mặt.`
    : parsed.data.message || `${context.session.customerName} ${requestLabels[parsed.data.requestType]}`;
  await createNotificationsForRestaurantRoles({
    restaurantId: context.restaurant.id,
    roles: getPushTargetsForEvent(eventType),
    type: eventType,
    title: notificationTitle,
    message: notificationMessage,
    tableId: context.table.id,
    serviceRequestId: serviceRequest.id
  });

  void sendPushToRestaurantRoles({
    restaurantId: context.restaurant.id,
    roles: getPushTargetsForEvent(eventType),
    payload: {
      title: notificationTitle,
      body: notificationMessage,
      url: parsed.data.requestType === "REQUEST_PAYMENT" ? `/${context.restaurant.slug}/cashier` : `/${context.restaurant.slug}/staff`,
      tag: `service-${serviceRequest.id}`
    }
  });

  return NextResponse.json({
    ok: true,
    serviceRequestId: serviceRequest.id,
    totalAmount,
    message: parsed.data.requestType === "REQUEST_PAYMENT"
      ? "Đã gửi yêu cầu thanh toán. Vui lòng ra quầy để hoàn tất thanh toán."
      : undefined
  });
}
