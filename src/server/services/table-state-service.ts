import QRCode from "qrcode";
import { prisma } from "@/lib/db/prisma";
import { getTableQrUrl } from "@/lib/qr";
import { servedUploadUrl } from "@/lib/upload-url";
import { calculateBillSummary } from "@/server/services/billing-service";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

export async function getAdminTablesState(restaurantId: string, slug: string, baseUrl: string) {
  const [areas, settings] = await Promise.all([
    prisma.area.findMany({
      where: { restaurantId },
      include: {
        tables: {
          orderBy: { name: "asc" },
          include: {
            sessions: {
              where: activeDiningSessionWhere(),
              orderBy: { openedAt: "desc" },
              take: 1,
              include: {
                orders: {
                  orderBy: { createdAt: "asc" },
                  include: { items: { orderBy: { createdAt: "asc" } } }
                },
                serviceRequests: {
                  where: { status: { in: ["NEW", "ACKNOWLEDGED"] } },
                  orderBy: { createdAt: "desc" }
                }
              }
            }
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.restaurantSetting.findUnique({ where: { restaurantId } })
  ]);

  return {
    settings: {
      taxEnabled: settings?.taxEnabled ?? false,
      taxRate: Number(settings?.taxRate ?? 0),
      invoiceBusinessName: settings?.invoiceBusinessName ?? null,
      invoiceTaxCode: settings?.invoiceTaxCode ?? null,
      invoiceEmail: settings?.invoiceEmail ?? null,
      invoiceDisplayName: settings?.invoiceDisplayName ?? null,
      address: settings?.invoiceAddress ?? settings?.address ?? null,
      phone: settings?.invoicePhone ?? settings?.phone ?? null,
      qrPaymentEnabled: settings?.qrPaymentEnabled ?? false,
      paymentQrImage: servedUploadUrl(settings?.paymentQrImage),
      bankName: settings?.bankName ?? null,
      accountNumber: settings?.accountNumber ?? null,
      accountHolder: settings?.accountHolder ?? null,
      paymentTransferContent: settings?.paymentTransferContent ?? null
    },
    areas: await Promise.all(areas.map(async (area) => ({
      id: area.id,
      name: area.name,
      sortOrder: area.sortOrder,
      tables: await Promise.all(area.tables.map(async (table) => {
        const activeSession = table.sessions[0] ?? null;
        const bill = activeSession ? calculateBillSummary(activeSession.orders, settings) : null;
        const qrUrl = getTableQrUrl(baseUrl, slug, table.qrToken);
        return {
          id: table.id,
          areaId: table.areaId,
          areaName: area.name,
          name: table.name,
          status: table.status,
          isActive: table.isActive,
          qrUrl,
          qrDataUrl: await QRCode.toDataURL(qrUrl, { margin: 1, width: 220 }),
          activeSession: activeSession ? {
            id: activeSession.id,
            status: activeSession.status,
            paymentStatus: activeSession.paymentStatus,
            openedAt: activeSession.openedAt.toISOString(),
            subtotal: bill?.subtotal ?? 0,
            taxRate: bill?.taxRate ?? 0,
            taxAmount: bill?.taxAmount ?? 0,
            grandTotal: bill?.grandTotal ?? 0,
            orders: activeSession.orders.map((order) => ({
              id: order.id,
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              status: order.status,
              subtotal: order.subtotal,
              createdAt: order.createdAt.toISOString(),
              items: order.items.map((item) => ({
                id: item.id,
                name: item.productNameViSnapshot,
                quantity: item.quantity,
                unitPrice: item.unitPriceSnapshot,
                subtotal: item.subtotal
              }))
            })),
            serviceRequests: activeSession.serviceRequests.map((request) => ({
              id: request.id,
              type: request.requestType,
              customerName: request.customerName,
              status: request.status,
              createdAt: request.createdAt.toISOString()
            }))
          } : null
        };
      }))
    })))
  };
}
