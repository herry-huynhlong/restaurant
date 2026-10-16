import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { BillHistoryButton } from "@/components/admin/payment-report-table";
import { CashierWorkspace, type CashierSession } from "@/components/cashier/cashier-workspace";
import { prisma } from "@/lib/db/prisma";
import { customerDisplayName, normalizeCustomerName } from "@/lib/customer-name";
import { formatVnd } from "@/lib/money";
import { formatInTimeZone, getPeriodRange } from "@/lib/period";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { servedUploadUrl } from "@/lib/upload-url";
import { calculateBillSummary } from "@/server/services/billing-service";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";
import { getRecentNotifications } from "@/server/services/notification-service";
import { requireActiveStaffDeviceSession } from "@/server/services/staff-device-session-service";

export default async function CashierPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  requireRestaurantFeature(access, "CASHIER_FLOW");
  await requireActiveStaffDeviceSession({
    restaurantId: access.restaurant.id,
    restaurantSlug: access.restaurant.slug,
    userId: access.user.id,
    role: access.membership.role,
    nextPath: `/${access.restaurant.slug}/cashier`
  });

  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId: access.restaurant.id } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const todayRange = getPeriodRange("today", timeZone);

  const [sessions, notifications, tables, paidToday] = await Promise.all([
    prisma.diningSession.findMany({
      where: {
        restaurantId: access.restaurant.id,
        ...activeDiningSessionWhere()
      },
      include: {
        table: { include: { area: true } },
        orders: {
          orderBy: { createdAt: "asc" },
          include: { items: { orderBy: { createdAt: "asc" } } }
        },
        serviceRequests: {
          where: {
            requestType: "REQUEST_PAYMENT",
            status: { in: ["NEW", "ACKNOWLEDGED"] }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { openedAt: "asc" }
    }),
    getRecentNotifications(access.restaurant.id, access.user.id),
    prisma.restaurantTable.findMany({
      where: { restaurantId: access.restaurant.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    }),
    prisma.payment.aggregate({
      where: {
        restaurantId: access.restaurant.id,
        status: "PAID",
        paidAt: { gte: todayRange.start, lt: todayRange.end }
      },
      _count: { _all: true },
      _sum: { amount: true }
    })
  ]);

  const cashierSessions: CashierSession[] = sessions.map((session) => {
    const bill = calculateBillSummary(session.orders, settings);
    const latestOrder = session.orders[session.orders.length - 1];
    const paymentRequest = session.serviceRequests[0] ?? null;
    const customerName = normalizeCustomerName(paymentRequest?.customerName ?? latestOrder?.customerName);

    return {
      id: session.id,
      tableName: session.table.name,
      areaName: session.table.area.name,
      status: session.status,
      paymentStatus: session.paymentStatus,
      customerName,
      openedAtLabel: formatInTimeZone(session.openedAt, timeZone, { dateStyle: "short", timeStyle: "short" }),
      itemCount: session.orders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.quantity, 0), 0),
      orderCount: session.orders.length,
      bill,
      orders: session.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: customerDisplayName(order.customerName),
        statusLabel: orderStatusLabel(order.status),
        createdAtLabel: formatInTimeZone(order.createdAt, timeZone, { timeStyle: "short" }),
        items: order.items.map((item) => ({
          id: item.id,
          name: item.productNameViSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPriceSnapshot,
          subtotal: item.subtotal,
          note: item.note,
          statusLabel: orderItemStatusLabel(item.status)
        }))
      })),
      paymentRequest: paymentRequest ? {
        id: paymentRequest.id,
        status: paymentRequest.status,
        customerName: customerDisplayName(paymentRequest.customerName),
        createdAtLabel: formatInTimeZone(paymentRequest.createdAt, timeZone, { timeStyle: "short" })
      } : null
    };
  }).sort((left, right) => Number(Boolean(right.paymentRequest)) - Number(Boolean(left.paymentRequest)));

  const paymentRequestCount = cashierSessions.filter((session) => session.paymentRequest).length;

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title="Thu ngân"
        subtitle={`${access.restaurant.name} · ${getRoleLabel(access.membership.role)}`}
        notificationSlug={access.restaurant.slug}
        enableShiftControls={access.membership.role === "CASHIER"}
        actions={
          <>
            <OpsLiveRefresher slug={access.restaurant.slug} />
            <NotificationBell slug={access.restaurant.slug} notifications={notifications} />
          </>
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <QuickStat label="Bàn đang phục vụ" value={String(cashierSessions.length)} tone="teal" />
          <QuickStat label="Yêu cầu thanh toán" value={String(paymentRequestCount)} tone={paymentRequestCount ? "amber" : "slate"} />
          <QuickStat label="Bill đã thanh toán hôm nay" value={`${paidToday._count._all} · ${formatVnd(paidToday._sum.amount ?? 0)}`} tone="slate" />
        </section>

        <CashierWorkspace
          slug={access.restaurant.slug}
          cashierName={access.user.name ?? null}
          sessions={cashierSessions}
          settings={{
            restaurantName: access.restaurant.name,
            invoiceBusinessName: settings?.invoiceBusinessName ?? null,
            invoiceTaxCode: settings?.invoiceTaxCode ?? null,
            invoiceAddress: settings?.invoiceAddress ?? settings?.address ?? null,
            invoicePhone: settings?.invoicePhone ?? settings?.phone ?? null,
            invoiceEmail: settings?.invoiceEmail ?? null,
            cashEnabled: settings?.cashEnabled ?? true,
            qrPaymentEnabled: settings?.qrPaymentEnabled ?? false,
            paymentQrImage: servedUploadUrl(settings?.paymentQrImage) ?? null,
            bankName: settings?.bankName ?? null,
            accountNumber: settings?.accountNumber ?? null,
            accountHolder: settings?.accountHolder ?? null,
            paymentTransferContent: settings?.paymentTransferContent ?? null
          }}
        />

        <section className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Tra cứu</p>
            <h2 className="mt-1 text-lg font-semibold">Bill thanh toán gần đây</h2>
            <p className="mt-1 text-sm text-slate-500">Lịch sử mặc định được thu gọn; mở khi cần xem chi tiết hoặc in lại.</p>
          </div>
          <BillHistoryButton slug={access.restaurant.slug} tables={tables} />
        </section>
      </div>
    </main>
  );
}

function QuickStat({ label, value, tone }: { label: string; value: string; tone: "teal" | "amber" | "slate" }) {
  const toneClass = tone === "teal"
    ? "border-teal-100 bg-teal-50 text-teal-800"
    : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-white text-slate-800";
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function orderStatusLabel(status: string) {
  if (status === "NEW") return "Mới";
  if (status === "CONFIRMED") return "Đã nhận";
  if (status === "PREPARING") return "Đang làm";
  if (status === "READY") return "Sẵn sàng";
  if (status === "SERVED") return "Đã phục vụ";
  return "Đang cập nhật";
}

function orderItemStatusLabel(status: string) {
  if (status === "NEW") return "Chờ làm";
  if (status === "COOKING") return "Đang làm";
  if (status === "READY") return "Sẵn sàng";
  if (status === "SERVED") return "Đã phục vụ";
  return "Đang cập nhật";
}
