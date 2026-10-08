import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db/prisma";
import { formatVnd } from "@/lib/money";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { servedUploadUrl } from "@/lib/upload-url";
import { getRecentNotifications } from "@/server/services/notification-service";
import { updateOrderStatusAction, updateServiceRequestStatusAction } from "@/app/[rSlug]/ops/actions";

const orderLabels: Record<string, string> = {
  NEW: "Đơn mới",
  CONFIRMED: "Đã nhận",
  PREPARING: "Đang chuẩn bị",
  READY: "Chờ phục vụ"
};

const serviceLabels: Record<string, string> = {
  CALL_STAFF: "Gọi nhân viên",
  REQUEST_WATER: "Thêm nước",
  REQUEST_UTENSILS: "Thêm dụng cụ",
  REQUEST_PAYMENT: "Thanh toán",
  OTHER: "Hỗ trợ"
};

export default async function StaffPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER"]);
  const [orders, serviceRequests, notifications] = await Promise.all([
    prisma.order.findMany({
      where: {
        restaurantId: access.restaurant.id,
        status: { in: ["NEW", "CONFIRMED", "PREPARING", "READY"] }
      },
      include: {
        table: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: { product: true }
        }
      },
      orderBy: [{ tableId: "asc" }, { createdAt: "asc" }],
      take: 50
    }),
    prisma.serviceRequest.findMany({
      where: {
        restaurantId: access.restaurant.id,
        status: { in: ["NEW", "ACKNOWLEDGED"] },
        requestType: { not: "REQUEST_PAYMENT" }
      },
      include: { table: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);
  const ordersByTable = new Map<string, {
    tableName: string;
    orders: typeof orders;
  }>();
  for (const order of orders) {
    const existing = ordersByTable.get(order.tableId);
    if (existing) {
      existing.orders.push(order);
    } else {
      ordersByTable.set(order.tableId, { tableName: order.table.name, orders: [order] });
    }
  }
  const tableGroups = Array.from(ordersByTable.values()).sort((a, b) => a.tableName.localeCompare(b.tableName, "vi"));

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title="Phục vụ"
        subtitle={`${access.restaurant.name} · ${getRoleLabel(access.membership.role)}`}
        notificationSlug={access.restaurant.slug}
        actions={
          <>
            <OpsLiveRefresher slug={access.restaurant.slug} />
            <NotificationBell slug={access.restaurant.slug} notifications={notifications} />
          </>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {tableGroups.length ? (
            tableGroups.map((group) => (
              <section key={group.tableName} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <h2 className="text-lg font-semibold">Bàn {group.tableName}</h2>
                  <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{group.orders.length} order active</span>
                </div>
                <div className="mt-3 space-y-3">
                  {group.orders.map((order) => (
                    <article key={order.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-teal-700">{orderLabels[order.status] ?? order.status}</p>
                          <h3 className="mt-1 font-semibold">Order #{order.orderNumber} · {order.customerName}</h3>
                          <p className="text-xs text-slate-500">{new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(order.createdAt)}</p>
                        </div>
                        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-teal-800">{formatVnd(order.subtotal)}</p>
                      </div>
                      <ul className="mt-3 divide-y text-sm">
                        {order.items.map((item) => {
                          const imageUrl = servedUploadUrl(item.product.imageUrl);
                          return (
                            <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="h-10 w-10 shrink-0 rounded-md bg-slate-100">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  {imageUrl ? <img alt={item.productNameViSnapshot} className="h-full w-full rounded-md object-cover" src={imageUrl} /> : null}
                                </div>
                                <span className="min-w-0">{item.quantity} x {item.productNameViSnapshot}</span>
                              </div>
                              <span className="shrink-0 font-medium">{formatVnd(item.subtotal)}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {order.status === "NEW" ? (
                          <form action={updateOrderStatusAction.bind(null, access.restaurant.slug, order.id, "CONFIRMED")}>
                            <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">Nhận đơn</button>
                          </form>
                        ) : (
                          <form action={updateOrderStatusAction.bind(null, access.restaurant.slug, order.id, "SERVED")}>
                            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" type="submit">Hoàn tất</button>
                          </form>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <EmptyState title="Đơn mới" description="Chưa có đơn đang xử lý." />
          )}
        </div>
        <aside className="space-y-3">
          <h2 className="text-base font-semibold">Yêu cầu khách</h2>
          {serviceRequests.length ? (
            serviceRequests.map((request) => (
              <article key={request.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold">Bàn {request.table.name} · {serviceLabels[request.requestType]}</p>
                <p className="mt-1 text-sm text-slate-600">{request.customerName}</p>
                {request.message ? <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm">{request.message}</p> : null}
                <p className="mt-2 text-xs text-slate-500">{new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(request.createdAt)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {request.status === "NEW" ? (
                    <form action={updateServiceRequestStatusAction.bind(null, access.restaurant.slug, request.id, "ACKNOWLEDGED")}>
                      <button className="rounded-md border px-3 py-2 text-sm font-semibold" type="submit">Đã nhận</button>
                    </form>
                  ) : null}
                  <form action={updateServiceRequestStatusAction.bind(null, access.restaurant.slug, request.id, "COMPLETED")}>
                    <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" type="submit">Hoàn tất</button>
                  </form>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="Yêu cầu khách" description="Chưa có yêu cầu khách." />
          )}
        </aside>
      </section>
    </main>
  );
}
