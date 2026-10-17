import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { OpsLiveRefresher } from "@/components/app-shell/ops-live-refresher";
import { FoodItemDisplayCard } from "@/components/ops/food-item-display-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { prisma } from "@/lib/db/prisma";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { getRecentNotifications } from "@/server/services/notification-service";
import { requireActiveStaffDeviceSession } from "@/server/services/staff-device-session-service";
import { claimKitchenItemAction, markKitchenItemReadyAction } from "@/app/[rSlug]/ops/actions";

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(value);
}

type KitchenItem = Awaited<ReturnType<typeof getKitchenItems>>[number];

async function getKitchenItems(restaurantId: string) {
  return prisma.orderItem.findMany({
    where: {
      restaurantId,
      status: { in: ["NEW", "COOKING"] },
      product: { menuType: { in: ["MAIN", "EXTRA"] } },
      order: {
        diningSession: { status: { in: ["OPEN", "AWAITING_PAYMENT"] } }
      }
    },
    include: {
      order: { include: { table: true } },
      product: { select: { menuType: true, imageUrl: true } },
      restaurant: false
    },
    orderBy: [
      { kitchenClaimedAt: "desc" },
      { order: { createdAt: "asc" } },
      { createdAt: "asc" }
    ],
    take: 100
  });
}

export default async function KitchenPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "KITCHEN"]);
  requireRestaurantFeature(access, "KITCHEN_FLOW");
  const currentDeviceSession = await requireActiveStaffDeviceSession({
    restaurantId: access.restaurant.id,
    restaurantSlug: access.restaurant.slug,
    userId: access.user.id,
    role: access.membership.role,
    nextPath: `/${access.restaurant.slug}/kitchen`
  });
  const [items, notifications, assignedUsers] = await Promise.all([
    getKitchenItems(access.restaurant.id),
    getRecentNotifications(access.restaurant.id, access.user.id),
    prisma.user.findMany({
      where: {
        memberships: { some: { restaurantId: access.restaurant.id } }
      },
      select: { id: true, name: true }
    })
  ]);
  const userNameMap = new Map(assignedUsers.map((user) => [user.id, user.name]));
  const assignedSessionIds = items.map((item) => item.kitchenAssignedDeviceSessionId).filter(Boolean) as string[];
  const assignedSessions = assignedSessionIds.length
    ? await prisma.staffDeviceSession.findMany({
        where: { restaurantId: access.restaurant.id, id: { in: assignedSessionIds } },
        select: { id: true, operatorName: true }
      })
    : [];
  const operatorNameMap = new Map(assignedSessions.map((session) => [session.id, session.operatorName ?? "Nhân viên"]));
  const waitingItems = items.filter((item) => item.status === "NEW");
  const cookingItems = items.filter((item) => item.status === "COOKING").sort((a, b) => {
    const claimedAtDifference = (b.kitchenClaimedAt?.getTime() ?? 0) - (a.kitchenClaimedAt?.getTime() ?? 0);
    if (claimedAtDifference !== 0) return claimedAtDifference;
    return b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title="Bếp"
        subtitle={`${access.restaurant.name} · ${getRoleLabel(access.membership.role)}`}
        notificationSlug={access.restaurant.slug}
        enableShiftControls={access.membership.role === "KITCHEN"}
        actions={
          <>
            <OpsLiveRefresher slug={access.restaurant.slug} />
            <NotificationBell slug={access.restaurant.slug} notifications={notifications} />
          </>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-2">
        <QueueSection
          title="Đang làm"
          emptyTitle="Chưa có món đang làm"
          emptyDescription="Món bạn hoặc bếp khác đã nhận sẽ nằm ở đây."
          items={cookingItems}
          slug={access.restaurant.slug}
          currentUserId={access.user.id}
          currentDeviceSessionId={currentDeviceSession?.id ?? null}
          userNameMap={userNameMap}
          operatorNameMap={operatorNameMap}
          mode="cooking"
        />
        <QueueSection
          title="Chờ làm"
          emptyTitle="Không có món chờ làm"
          emptyDescription="Món chính và món thêm mới sẽ xếp hàng tại đây theo thời gian khách gọi."
          items={waitingItems}
          slug={access.restaurant.slug}
          currentUserId={access.user.id}
          currentDeviceSessionId={currentDeviceSession?.id ?? null}
          userNameMap={userNameMap}
          operatorNameMap={operatorNameMap}
          mode="waiting"
        />
      </section>
    </main>
  );
}

function QueueSection({
  title,
  emptyTitle,
  emptyDescription,
  items,
  slug,
  currentUserId,
  currentDeviceSessionId,
  userNameMap,
  operatorNameMap,
  mode
}: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  items: KitchenItem[];
  slug: string;
  currentUserId: string;
  currentDeviceSessionId: string | null;
  userNameMap: Map<string, string>;
  operatorNameMap: Map<string, string>;
  mode: "waiting" | "cooking";
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
      {items.length ? (
        items.map((item) => (
          <KitchenItemCard
            key={item.id}
            item={item}
            slug={slug}
            currentUserId={currentUserId}
            currentDeviceSessionId={currentDeviceSessionId}
            userNameMap={userNameMap}
            operatorNameMap={operatorNameMap}
            mode={mode}
          />
        ))
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
    </section>
  );
}

function KitchenItemCard({
  item,
  slug,
  currentUserId,
  currentDeviceSessionId,
  userNameMap,
  operatorNameMap,
  mode
}: {
  item: KitchenItem;
  slug: string;
  currentUserId: string;
  currentDeviceSessionId: string | null;
  userNameMap: Map<string, string>;
  operatorNameMap: Map<string, string>;
  mode: "waiting" | "cooking";
}) {
  const isMine = item.kitchenAssignedDeviceSessionId
    ? item.kitchenAssignedDeviceSessionId === currentDeviceSessionId
    : item.kitchenAssignedToUserId === currentUserId;
  const operatorName = item.kitchenAssignedDeviceSessionId ? operatorNameMap.get(item.kitchenAssignedDeviceSessionId) : null;
  const assigneeName = item.kitchenAssignedToUserId ? operatorName ?? userNameMap.get(item.kitchenAssignedToUserId) ?? "Bếp khác" : null;

  return (
    <FoodItemDisplayCard
      imageUrl={item.product.imageUrl}
      name={item.productNameViSnapshot}
      quantity={item.quantity}
      note={item.note}
      meta={<span>Bàn {item.order.table.name} · gọi lúc {formatTime(item.order.createdAt)}</span>}
      statusLabel={mode === "waiting" ? "Chờ làm" : "Đang làm"}
      actions={
        <>
          {assigneeName ? (
            <p className="w-full rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Đang làm bởi: <span className="font-semibold">{isMine ? "Tôi" : assigneeName}</span>
            </p>
          ) : null}
          {mode === "waiting" ? (
            <form action={claimKitchenItemAction.bind(null, slug, item.id)}>
              <PendingSubmitButton className="min-h-11 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang nhận...">Nhận món</PendingSubmitButton>
            </form>
          ) : isMine ? (
            <form action={markKitchenItemReadyAction.bind(null, slug, item.id)}>
              <PendingSubmitButton className="min-h-11 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang lưu...">Hoàn thành</PendingSubmitButton>
            </form>
          ) : null}
        </>
      }
    />
  );
}
