import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db/prisma";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { getRecentNotifications } from "@/server/services/notification-service";
import { updateOrderStatusAction } from "@/app/[rSlug]/ops/actions";

export default async function KitchenPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "KITCHEN"]);
  const [orders, notifications] = await Promise.all([
    prisma.order.findMany({
      where: {
        restaurantId: access.restaurant.id,
        status: { in: ["NEW", "CONFIRMED", "PREPARING"] }
      },
      include: {
        table: true,
        items: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { createdAt: "asc" },
      take: 50
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title="Bếp"
        subtitle={`${access.restaurant.name} · ${getRoleLabel(access.membership.role)}`}
        notificationSlug={access.restaurant.slug}
        actions={
          <>
            <OpsLiveRefresher slug={access.restaurant.slug} />
            <NotificationBell slug={access.restaurant.slug} notifications={notifications} />
          </>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 md:grid-cols-2">
        {orders.length ? (
          orders.map((order) => (
            <article key={order.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-teal-700">{order.status === "NEW" ? "Đơn mới" : order.status === "CONFIRMED" ? "Đã nhận" : order.status === "PREPARING" ? "Đang làm" : order.status}</p>
                  <h2 className="mt-1 text-lg font-semibold">Order #{order.orderNumber} · Bàn {order.table.name}</h2>
                  <p className="text-sm text-slate-600">{order.customerName}</p>
                </div>
                <p className="text-xs text-slate-500">{new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(order.createdAt)}</p>
              </div>
              <ul className="mt-3 divide-y text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="py-2">
                    <p className="font-medium">{item.quantity} x {item.productNameViSnapshot}</p>
                    {item.note ? <p className="mt-1 text-xs text-slate-500">{item.note}</p> : null}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {order.status === "NEW" || order.status === "CONFIRMED" ? (
                  <form action={updateOrderStatusAction.bind(null, access.restaurant.slug, order.id, "PREPARING")}>
                    <button className="rounded-md border px-3 py-2 text-sm font-semibold" type="submit">Bắt đầu làm</button>
                  </form>
                ) : null}
                <form action={updateOrderStatusAction.bind(null, access.restaurant.slug, order.id, "READY")}>
                  <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">Xong món</button>
                </form>
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="Chưa có món đang chờ" description="Staff xác nhận order thì bếp sẽ thấy tại đây." />
        )}
      </section>
    </main>
  );
}
