import Link from "next/link";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { ReportsAutoRefresh } from "@/components/admin/reports-auto-refresh";
import { formatVnd } from "@/lib/money";
import { getReportPeriodLabel, normalizeReportPeriod, type ReportPeriod } from "@/lib/period";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { getRestaurantPaymentReport } from "@/server/services/reporting-service";

const periods: ReportPeriod[] = ["today", "week", "month", "year"];

export default async function AdminReportsPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams: { period?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  requireRestaurantFeature(access, "REPORTS");
  const period = normalizeReportPeriod(searchParams.period);
  const report = await getRestaurantPaymentReport(access.restaurant.id, period);
  const maxBucketAmount = Math.max(...report.buckets.map((bucket) => bucket.amount), 1);
  const previousLabel = getPreviousPeriodLabel(period);
  const recentPayments = report.payments.slice(0, 8);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Báo cáo" plan={access.restaurant.plan} businessType={access.restaurant.businessType}>
      <section className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {periods.map((item) => (
            <Link
              key={item}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${period === item ? "bg-teal-700 text-white" : "bg-white hover:bg-slate-50"}`}
              href={`${restaurantRoutes.adminReports(access.restaurant.slug)}?period=${item}`}
            >
              {getReportPeriodLabel(item)}
            </Link>
          ))}
          <ReportsAutoRefresh />
        </div>

        <RevenueSummary
          period={period}
          revenue={report.summary.revenue}
          previousRevenue={report.previousSummary.revenue}
          comparison={report.comparisons.revenue}
          previousLabel={previousLabel}
        />

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Xu hướng doanh thu</h2>
          <div className="mt-5 flex min-h-[280px] items-end gap-2 overflow-x-auto rounded-lg bg-slate-50 p-4">
            {report.buckets.map((bucket) => {
              const height = bucket.amount > 0 ? Math.max(14, Math.round(bucket.amount / maxBucketAmount * 220)) : 4;
              return (
                <div key={bucket.key} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex h-[230px] w-full items-end justify-center">
                    <div
                      className="w-full max-w-12 rounded-t-md bg-teal-600 transition-all"
                      style={{ height }}
                      title={`${bucket.label}: ${formatVnd(bucket.amount)}`}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600">{bucket.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Top món tạo doanh thu</h2>
            <span className="text-sm text-slate-500">Top {report.topItems.length}</span>
          </div>
          {report.topItems.length ? (
            <div className="mt-4 divide-y rounded-lg border">
              {report.topItems.map((item) => (
                <div key={item.productId} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{item.rank}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="text-sm text-slate-500">{item.quantity} phần</p>
                  </div>
                  <p className="font-bold text-teal-700">{formatVnd(item.revenue)}</p>
                </div>
              ))}
              </div>
            ) : (
            <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">Chưa có món nào tạo doanh thu trong kỳ này.</p>
          )}
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Giao dịch gần đây</h2>
            <span className="text-sm text-slate-500">{report.summary.invoiceCount} bill</span>
          </div>
          {recentPayments.length ? (
            <div className="mt-4 divide-y rounded-lg border">
              {recentPayments.map((payment) => (
                <div key={payment.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div>
                    <p className="font-semibold">Bàn {payment.tableName}</p>
                    <p className="text-sm text-slate-500">{payment.invoiceNumber ?? payment.id.slice(0, 8)}</p>
                  </div>
                  <p className="font-bold text-teal-700 sm:text-right">{formatVnd(payment.amount)}</p>
                  <p className="text-sm text-slate-500 sm:text-right">{payment.paidAtLabel}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">Chưa có giao dịch trong kỳ này.</p>
          )}
        </section>
      </section>
    </RestaurantAdminShell>
  );
}

function RevenueSummary({
  period,
  revenue,
  previousRevenue,
  comparison,
  previousLabel
}: {
  period: ReportPeriod;
  revenue: number;
  previousRevenue: number;
  comparison: { direction: "up" | "down" | "flat"; percent: number; label: string };
  previousLabel: string;
}) {
  const colorClass = comparison.direction === "up" ? "text-emerald-700" : comparison.direction === "down" ? "text-red-700" : "text-slate-600";

  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-800">Doanh thu {getPeriodName(period).toLowerCase()}</p>
      <p className="mt-4 text-4xl font-bold text-slate-950">{formatVnd(revenue)}</p>
      <div className="mt-5 space-y-1">
        <p className={`text-base font-bold ${colorClass}`}>{comparison.label} so với {previousLabel}</p>
        <p className="text-sm text-slate-500">{capitalizeFirst(previousLabel)}: {formatVnd(previousRevenue)}</p>
      </div>
    </section>
  );
}

function getPeriodName(period: ReportPeriod) {
  if (period === "today") return "Hôm nay";
  if (period === "week") return "Tuần này";
  if (period === "month") return "Tháng này";
  return "Năm nay";
}

function getPreviousPeriodLabel(period: ReportPeriod) {
  if (period === "today") return "hôm qua";
  if (period === "week") return "tuần trước";
  if (period === "month") return "tháng trước";
  return "năm trước";
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
