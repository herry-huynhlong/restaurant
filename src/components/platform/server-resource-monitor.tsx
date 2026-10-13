"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Archive, HardDrive, MemoryStick, RefreshCw } from "lucide-react";

type MetricValue = {
  totalBytes: number;
  usedBytes: number;
  availableBytes?: number;
  percentUsed: number;
};

type MetricsResponse = {
  host: {
    ok: boolean;
    stale: boolean;
    collectedAt: string | null;
    disk: MetricValue | null;
    memory: MetricValue | null;
    swap: Omit<MetricValue, "availableBytes"> | null;
    error: string | null;
  };
  backup: {
    totalBytes: number;
    successfulCount: number;
    retentionCount: number;
    latestSuccessfulAt: string | null;
  };
};

export function ServerResourceMonitor() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadMetrics = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/platform/storage/metrics", { cache: "no-store" });
        if (!response.ok) throw new Error("Không thể cập nhật số liệu.");
        const payload = (await response.json()) as MetricsResponse;
        setMetrics(payload);
        setError(payload.host.error);
      } catch {
        setError("Không thể cập nhật số liệu.");
      }
    });
  };

  useEffect(() => {
    loadMetrics();
    const timer = window.setInterval(loadMetrics, 10000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Tài nguyên máy chủ</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Theo dõi gần realtime</h2>
          <p className="mt-2 text-sm text-slate-500">
            Cập nhật mỗi 10 giây từ bộ đo trên máy chủ.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
          type="button"
          disabled={isPending}
          onClick={loadMetrics}
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </div>

      {error ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ResourceCard icon={<HardDrive className="h-5 w-5" />} title="Ổ cứng máy chủ" metric={metrics?.host.disk ?? null} />
        <ResourceCard icon={<MemoryStick className="h-5 w-5" />} title="RAM máy chủ" metric={metrics?.host.memory ?? null} />
        <ResourceCard icon={<MemoryStick className="h-5 w-5" />} title="Swap" metric={metrics?.host.swap ?? null} />
        <BackupCard metrics={metrics} />
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Cập nhật cuối: {metrics?.host.collectedAt && metrics.host.ok ? formatDateTime(metrics.host.collectedAt) : "Chưa có dữ liệu mới"}
      </p>
    </section>
  );
}

function ResourceCard({ icon, title, metric }: { icon: React.ReactNode; title: string; metric: MetricValue | Omit<MetricValue, "availableBytes"> | null }) {
  const level = metric ? usageLevel(metric.percentUsed) : "unknown";
  return (
    <article className="rounded-2xl border bg-slate-50 p-4">
      <div className="flex items-center gap-3 text-teal-700">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white">{icon}</span>
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      <p className="mt-4 text-2xl font-bold text-slate-950">
        {metric ? `${formatBytes(metric.usedBytes)} / ${formatBytes(metric.totalBytes)}` : "Chưa có"}
      </p>
      <ProgressBar value={metric?.percentUsed ?? 0} level={level} />
      <p className="mt-2 text-sm text-slate-500">
        {metric ? `${metric.percentUsed.toFixed(1)}% đang sử dụng` : "Đang chờ số liệu máy chủ"}
      </p>
    </article>
  );
}

function BackupCard({ metrics }: { metrics: MetricsResponse | null }) {
  return (
    <article className="rounded-2xl border bg-slate-50 p-4">
      <div className="flex items-center gap-3 text-teal-700">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white">
          <Archive className="h-5 w-5" />
        </span>
        <h3 className="font-semibold text-slate-950">Bản sao lưu</h3>
      </div>
      <p className="mt-4 text-2xl font-bold text-slate-950">{metrics ? formatBytes(metrics.backup.totalBytes) : "Chưa có"}</p>
      <p className="mt-2 text-sm text-slate-500">
        {metrics ? `${metrics.backup.successfulCount} bản thành công · giữ tối đa ${metrics.backup.retentionCount}` : "Đang chờ số liệu"}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Gần nhất: {metrics?.backup.latestSuccessfulAt ? formatDateTime(metrics.backup.latestSuccessfulAt) : "Chưa có"}
      </p>
    </article>
  );
}

function ProgressBar({ value, level }: { value: number; level: string }) {
  const color = level === "critical" ? "bg-red-600" : level === "warning" ? "bg-amber-500" : level === "watch" ? "bg-yellow-400" : "bg-teal-700";
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function usageLevel(value: number) {
  if (value >= 95) return "critical";
  if (value >= 85) return "warning";
  if (value >= 70) return "watch";
  return "normal";
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}
