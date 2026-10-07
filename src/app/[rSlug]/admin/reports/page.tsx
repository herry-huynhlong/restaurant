import Link from "next/link";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { ReportsAutoRefresh } from "@/components/admin/reports-auto-refresh";
import { StatCard } from "@/components/ui/stat-card";
import { formatVnd } from "@/lib/money";
import { getReportPeriodLabel, normalizeReportPeriod, type ReportPeriod } from "@/lib/period";
import { paymentMethodLabels } from "@/lib/payment-method";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
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
  const period = normalizeReportPeriod(searchParams.period);
  const report = await getRestaurantPaymentReport(access.restaurant.id, period);
  const maxBucketAmount = Math.max(...report.buckets.map((bucket) => bucket.amount), 1);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Báo cáo">
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

        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold">Danh sách thanh toán</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Bàn</th>
                  <th className="px-4 py-3">Phương thức</th>
                  <th className="px-4 py-3">Người xác nhận</th>
                  <th className="px-4 py-3 text-right">Số tiền</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.payments.length ? report.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3">{payment.paidAtLabel}</td>
                    <td className="px-4 py-3 font-medium">{payment.invoiceNumber ?? payment.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">Bàn {payment.tableName}</td>
                    <td className="px-4 py-3">{paymentMethodLabels[payment.paymentMethod]}</td>
                    <td className="px-4 py-3">{payment.confirmedByName ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatVnd(payment.amount)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{payment.status}</span></td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>Chưa có thanh toán nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </RestaurantAdminShell>
  );
}
