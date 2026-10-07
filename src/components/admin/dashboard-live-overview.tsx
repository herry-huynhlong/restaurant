"use client";

import { useCallback, useEffect, useState } from "react";
import { formatVnd } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";

type DashboardOverview = {
  revenueToday: number;
  ordersToday: number;
  occupiedTables: number;
  availableTables: number;
  pendingRequests: number;
  topProduct?: string | null;
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
    const interval = window.setInterval(() => void refreshOverview(), 3000);
    return () => window.clearInterval(interval);
  }, [refreshOverview]);

  return (
    <section className="space-y-3">
      <div className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${isStale ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"}`}>
        {isStale ? "Đang kết nối lại" : "Live"}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Doanh thu hôm nay" value={formatVnd(overview.revenueToday)} />
        <StatCard label="Order hôm nay" value={overview.ordersToday} />
        <StatCard label="Bàn đang dùng" value={overview.occupiedTables} />
        <StatCard label="Bàn trống" value={overview.availableTables} />
        <StatCard label="Yêu cầu đang chờ" value={overview.pendingRequests} />
        <StatCard label="Top món hôm nay" value={overview.topProduct ?? "Chưa có"} />
      </div>
    </section>
  );
}
