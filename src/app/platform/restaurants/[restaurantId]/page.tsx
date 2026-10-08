import { notFound } from "next/navigation";
import Link from "next/link";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformRestaurantActions } from "@/components/platform/restaurant-row-actions";
import { StatCard } from "@/components/ui/stat-card";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { restaurantStatusLabel, subscriptionStatusLabel } from "@/lib/platform/restaurant-status";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { getPlatformRestaurantDetail } from "@/server/services/platform-service";
import { extendSubscriptionAction } from "@/app/platform/restaurants/actions";

export default async function RestaurantDetailPage({
  params,
  searchParams
}: {
  params: { restaurantId: string };
  searchParams?: { error?: string; success?: string };
}) {
  await requirePlatformAdmin();
  const restaurant = await getPlatformRestaurantDetail(params.restaurantId);

  if (!restaurant) {
    notFound();
  }

  return (
    <PlatformShell
      title={restaurant.name}
      action={<Link className="rounded-md border px-4 py-2 text-sm font-semibold" href={platformRoutes.restaurantEdit(restaurant.id)}>Chỉnh sửa</Link>}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <section className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Trạng thái" value={restaurantStatusLabel(restaurant.status)} />
        <StatCard label="Gói" value={restaurant.plan} />
        <StatCard label="Subscription" value={subscriptionStatusLabel(restaurant.subscriptionStatus)} />
        <StatCard label="Hết hạn" value={formatDate(restaurant.subscriptionEnd)} />
        <StatCard label="Tổng bàn" value={restaurant._count.tables} />
        <StatCard label="Tổng nhân viên" value={restaurant._count.users} />
      </section>

      <section className="mb-5 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Thao tác</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <PlatformRestaurantActions
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            status={restaurant.status}
            plan={restaurant.plan}
            returnTo={platformRoutes.restaurantDetail(restaurant.id)}
          />
          <form className="flex flex-wrap gap-2" action={extendSubscriptionAction}>
            <input name="restaurantId" type="hidden" value={restaurant.id} />
            <input className="rounded-md border px-3 py-2 text-sm" name="subscriptionEnd" type="date" />
            <select className="rounded-md border px-3 py-2 text-sm" name="plan" defaultValue={restaurant.plan === "PRO" ? "PRO" : "BASIC"}>
              <option value="BASIC">BASIC</option>
              <option value="PRO">PRO</option>
            </select>
            <button className="rounded-md border px-3 py-2 text-sm" type="submit">Gia hạn</button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Thông tin">
          <Info label="Slug" value={restaurant.slug} />
          <Info label="Điện thoại" value={restaurant.settings?.phone} />
          <Info label="Địa chỉ" value={restaurant.settings?.address} />
          <Info label="Timezone" value={restaurant.settings?.timezone} />
        </Panel>
        <Panel title="Owner / Nhân viên">
          {restaurant.users.map((membership) => (
            <Info key={membership.id} label={getRoleLabel(membership.role)} value={`${membership.user.name} · ${membership.user.email}`} />
          ))}
        </Panel>
        <Panel title="Bàn">
          {restaurant.tables.length ? restaurant.tables.map((table) => <Info key={table.id} label={table.name} value={`${table.area.name} · ${table.status}`} />) : <Empty />}
        </Panel>
        <Panel title="Audit logs">
          {restaurant.auditLogs.length ? restaurant.auditLogs.map((log) => <Info key={log.id} label={log.action} value={`${log.user?.email ?? "system"} · ${formatDateTime(log.createdAt)}`} />) : <Empty />}
        </Panel>
      </section>
    </PlatformShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <p className="rounded-md bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{label}:</span> {value || "-"}</p>;
}

function Empty() {
  return <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>;
}

function formatDate(date: Date | null) {
  return date ? new Intl.DateTimeFormat("vi-VN").format(date) : "-";
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}
