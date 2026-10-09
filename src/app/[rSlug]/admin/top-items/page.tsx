import Link from "next/link";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { formatVnd } from "@/lib/money";
import { getReportPeriodLabel } from "@/lib/period";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { getRestaurantTopItems, normalizeTopItemsPeriod, type TopItemsPeriod } from "@/server/services/top-items-service";

const periods: TopItemsPeriod[] = ["today", "week", "month"];

export default async function AdminTopItemsPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams: { period?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const period = normalizeTopItemsPeriod(searchParams.period);
  const report = await getRestaurantTopItems(access.restaurant.id, period);
  const maxQuantity = Math.max(...report.items.map((item) => item.quantity), 1);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Top món" plan={access.restaurant.plan} businessType={access.restaurant.businessType}>
      <section className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {periods.map((item) => (
            <Link
              key={item}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${period === item ? "bg-teal-700 text-white" : "bg-white hover:bg-slate-50"}`}
              href={`${restaurantRoutes.adminTopItems(access.restaurant.slug)}?period=${item}`}
            >
              {getReportPeriodLabel(item)}
            </Link>
          ))}
        </div>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Top món - {getReportPeriodLabel(period)}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Xếp hạng theo tổng số phần đã gọi, dùng thời gian order theo timezone {report.timeZone}.
              </p>
            </div>
            <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">Top 10</span>
          </div>

          {report.items.length ? (
            <div className="mt-5 space-y-3">
              {report.items.map((item) => (
                <article key={item.productId} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[56px_1fr_auto] sm:items-center">
                  <div className="flex items-center gap-3 sm:block">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-xs font-semibold text-slate-400">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {item.imageUrl ? <img alt={item.name} className="h-full w-full object-cover" src={item.imageUrl} /> : `#${item.rank}`}
                    </div>
                    <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white sm:hidden">#{item.rank}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="hidden rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white sm:inline-flex">#{item.rank}</span>
                      <h3 className="truncate text-base font-semibold">{item.name}</h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.quantity} phần · {formatVnd(item.revenue)}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(6, Math.round(item.quantity / maxQuantity * 100))}%` }} />
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xl font-semibold">{item.quantity}</p>
                    <p className="text-xs text-slate-500">phần</p>
                    <p className="mt-1 text-sm font-semibold text-teal-700">{formatVnd(item.revenue)}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-md bg-slate-50 p-4 text-sm text-slate-500">Chưa có món nào được gọi trong kỳ này.</p>
          )}
        </section>
      </section>
    </RestaurantAdminShell>
  );
}
