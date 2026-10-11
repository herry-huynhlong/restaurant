import Link from "next/link";
import { PaymentReportTable } from "@/components/admin/payment-report-table";
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

        <div className="grid gap-4 md:grid-cols-3">
          <RevenueKpiCard
            label={`Doanh thu ${getPeriodName(period).toLowerCase()}`}
            value={report.summary.revenue}
            comparison={report.comparisons.revenue}
            previousLabel={previousLabel}
          />
          <CountKpiCard
            label="Bill đã thanh toán"
            value={`${report.summary.invoiceCount} bill`}
            comparison={report.comparisons.invoiceCount}
            previousLabel={previousLabel}
          />
          <CountKpiCard
            label="Bàn đã trả"
            value={report.summary.paidTableCount}
            comparison={report.comparisons.paidTableCount}
            previousLabel={previousLabel}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <section className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Doanh thu theo kỳ</h2>
                <p className="text-sm text-slate-500">Doanh thu đã thanh toán.</p>
              </div>
              <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{getReportPeriodLabel(period)}</span>
            </div>
            {report.buckets.length ? (
              <div className="mt-5 flex min-h-[260px] items-end gap-2 overflow-x-auto rounded-lg bg-slate-50 p-4">
                {report.buckets.map((bucket) => {
                  const height = bucket.amount > 0 ? Math.max(12, Math.round(bucket.amount / maxBucketAmount * 210)) : 3;
                  return (
                    <div key={bucket.key} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2">
                      <div className="flex h-[220px] w-full items-end justify-center">
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
            ) : (
              <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">Chưa có thanh toán trong kỳ này.</p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {report.buckets.map((bucket) => (
                <div key={`line-${bucket.key}`} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{bucket.label}</span>
                  <span className="font-semibold">{formatVnd(bucket.amount)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Cơ cấu thanh toán</h2>
              <p className="text-sm text-slate-500">Theo phương thức trong kỳ.</p>
            </div>
            {report.paymentMethods.length ? (
              <PaymentMethodDonut methods={report.paymentMethods} />
            ) : (
              <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">Chưa có dữ liệu thanh toán.</p>
            )}
          </section>
        </div>

        <PaymentReportTable slug={access.restaurant.slug} payments={report.payments} />
      </section>
    </RestaurantAdminShell>
  );
}

function RevenueKpiCard({
  label,
  value,
  comparison,
  previousLabel
}: {
  label: string;
  value: number;
  comparison: { direction: "up" | "down" | "flat"; percent: number; label: string };
  previousLabel: string;
}) {
  const colorClass = comparison.direction === "up" ? "text-emerald-700" : comparison.direction === "down" ? "text-red-700" : "text-slate-600";
  const ringColor = comparison.direction === "down" ? "#dc2626" : comparison.direction === "flat" ? "#64748b" : "#0f766e";
  const progress = Math.min(100, Math.round(comparison.percent));

  return (
    <article className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-bold">{formatVnd(value)}</p>
        </div>
        <ProgressCircle percent={progress} color={ringColor} label={comparison.direction === "flat" ? "0%" : `${progress}%`} />
      </div>
      <p className={`mt-4 text-sm font-semibold ${colorClass}`}>{comparison.label}</p>
      <p className="mt-1 text-sm text-slate-500">so với {previousLabel}</p>
    </article>
  );
}

function CountKpiCard({
  label,
  value,
  comparison,
  previousLabel
}: {
  label: string;
  value: number | string;
  comparison: { direction: "up" | "down" | "flat"; label: string };
  previousLabel: string;
}) {
  const colorClass = comparison.direction === "up" ? "text-emerald-700" : comparison.direction === "down" ? "text-red-700" : "text-slate-600";

  return (
    <article className="rounded-lg border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className={`mt-4 text-sm font-semibold ${colorClass}`}>{comparison.label}</p>
      <p className="mt-1 text-sm text-slate-500">so với {previousLabel}</p>
    </article>
  );
}

function ProgressCircle({ percent, color, label }: { percent: number; color: string; label: string }) {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - percent / 100 * circumference;

  return (
    <svg className="h-14 w-14" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="18" fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        r="18"
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="27" textAnchor="middle" className="fill-slate-700 text-[10px] font-bold">{label}</text>
    </svg>
  );
}

function PaymentMethodDonut({ methods }: { methods: Array<{ label: string; amount: number; percent: number }> }) {
  const colors = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#64748b"];
  let cursor = 0;
  const gradient = methods.map((method, index) => {
    const start = cursor;
    cursor += method.percent;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(", ");

  return (
    <div className="mt-5">
      <div
        className="mx-auto h-44 w-44 rounded-full"
        style={{ background: `conic-gradient(${gradient || "#e2e8f0 0% 100%"})` }}
        aria-hidden="true"
      >
        <div className="flex h-full items-center justify-center rounded-full p-8">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-center text-sm font-semibold text-slate-700">
            {methods.length} phương thức
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {methods.map((method, index) => (
          <div key={method.label} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              <span className="font-medium">{method.label}</span>
            </div>
            <span className="text-slate-600">{method.percent}% · {formatVnd(method.amount)}</span>
          </div>
        ))}
      </div>
    </div>
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
