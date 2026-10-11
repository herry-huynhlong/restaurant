import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";
import { calculateBillSummary, generateInvoiceNumber } from "@/server/services/billing-service";

export type ConfirmPaymentResult =
  | { ok: true; paymentId: string; invoiceNumber: string | null; grandTotal: number; tableName: string }
  | { ok: false; reason: "SESSION_NOT_ACTIVE" };

export async function confirmDiningSessionPaid({
  restaurantId,
  diningSessionId,
  confirmedByUserId,
  paymentMethod
}: {
  restaurantId: string;
  diningSessionId: string;
  confirmedByUserId: string;
  paymentMethod: PaymentMethod;
}): Promise<ConfirmPaymentResult> {
  const paymentIdempotencyKey = `payment-request-${diningSessionId}`;

  return prisma.$transaction(async (tx) => {
    const lockedActiveSession = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "DiningSession"
      WHERE id = ${diningSessionId}
        AND "restaurantId" = ${restaurantId}
        AND status IN ('OPEN', 'AWAITING_PAYMENT')
      FOR UPDATE
    `;

    if (lockedActiveSession.length === 0) {
      const existingPaidPayment = await tx.payment.findFirst({
        where: {
          restaurantId,
          diningSessionId,
          status: "PAID"
        },
        include: {
          diningSession: {
            include: { table: true }
          }
        },
        orderBy: { paidAt: "desc" }
      });

      if (existingPaidPayment) return paidPaymentResult(existingPaidPayment);
      return { ok: false, reason: "SESSION_NOT_ACTIVE" };
    }

    const session = await tx.diningSession.findFirst({
      where: {
        id: diningSessionId,
        restaurantId,
        ...activeDiningSessionWhere()
      },
      include: {
        table: true,
        restaurant: { include: { settings: true } },
        orders: {
          include: { items: true }
        }
      }
    });

    if (!session) return { ok: false, reason: "SESSION_NOT_ACTIVE" };

    const paidAt = new Date();
    const bill = calculateBillSummary(session.orders, session.restaurant.settings);
    const invoiceNumber = generateInvoiceNumber(paidAt);

    console.log("CONFIRM PAYMENT BILL", {
      restaurantId,
      sessionId: session.id,
      tableId: session.tableId,
      tableName: session.table.name,
      tableIsActive: session.table.isActive,
      tableStatus: session.table.status,
      orderCount: session.orders.length,
      subtotal: bill.subtotal,
      taxRate: bill.taxRate,
      taxAmount: bill.taxAmount,
      totalAmount: bill.grandTotal,
      paymentMethod
    });

    const closedSession = await tx.diningSession.updateMany({
      where: {
        id: session.id,
        restaurantId,
        ...activeDiningSessionWhere()
      },
      data: {
        status: "CLOSED",
        paymentStatus: "PAID",
        closedAt: paidAt,
        totalAmount: bill.grandTotal
      }
    });

    if (closedSession.count === 0) {
      const existingPaidPayment = await tx.payment.findFirst({
        where: {
          restaurantId,
          diningSessionId: session.id,
          status: "PAID"
        },
        include: {
          diningSession: {
            include: { table: true }
          }
        },
        orderBy: { paidAt: "desc" }
      });

      if (existingPaidPayment) return paidPaymentResult(existingPaidPayment);
      return { ok: false, reason: "SESSION_NOT_ACTIVE" };
    }

    const paymentPayload = {
      amount: bill.grandTotal,
      invoiceNumber,
      subtotalAmount: bill.subtotal,
      taxRate: bill.taxRate,
      taxAmount: bill.taxAmount,
      grandTotal: bill.grandTotal,
      tableIdSnapshot: session.tableId,
      tableNameSnapshot: session.table.name,
      invoiceBusinessName: session.restaurant.settings?.invoiceBusinessName ?? session.restaurant.name,
      invoiceTaxCode: session.restaurant.settings?.invoiceTaxCode ?? null,
      invoiceAddress: session.restaurant.settings?.invoiceAddress ?? session.restaurant.settings?.address ?? null,
      invoicePhone: session.restaurant.settings?.invoicePhone ?? session.restaurant.settings?.phone ?? null,
      invoiceEmail: session.restaurant.settings?.invoiceEmail ?? null,
      invoiceDisplayName: session.restaurant.settings?.invoiceDisplayName ?? session.restaurant.settings?.restaurantName ?? session.restaurant.name,
      paymentMethod,
      status: "PAID" as const,
      paidAt,
      confirmedByUserId
    };

    const payment = await tx.payment.upsert({
      where: {
        restaurantId_idempotencyKey: {
          restaurantId,
          idempotencyKey: paymentIdempotencyKey
        }
      },
      update: paymentPayload,
      create: {
        restaurantId,
        diningSessionId: session.id,
        idempotencyKey: paymentIdempotencyKey,
        ...paymentPayload
      }
    });

    await tx.restaurantTable.update({
      where: { id: session.tableId },
      data: { status: "AVAILABLE" }
    });

    await tx.order.updateMany({
      where: {
        restaurantId,
        diningSessionId: session.id,
        status: { in: ["NEW", "CONFIRMED", "PREPARING", "READY"] }
      },
      data: { status: "SERVED" }
    });

    await tx.orderItem.updateMany({
      where: {
        restaurantId,
        order: {
          diningSessionId: session.id
        },
        status: { in: ["NEW", "COOKING", "READY"] }
      },
      data: {
        status: "SERVED",
        servedAt: paidAt
      }
    });

    await tx.serviceRequest.updateMany({
      where: {
        restaurantId,
        diningSessionId: session.id,
        status: { in: ["NEW", "ACKNOWLEDGED"] }
      },
      data: { status: "COMPLETED", resolvedAt: paidAt }
    });

    return {
      ok: true,
      paymentId: payment.id,
      invoiceNumber: payment.invoiceNumber,
      grandTotal: bill.grandTotal,
      tableName: session.table.name
    };
  });
}

function paidPaymentResult(payment: {
  id: string;
  invoiceNumber: string | null;
  grandTotal: number;
  amount: number;
  tableNameSnapshot: string | null;
  diningSession: { table: { name: string } };
}): ConfirmPaymentResult {
  return {
    ok: true,
    paymentId: payment.id,
    invoiceNumber: payment.invoiceNumber,
    grandTotal: payment.grandTotal || payment.amount,
    tableName: payment.tableNameSnapshot ?? payment.diningSession.table.name
  };
}
