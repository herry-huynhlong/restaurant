import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPlatformOverview } from "@/server/services/platform-service";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { StatCard } from "@/components/ui/stat-card";
import Link from "next/link";
import { platformRoutes } from "@/lib/routes";

export default async function PlatformPage() {
  await requirePlatformAdmin();
  const overview = await getPlatformOverview();

  return (
    <PlatformShell
      title="Tổng quan"
      action={
        <Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" href={platformRoutes.newRestaurant}>
          + Thêm nhà hàng
        </Link>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng nhà hàng" value={overview.totalRestaurants} />
        <StatCard label="Đang hoạt động" value={overview.activeRestaurants} />
        <StatCard label="Đã khóa" value={overview.suspendedRestaurants} />
        <StatCard label="Hết hạn" value={overview.expiredRestaurants} />
        <StatCard label="Nhà hàng mới tháng này" value={overview.newRestaurantsThisMonth} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <SummaryList title="Nhà hàng mới nhất" items={overview.restaurants.map((item) => `${item.name} · ${item.slug}`)} />
        <SummaryList title="Sắp hết hạn" items={overview.expiringSoon.map((item) => `${item.name} · ${formatDate(item.subscriptionEnd)}`)} />
        <SummaryList title="Đã hết hạn" items={overview.expired.map((item) => `${item.name} · ${formatDate(item.subscriptionEnd)}`)} />
      </section>
    </PlatformShell>
  );
}

function formatDate(date: Date | null) {
  return date ? new Intl.DateTimeFormat("vi-VN").format(date) : "Chưa đặt";
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => <p key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm">{item}</p>)
        ) : (
          <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>
        )}
      </div>
    </section>
  );
}
