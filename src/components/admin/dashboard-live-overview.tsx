"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  LayoutDashboard,
  ListOrdered,
  ReceiptText,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
  type LucideIcon
} from "lucide-react";
import { formatVnd } from "@/lib/money";
import { restaurantRoutes } from "@/lib/routes";

type RevenueComparison = {
  direction: "up" | "down" | "flat";
  label: string;
};

type RevenueTrendPoint = {
  key: string;
  label: string;
  amount: number;
};

type RecentOrder = {
  id: string;
  orderNumber: number;
  tableName: string;
  subtotal: number;
  status: string;
  createdAtLabel: string;
};

type DashboardOverview = {
  restaurant: {
    name: string;
    slug: string;
    logoUrl: string | null;
    status: string;
    plan: string;
    businessType: string;
    timeZone: string;
  } | null;
  revenueToday: number;
  revenueYesterday: number;
  revenueComparison: RevenueComparison;
  orderCountToday: number;
  paidTablesToday: number;
  occupiedTables: number;
  availableTables: number;
  waitingPaymentTables: number;
  totalTables: number;
  tableUtilization: number;
  pendingRequests: number;
  revenueTrend: RevenueTrendPoint[];
  revenueTrendTotal: number;
  recentOrders: RecentOrder[];
};

export function DashboardLiveOverview({ slug, initialOverview }: { slug: string; initialOverview: DashboardOverview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [isStale, setIsStale] = useState(false);

  const refreshOverview = useCallback(async () => {
    try {
      const response = await fetch(`/api/restaurants/${slug}/admin/overview/state`, { cache: "no-store" });
      if (!response.ok) throw new Error("overview_failed");
      setOverview(await response.json());
      setIsStale(false);
    } catch {
      setIsStale(true);
    }
  }, [slug]);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshOverview(), 5000);
    return () => window.clearInterval(interval);
  }, [refreshOverview]);

  const maxTrendAmount = useMemo(() => Math.max(...overview.revenueTrend.map((item) => item.amount), 0), [overview.revenueTrend]);

  return (
    <div className="space-y-5">
      {isStale ? (
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          <AlertCircle className="h-3.5 w-3.5" />
          Đang kết nối lại dữ liệu realtime
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          icon={TrendingUp}
          label="Doanh thu hôm nay"
          value={formatVnd(overview.revenueToday)}
          helper={overview.revenueComparison.label}
          tone={overview.revenueComparison.direction === "down" ? "amber" : "teal"}
        />
        <KpiCard icon={ListOrdered} label="Số đơn hôm nay" value={overview.orderCountToday} helper="Tổng lượt gọi món trong ngày" tone="slate" />
        <KpiCard icon={Table2} label="Bàn đang sử dụng" value={overview.occupiedTables} helper={`${overview.tableUtilization}% công suất bàn`} tone="champagne" />
        <KpiCard icon={CheckCircle2} label="Bàn trống" value={overview.availableTables} helper={`${overview.totalTables} bàn đang hoạt động`} tone="green" />
        <KpiCard icon={CreditCard} label="Bàn đã thanh toán" value={overview.paidTablesToday} helper="Payment PAID trong hôm nay" tone="slate" />
        <KpiCard icon={BellRing} label="Yêu cầu đang chờ" value={overview.pendingRequests} helper="Cần nhân viên xử lý" tone={overview.pendingRequests > 0 ? "red" : "green"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <article className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-teal-800">
                <LayoutDashboard className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Phân tích doanh thu</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">Doanh thu 7 ngày gần nhất từ các payment đã thanh toán.</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-[#fff8e7] px-3 py-2 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">7 ngày</p>
              <p className="text-lg font-semibold text-amber-950">{formatVnd(overview.revenueTrendTotal)}</p>
            </div>
          </div>

          {overview.revenueTrendTotal > 0 ? (
            <div className="mt-6">
              <div className="flex h-64 items-end gap-2 rounded-2xl border bg-slate-50 px-3 py-4 sm:gap-3 sm:px-5">
                {overview.revenueTrend.map((item) => {
                  const height = maxTrendAmount > 0 ? Math.max(8, Math.round(item.amount / maxTrendAmount * 100)) : 0;

                  return (
                    <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <div className="flex h-44 w-full items-end justify-center">
                        <div
                          className="w-full max-w-12 rounded-t-xl bg-gradient-to-t from-teal-800 to-teal-500 shadow-sm transition hover:from-teal-700 hover:to-teal-400"
                          style={{ height: `${height}%` }}
                          title={`${item.label}: ${formatVnd(item.amount)}`}
                        />
                      </div>
                      <p className="w-full truncate text-center text-xs font-medium text-slate-600">{item.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="Chưa có dữ liệu doanh thu" description="Khi có payment PAID, biểu đồ doanh thu 7 ngày sẽ hiển thị tại đây." />
          )}
        </article>

        <article className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-teal-800">
            <Table2 className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Tình trạng bàn</h2>
          </div>
          <div className="mt-5 space-y-4">
            <TableStatusRow label="Đang sử dụng" value={overview.occupiedTables} total={overview.totalTables} tone="bg-teal-700" />
            <TableStatusRow label="Bàn trống" value={overview.availableTables} total={overview.totalTables} tone="bg-emerald-500" />
            <TableStatusRow label="Chờ thanh toán" value={overview.waitingPaymentTables} total={overview.totalTables} tone="bg-amber-500" />
          </div>
          <div className="mt-5 rounded-xl border bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Tỷ lệ sử dụng bàn</p>
            <p className="mt-1 text-3xl font-semibold">{overview.tableUtilization}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-teal-700" style={{ width: `${Math.min(100, overview.tableUtilization)}%` }} />
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-teal-800">
              <ReceiptText className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Đơn hàng gần đây</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Các lượt gọi món mới nhất của nhà hàng.</p>
          </div>
          <Link className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" href={restaurantRoutes.adminOrders(slug)}>
            Xem tất cả đơn hàng
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {overview.recentOrders.length ? (
          <div className="mt-4 divide-y overflow-hidden rounded-xl border">
            {overview.recentOrders.map((order) => (
              <article key={order.id} className="grid gap-2 bg-white px-4 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                <div>
                  <p className="font-semibold">Order #{order.orderNumber}</p>
                  <p className="text-xs text-slate-500">Bàn {order.tableName}</p>
                </div>
                <p className="inline-flex items-center gap-1 text-slate-600">
                  <Clock3 className="h-3.5 w-3.5" />
                  {order.createdAtLabel}
                </p>
                <p className="font-semibold text-slate-900">{formatVnd(order.subtotal)}</p>
                <span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{getOrderStatusLabel(order.status)}</span>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Sparkles} title="Chưa có đơn hàng" description="Khi khách gọi món, đơn gần đây sẽ xuất hiện tại đây." />
        )}
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, helper, tone }: { icon: LucideIcon; label: string; value: string | number; helper: string; tone: "teal" | "green" | "amber" | "red" | "champagne" | "slate" }) {
  const toneClass = {
    teal: "border-teal-100 bg-teal-50 text-teal-800",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    red: "border-red-100 bg-red-50 text-red-700",
    champagne: "border-amber-100 bg-[#fff8e7] text-amber-900",
    slate: "border-slate-100 bg-slate-50 text-slate-700"
  }[tone];

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </article>
  );
}

function TableStatusRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percent = total > 0 ? Math.round(value / total * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-6 text-center">
      <Icon className="mx-auto h-8 w-8 text-slate-400" />
      <p className="mt-3 font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

function getOrderStatusLabel(status: string) {
  if (status === "NEW") return "Mới";
  if (status === "CONFIRMED") return "Đã nhận";
  if (status === "PREPARING") return "Đang làm";
  if (status === "READY") return "Sẵn sàng";
  if (status === "SERVED") return "Đã phục vụ";
  return status;
}
