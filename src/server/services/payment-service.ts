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
  const session = await prisma.diningSession.findFirst({
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

  console.log("PAYMENT SESSION LOOKUP", {
    restaurantId,
    diningSessionId,
    activeWhere: activeDiningSessionWhere(),
    found: Boolean(session),
    tableId: session?.tableId ?? null,
    tableName: session?.table.name ?? null,
    tableIsActive: session?.table.isActive ?? null,
    tableStatus: session?.table.status ?? null,
    sessionStatus: session?.status ?? null,
    paymentStatus: session?.paymentStatus ?? null
  });

  if (!session) {
    const existingPaidPayment = await prisma.payment.findFirst({
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

    if (existingPaidPayment) {
      return {
        ok: true,
        paymentId: existingPaidPayment.id,
        invoiceNumber: existingPaidPayment.invoiceNumber,
        grandTotal: existingPaidPayment.grandTotal || existingPaidPayment.amount,
        tableName: existingPaidPayment.tableNameSnapshot ?? existingPaidPayment.diningSession.table.name
      };
    }

    return { ok: false, reason: "SESSION_NOT_ACTIVE" };
  }

  return prisma.$transaction(async (tx) => {
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

    if (closedSession.count === 0) return { ok: false, reason: "SESSION_NOT_ACTIVE" };

    const payment = await tx.payment.create({
      data: {
        restaurantId,
        diningSessionId: session.id,
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
        invoiceAddress: session.restaurant.settings?.address ?? null,
        invoicePhone: session.restaurant.settings?.phone ?? null,
        invoiceEmail: session.restaurant.settings?.invoiceEmail ?? null,
        invoiceDisplayName: session.restaurant.settings?.invoiceDisplayName ?? session.restaurant.settings?.restaurantName ?? session.restaurant.name,
        paymentMethod,
        status: "PAID",
        idempotencyKey: `paid-${session.id}-${paidAt.getTime()}`,
        paidAt,
        confirmedByUserId
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
