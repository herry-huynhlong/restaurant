import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { PushNotificationButton } from "@/components/app-shell/push-notification-button";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db/prisma";
import { formatVnd } from "@/lib/money";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRecentNotifications } from "@/server/services/notification-service";
import { markDiningSessionPaidAction, updateServiceRequestStatusAction } from "@/app/[rSlug]/ops/actions";

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
  const [sessions, paymentRequests, notifications] = await Promise.all([
    prisma.diningSession.findMany({
      where: {
        restaurantId: access.restaurant.id,
        status: { in: ["OPEN", "AWAITING_PAYMENT"] }
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
        status: { in: ["NEW", "ACKNOWLEDGED"] }
      },
      include: { table: true, diningSession: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  const latestBillSession = sessions[0];

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title={`${access.restaurant.name} · Cashier`}
        subtitle={`Role ${access.membership.role}`}
        actions={
          <>
            <OpsLiveRefresher slug={access.restaurant.slug} />
            <PushNotificationButton slug={access.restaurant.slug} compact />
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
                <p className="mt-3 text-lg font-bold text-teal-700">{formatVnd(session.totalAmount)}</p>
                <p className="mt-1 text-xs text-slate-500">Mở lúc {new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(session.openedAt)}</p>
                {session.status === "AWAITING_PAYMENT" ? (
                  <form className="mt-3" action={markDiningSessionPaidAction.bind(null, access.restaurant.slug, session.id)}>
                    <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">Xác nhận đã thanh toán</button>
                  </form>
                ) : null}
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
                <p className="mt-3 text-lg font-bold text-teal-700">{formatVnd(request.diningSession.totalAmount)}</p>
                <p className="mt-1 text-xs text-slate-500">Phương thức: chờ xác nhận</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {request.status === "NEW" ? (
                    <form action={updateServiceRequestStatusAction.bind(null, access.restaurant.slug, request.id, "ACKNOWLEDGED")}>
                      <button className="rounded-md border px-3 py-2 text-sm font-semibold" type="submit">Đã nhận</button>
                    </form>
                  ) : null}
                  <form action={markDiningSessionPaidAction.bind(null, access.restaurant.slug, request.diningSessionId)}>
                    <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">Đã thanh toán</button>
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
              <p className="mt-4 border-t pt-3 text-xl font-bold text-teal-700">{formatVnd(latestBillSession.totalAmount)}</p>
            </article>
          ) : (
            <EmptyState title="Bill hiện tại" description="Chọn bàn để xem bill khi có dữ liệu." />
          )}
        </section>
      </section>
    </main>
  );
}
