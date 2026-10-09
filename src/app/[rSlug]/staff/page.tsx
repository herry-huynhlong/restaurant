import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/db/prisma";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { getRecentNotifications } from "@/server/services/notification-service";
import { requireActiveStaffDeviceSession } from "@/server/services/staff-device-session-service";
import { claimWaiterItemAction, markWaiterItemServedAction, updateServiceRequestStatusAction } from "@/app/[rSlug]/ops/actions";

const serviceLabels: Record<string, string> = {
  CALL_STAFF: "Gọi nhân viên",
  REQUEST_WATER: "Thêm nước",
  REQUEST_UTENSILS: "Thêm dụng cụ",
  REQUEST_PAYMENT: "Thanh toán",
  OTHER: "Hỗ trợ"
};

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(value);
}

type WaiterItem = Awaited<ReturnType<typeof getWaiterItems>>[number];

async function getWaiterItems(restaurantId: string) {
  return prisma.orderItem.findMany({
    where: {
      restaurantId,
      status: "READY",
      order: {
        diningSession: { status: { in: ["OPEN", "AWAITING_PAYMENT"] } }
      }
    },
    include: {
      order: { include: { table: true } },
      product: { select: { menuType: true, imageUrl: true } }
    },
    orderBy: [
      { readyAt: "asc" },
      { order: { createdAt: "asc" } },
      { createdAt: "asc" }
    ],
    take: 100
  });
}

export default async function StaffPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER"]);
  const currentDeviceSession = await requireActiveStaffDeviceSession({
    restaurantId: access.restaurant.id,
    restaurantSlug: access.restaurant.slug,
    userId: access.user.id,
    role: access.membership.role,
    nextPath: `/${access.restaurant.slug}/staff`
  });
  const [readyItems, serviceRequests, notifications, assignedUsers] = await Promise.all([
    getWaiterItems(access.restaurant.id),
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
    getRecentNotifications(access.restaurant.id, access.user.id),
    prisma.user.findMany({
      where: {
        memberships: { some: { restaurantId: access.restaurant.id } }
      },
      select: { id: true, name: true }
    })
  ]);
  const userNameMap = new Map(assignedUsers.map((user) => [user.id, user.name]));
  const assignedSessionIds = readyItems.map((item) => item.waiterAssignedDeviceSessionId).filter(Boolean) as string[];
  const assignedSessions = assignedSessionIds.length
    ? await prisma.staffDeviceSession.findMany({
        where: { restaurantId: access.restaurant.id, id: { in: assignedSessionIds } },
        select: { id: true, operatorName: true }
      })
    : [];
  const operatorNameMap = new Map(assignedSessions.map((session) => [session.id, session.operatorName ?? "Nhân viên"]));
  const sortedReadyItems = readyItems.sort((a, b) => {
    const mineA = a.waiterAssignedToUserId === access.user.id ? 0 : a.waiterAssignedToUserId ? 1 : -1;
    const mineB = b.waiterAssignedToUserId === access.user.id ? 0 : b.waiterAssignedToUserId ? 1 : -1;
    return mineA - mineB || (a.readyAt?.getTime() ?? a.createdAt.getTime()) - (b.readyAt?.getTime() ?? b.createdAt.getTime());
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title="Phục vụ"
        subtitle={`${access.restaurant.name} · ${getRoleLabel(access.membership.role)}`}
        notificationSlug={access.restaurant.slug}
        enableShiftControls={access.membership.role === "WAITER"}
        actions={
          <>
            <OpsLiveRefresher slug={access.restaurant.slug} />
            <NotificationBell slug={access.restaurant.slug} notifications={notifications} />
          </>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-3">
          <h2 className="text-base font-semibold uppercase tracking-wide text-slate-700">Món chờ đi</h2>
          {sortedReadyItems.length ? (
            sortedReadyItems.map((item) => (
              <WaiterItemCard
                key={item.id}
                item={item}
                slug={access.restaurant.slug}
                currentUserId={access.user.id}
                currentDeviceSessionId={currentDeviceSession?.id ?? null}
                userNameMap={userNameMap}
                operatorNameMap={operatorNameMap}
              />
            ))
          ) : (
            <EmptyState title="Món chờ đi" description="Món bếp báo xong và đồ uống sẽ xuất hiện tại đây." />
          )}
        </section>
        <aside className="space-y-3">
          <h2 className="text-base font-semibold">Yêu cầu khách</h2>
          {serviceRequests.length ? (
            serviceRequests.map((request) => (
              <article key={request.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold">Bàn {request.table.name} · {serviceLabels[request.requestType]}</p>
                <p className="mt-1 text-sm text-slate-600">{request.customerName}</p>
                {request.message ? <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm">{request.message}</p> : null}
                <p className="mt-2 text-xs text-slate-500">{formatTime(request.createdAt)}</p>
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

function WaiterItemCard({
  item,
  slug,
  currentUserId,
  currentDeviceSessionId,
  userNameMap,
  operatorNameMap
}: {
  item: WaiterItem;
  slug: string;
  currentUserId: string;
  currentDeviceSessionId: string | null;
  userNameMap: Map<string, string>;
  operatorNameMap: Map<string, string>;
}) {
  const isMine = item.waiterAssignedDeviceSessionId
    ? item.waiterAssignedDeviceSessionId === currentDeviceSessionId
    : item.waiterAssignedToUserId === currentUserId;
  const operatorName = item.waiterAssignedDeviceSessionId ? operatorNameMap.get(item.waiterAssignedDeviceSessionId) : null;
  const assigneeName = item.waiterAssignedToUserId ? operatorName ?? userNameMap.get(item.waiterAssignedToUserId) ?? "Nhân viên khác" : null;
  const readyLabel = item.product.menuType === "DRINK" ? "Đồ uống" : "Bếp đã xong";

  return (
    <article className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-teal-700">Bàn {item.order.table.name} · {readyLabel}</p>
          <h3 className="mt-1 text-lg font-semibold">{item.productNameViSnapshot} x{item.quantity}</h3>
          {item.note ? <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-800">{item.note}</p> : null}
        </div>
        <p className="text-xs text-slate-500">Xong lúc {formatTime(item.readyAt ?? item.createdAt)}</p>
      </div>
      {assigneeName ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Đã có: <span className="font-semibold">{isMine ? "Tôi" : assigneeName}</span> nhận
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!item.waiterAssignedToUserId ? (
          <form action={claimWaiterItemAction.bind(null, slug, item.id)}>
            <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">Nhận đi món</button>
          </form>
        ) : isMine ? (
          <form action={markWaiterItemServedAction.bind(null, slug, item.id)}>
            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" type="submit">Đã phục vụ</button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
