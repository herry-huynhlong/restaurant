import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { OrdersByTableBoard } from "@/components/admin/orders-by-table-board";
import { TablesLivePanel } from "@/components/admin/tables-live-panel";
import { StaffWorkspaceTabs } from "@/components/staff/staff-workspace-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { CheckCircle2, Clock3, HandPlatter, Utensils } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { hasPlanFeature } from "@/lib/plan/features";
import { customerDisplayName } from "@/lib/customer-name";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { servedUploadUrl } from "@/lib/upload-url";
import { getActiveTableOrders } from "@/server/services/order-board-service";
import { getRecentNotifications } from "@/server/services/notification-service";
import { requireActiveStaffDeviceSession } from "@/server/services/staff-device-session-service";
import { getAdminTablesState } from "@/server/services/table-state-service";
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

function formatWaitingTime(value: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `Chờ ${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `Chờ ${hours} giờ ${remainder} phút` : `Chờ ${hours} giờ`;
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
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const [readyItems, serviceRequests, notifications, assignedUsers, tableState, activeTableOrders, products] = await Promise.all([
    getWaiterItems(access.restaurant.id),
    prisma.serviceRequest.findMany({
      where: {
        restaurantId: access.restaurant.id,
        status: { in: ["NEW", "ACKNOWLEDGED"] },
        requestType: { not: "REQUEST_PAYMENT" }
      },
      include: { table: true },
      orderBy: { createdAt: "asc" },
      take: 50
    }),
    getRecentNotifications(access.restaurant.id, access.user.id),
    prisma.user.findMany({
      where: {
        memberships: { some: { restaurantId: access.restaurant.id } }
      },
      select: { id: true, name: true }
    }),
    getAdminTablesState(access.restaurant.id, access.restaurant.slug, baseUrl),
    getActiveTableOrders(access.restaurant.id),
    prisma.product.findMany({
      where: {
        restaurantId: access.restaurant.id,
        isActive: true
      },
      orderBy: [{ isFeatured: "desc" }, { nameVi: "asc" }],
      select: {
        id: true,
        menuType: true,
        nameVi: true,
        descriptionVi: true,
        price: true,
        imageUrl: true,
        isSoldOut: true
      }
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
  const readyActionCount = sortedReadyItems.filter((item) => {
    if (!item.waiterAssignedToUserId) return true;
    if (item.waiterAssignedDeviceSessionId) return item.waiterAssignedDeviceSessionId === currentDeviceSession?.id;
    return item.waiterAssignedToUserId === access.user.id;
  }).length;
  const tableCount = tableState.areas.reduce((sum, area) => sum + area.tables.length, 0);
  const tableAttentionCount = tableState.areas.reduce(
    (sum, area) => sum + area.tables.filter((table) => (table.activeSession?.serviceRequests.length ?? 0) > 0).length,
    0
  );
  const orderAttentionCount = activeTableOrders.filter((table) => table.requests.length > 0).length;

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
      <StaffWorkspaceTabs
        counts={{
          ready: { total: sortedReadyItems.length, actionable: readyActionCount },
          requests: { total: serviceRequests.length, actionable: serviceRequests.filter((request) => request.status === "NEW").length },
          tables: { total: tableCount, actionable: tableAttentionCount },
          orders: { total: activeTableOrders.length, actionable: orderAttentionCount }
        }}
        ready={
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-teal-700">Ưu tiên phục vụ</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">Món chờ đi</h2>
              </div>
              <p className="text-sm text-slate-500">Món chờ lâu được xếp trước</p>
            </div>
            {sortedReadyItems.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {sortedReadyItems.map((item) => (
                  <WaiterItemCard
                    key={item.id}
                    item={item}
                    slug={access.restaurant.slug}
                    currentUserId={access.user.id}
                    currentDeviceSessionId={currentDeviceSession?.id ?? null}
                    userNameMap={userNameMap}
                    operatorNameMap={operatorNameMap}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="Món chờ đi" description="Món bếp báo xong và đồ uống sẽ xuất hiện tại đây." />
            )}
          </section>
        }
        requests={
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-teal-700">Hỗ trợ tại bàn</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">Yêu cầu khách</h2>
              </div>
              <p className="text-sm text-slate-500">Yêu cầu chờ lâu được xếp trước</p>
            </div>
            {serviceRequests.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {serviceRequests.map((request) => (
                  <article key={request.id} className={`flex min-w-0 flex-col rounded-lg border bg-white p-4 shadow-sm ${request.status === "NEW" ? "border-amber-300" : "border-teal-200"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xl font-bold text-slate-950">Bàn {request.table.name}</p>
                        <p className="mt-1 font-semibold text-slate-800">{serviceLabels[request.requestType]}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${request.status === "NEW" ? "bg-amber-100 text-amber-800" : "bg-teal-50 text-teal-700"}`}>
                        {request.status === "NEW" ? "Chưa nhận" : "Đang xử lý"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px] font-semibold">
                      <span className={`rounded px-1 py-1.5 ${request.status === "NEW" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>Chưa nhận</span>
                      <span className={`rounded px-1 py-1.5 ${request.status === "ACKNOWLEDGED" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500"}`}>Đang xử lý</span>
                      <span className="rounded bg-slate-100 px-1 py-1.5 text-slate-500">Hoàn tất</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                      <span>{customerDisplayName(request.customerName)}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Clock3 className="h-3.5 w-3.5" />{formatWaitingTime(request.createdAt)}</span>
                      <span className="text-xs text-slate-400">{formatTime(request.createdAt)}</span>
                    </div>
                    {request.message ? <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{request.message}</p> : null}

                    <div className="mt-auto pt-4">
                      {request.status === "NEW" ? (
                        <form action={updateServiceRequestStatusAction.bind(null, access.restaurant.slug, request.id, "ACKNOWLEDGED")}>
                          <PendingSubmitButton className="min-h-11 w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang nhận...">Nhận yêu cầu</PendingSubmitButton>
                        </form>
                      ) : (
                        <form action={updateServiceRequestStatusAction.bind(null, access.restaurant.slug, request.id, "COMPLETED")}>
                          <PendingSubmitButton className="min-h-11 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang lưu...">Hoàn tất yêu cầu</PendingSubmitButton>
                        </form>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Yêu cầu khách" description="Chưa có yêu cầu khách." />
            )}
          </section>
        }
        tables={
          <TablesLivePanel
            slug={access.restaurant.slug}
            restaurantName={access.restaurant.name}
            cashierName={access.user.name}
            canUsePayment={hasPlanFeature(access.restaurant.plan, "PAYMENT_CONFIRM", access.restaurant.businessType, access.restaurant.planEntitlement) && ["OWNER", "MANAGER", "CASHIER"].includes(access.membership.role)}
            showQrTools={false}
            products={products}
            initialState={tableState}
            compactForStaff
          />
        }
        orders={
          <OrdersByTableBoard
            slug={access.restaurant.slug}
            restaurantName={access.restaurant.name}
            initialTables={activeTableOrders}
            products={products}
            enableAddOrder
            compactForStaff
          />
        }
      />
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
  const readyAt = item.readyAt ?? item.createdAt;
  const imageUrl = servedUploadUrl(item.product.imageUrl) ?? item.product.imageUrl;

  return (
    <article className={`flex min-w-0 flex-col rounded-lg border bg-white p-3 shadow-sm ${assigneeName && !isMine ? "border-slate-200 opacity-75" : "border-teal-200"}`}>
      <div className="flex gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={item.productNameViSnapshot} className="h-full w-full object-cover" src={imageUrl} />
          ) : (
            <Utensils className="h-7 w-7 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-teal-700">Bàn {item.order.table.name} · {readyLabel}</p>
              <h3 className="mt-1 break-words text-base font-bold leading-snug text-slate-950">{item.productNameViSnapshot}</h3>
            </div>
            <span className="shrink-0 rounded-md bg-teal-50 px-2.5 py-1 text-lg font-bold text-teal-800">x{item.quantity}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Clock3 className="h-3.5 w-3.5" />{formatWaitingTime(readyAt)}</span>
            <span>{formatTime(readyAt)}</span>
          </div>
        </div>
      </div>

      {item.note ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Ghi chú: {item.note}</p> : null}
      {assigneeName ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <HandPlatter className="h-4 w-4" />
          <span><span className="font-semibold">{isMine ? "Tôi" : assigneeName}</span> đã nhận món</span>
        </p>
      ) : null}

      <div className="mt-auto pt-3">
        {!item.waiterAssignedToUserId ? (
          <form action={claimWaiterItemAction.bind(null, slug, item.id)}>
            <PendingSubmitButton className="min-h-11 w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang nhận...">Nhận đi món</PendingSubmitButton>
          </form>
        ) : isMine ? (
          <form action={markWaiterItemServedAction.bind(null, slug, item.id)}>
            <PendingSubmitButton className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang lưu...">
              <CheckCircle2 className="h-4 w-4" /> Đã phục vụ
            </PendingSubmitButton>
          </form>
        ) : null}
      </div>
    </article>
  );
}
