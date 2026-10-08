import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { InvoicePrintButton } from "@/components/billing/invoice-print-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { prisma } from "@/lib/db/prisma";
import { formatVnd } from "@/lib/money";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { getRecentNotifications } from "@/server/services/notification-service";
import { markDiningSessionPaidAction, updateServiceRequestStatusAction } from "@/app/[rSlug]/ops/actions";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";
import { calculateBillSummary } from "@/server/services/billing-service";

function getSessionCustomerName(session: {
  serviceRequests: Array<{ customerName: string; createdAt: Date }>;
  orders: Array<{ customerName: string; createdAt: Date }>;
}) {
  const latestRequest = session.serviceRequests[0];
  const latestOrder = session.orders[0];
  return latestRequest?.customerName ?? latestOrder?.customerName ?? "Khách";
}

export default async function CashierPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  requireRestaurantFeature(access, "CASHIER_FLOW");
  const [sessions, paymentRequests, notifications, settings] = await Promise.all([
    prisma.diningSession.findMany({
      where: {
        restaurantId: access.restaurant.id,
        ...activeDiningSessionWhere()
      },
      include: {
        table: true,
        orders: {
          orderBy: { createdAt: "desc" },
          include: { items: true }
        },
        serviceRequests: {
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { openedAt: "desc" },
      take: 50
    }),
    prisma.serviceRequest.findMany({
      where: {
        restaurantId: access.restaurant.id,
        requestType: "REQUEST_PAYMENT",
        status: { in: ["NEW", "ACKNOWLEDGED"] },
        diningSession: activeDiningSessionWhere()
      },
      include: { table: true, diningSession: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    getRecentNotifications(access.restaurant.id, access.user.id),
    prisma.restaurantSetting.findUnique({ where: { restaurantId: access.restaurant.id } })
  ]);

  const latestBillSession = sessions[0];

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
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-3">
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Bàn đang có khách</h2>
          {sessions.length ? (
            sessions.map((session) => (
              <article key={session.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Bàn {session.table.name}</p>
                    <p className="text-sm text-slate-600">{getSessionCustomerName(session)}</p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium">{session.status}</span>
                </div>
                <BillSummaryBlock session={session} settings={settings} />
                <p className="mt-1 text-xs text-slate-500">Mở lúc {new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(session.openedAt)}</p>
                <PaymentActions slug={access.restaurant.slug} session={session} settings={settings} restaurantName={access.restaurant.name} cashierName={access.user.name} />
              </article>
            ))
          ) : (
            <EmptyState title="Bàn đang có khách" description="Chưa có dining session đang mở." />
          )}
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Bàn yêu cầu thanh toán</h2>
          {paymentRequests.length ? (
            paymentRequests.map((request) => (
              <article key={request.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <p className="font-semibold">Bàn {request.table.name}</p>
                <p className="text-sm text-slate-600">{request.customerName}</p>
                <p className="mt-3 text-lg font-bold text-teal-700">{formatVnd(calculateBillSummary([], settings).taxRate ? request.diningSession.totalAmount : request.diningSession.totalAmount)}</p>
                <p className="mt-1 text-xs text-slate-500">Phương thức: tiền mặt</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {request.status === "NEW" ? (
                    <form action={updateServiceRequestStatusAction.bind(null, access.restaurant.slug, request.id, "ACKNOWLEDGED")}>
                      <button className="rounded-md border px-3 py-2 text-sm font-semibold" type="submit">Đã nhận</button>
                    </form>
                  ) : null}
                  <form className="flex flex-wrap gap-2" action={markDiningSessionPaidAction.bind(null, access.restaurant.slug, request.diningSessionId)}>
                    <input name="paymentMethod" type="hidden" value="CASH" />
                    <ConfirmSubmitButton className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" message={`Xác nhận bàn ${request.table.name} đã thanh toán?`}>
                      Đã thanh toán
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="Bàn yêu cầu thanh toán" description="Chưa có yêu cầu thanh toán." />
          )}
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Bill hiện tại</h2>
          {latestBillSession ? (
            <article className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="font-semibold">Bàn {latestBillSession.table.name} · {getSessionCustomerName(latestBillSession)}</p>
              <div className="mt-3 space-y-3">
                {latestBillSession.orders.length ? latestBillSession.orders.map((order) => (
                  <div key={order.id} className="rounded-md bg-slate-50 p-3">
                    <p className="text-sm font-semibold">Order #{order.orderNumber} · {order.status}</p>
                    <ul className="mt-2 divide-y text-sm">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 py-1.5">
                          <span>{item.quantity} x {item.productNameViSnapshot}</span>
                          <span>{formatVnd(item.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )) : <p className="text-sm text-slate-500">Chưa có order.</p>}
              </div>
              <BillSummaryBlock session={latestBillSession} settings={settings} />
              <PaymentActions slug={access.restaurant.slug} session={latestBillSession} settings={settings} restaurantName={access.restaurant.name} cashierName={access.user.name} />
            </article>
          ) : (
            <EmptyState title="Bill hiện tại" description="Chọn bàn để xem bill khi có dữ liệu." />
          )}
        </section>
      </section>
    </main>
  );
}

function BillSummaryBlock({ session, settings }: { session: any; settings: any }) {
  const bill = calculateBillSummary(session.orders ?? [], settings);
  return (
    <div className="mt-3 space-y-1 rounded-md bg-slate-50 p-3 text-sm">
      <div className="flex justify-between gap-3"><span>Tạm tính</span><span className="font-semibold">{formatVnd(bill.subtotal)}</span></div>
      <div className="flex justify-between gap-3"><span>Thuế {bill.taxRate}%</span><span className="font-semibold">{formatVnd(bill.taxAmount)}</span></div>
      <div className="flex justify-between gap-3 border-t pt-2 text-base"><span className="font-semibold">Tổng</span><span className="font-bold text-teal-700">{formatVnd(bill.grandTotal)}</span></div>
    </div>
  );
}

function PaymentActions({ slug, session, settings, restaurantName, cashierName }: { slug: string; session: any; settings: any; restaurantName: string; cashierName?: string | null }) {
  const bill = calculateBillSummary(session.orders ?? [], settings);
  const invoice = {
    restaurantName,
    businessName: settings?.invoiceBusinessName ?? restaurantName,
    taxCode: settings?.invoiceTaxCode ?? null,
    address: settings?.address ?? null,
    phone: settings?.phone ?? null,
    email: settings?.invoiceEmail ?? null,
    invoiceNumber: null,
    tableName: session.table.name,
    cashierName,
    paidAt: null,
    status: session.paymentStatus === "PENDING" ? "PENDING" as const : "UNPAID" as const,
    paymentMethod: null,
    subtotal: bill.subtotal,
    taxRate: bill.taxRate,
    taxAmount: bill.taxAmount,
    grandTotal: bill.grandTotal,
    items: session.orders.flatMap((order: any) => order.items.map((item: any) => ({
      id: item.id,
      name: item.productNameViSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
      subtotal: item.subtotal
    })))
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <InvoicePrintButton label="In bill" invoice={invoice} />
      <form className="flex flex-wrap gap-2" action={markDiningSessionPaidAction.bind(null, slug, session.id)}>
        <input name="paymentMethod" type="hidden" value="CASH" />
        <ConfirmSubmitButton className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" message={`Xác nhận bàn ${session.table.name} đã thanh toán ${formatVnd(bill.grandTotal)}?`}>
          Xác nhận đã thanh toán
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
