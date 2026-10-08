import Link from "next/link";
import { PaymentReportTable } from "@/components/admin/payment-report-table";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { ReportsAutoRefresh } from "@/components/admin/reports-auto-refresh";
import { StatCard } from "@/components/ui/stat-card";
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
  requireRestaurantFeature(access, "ADVANCED_REPORTS");
  const period = normalizeReportPeriod(searchParams.period);
  const report = await getRestaurantPaymentReport(access.restaurant.id, period);
  const maxBucketAmount = Math.max(...report.buckets.map((bucket) => bucket.amount), 1);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Báo cáo" plan={access.restaurant.plan}>
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

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Doanh thu đã thu" value={formatVnd(report.summary.revenue)} />
          <StatCard label="Số bill đã thanh toán" value={report.summary.invoiceCount} />
          <StatCard label="Số bàn đã trả" value={report.summary.paidTableCount} />
        </div>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Doanh thu theo kỳ</h2>
              <p className="text-sm text-slate-500">Chỉ tính payment PAID, timezone {report.timeZone}.</p>
            </div>
            <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{getReportPeriodLabel(period)}</span>
          </div>
          {report.buckets.length ? (
            <div className="mt-4 space-y-3">
              {report.buckets.map((bucket) => (
                <div key={bucket.key} className="grid gap-2 sm:grid-cols-[90px_1fr_120px] sm:items-center">
                  <span className="text-sm font-medium">{bucket.label}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(4, Math.round(bucket.amount / maxBucketAmount * 100))}%` }} />
                  </div>
                  <span className="text-sm font-semibold sm:text-right">{formatVnd(bucket.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">Chưa có payment đã thanh toán trong kỳ này.</p>
          )}
        </section>

        <PaymentReportTable slug={access.restaurant.slug} payments={report.payments} />
      </section>
    </RestaurantAdminShell>
  );
}
