"use client";

import { useMemo, useState } from "react";

export type BackupHistoryRow = {
  id: string;
  status: string;
  title: string;
  meta: string;
  sizeLabel: string | null;
  errorMessage: string | null;
  restoreStatus: "READY" | "NEEDS_CHECK" | "NOT_READY";
};

const PAGE_SIZE = 10;

export function BackupHistoryCard({ rows }: { rows: BackupHistoryRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const visibleRows = useMemo(() => {
    if (!showAll) return rows.slice(0, 3);
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [page, rows, showAll]);

  const toggleShowAll = () => {
    setShowAll((value) => !value);
    setPage(1);
  };

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lịch sử sao lưu</h2>
          <p className="mt-1 text-sm text-slate-500">Hiển thị 3 lần gần nhất.</p>
        </div>
        {rows.length > 3 ? (
          <button className="rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={toggleShowAll}>
            {showAll ? "Thu gọn" : "Xem tất cả"}
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-sm text-slate-500">Chưa có bản sao lưu.</p>
      ) : (
        <div className="mt-4 divide-y">
          {visibleRows.map((row) => (
            <article key={row.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                      {row.title}
                    </span>
                    <p className="text-sm text-slate-500">{row.meta}</p>
                  </div>
                  {row.errorMessage ? <p className="mt-2 text-sm text-amber-700">{row.errorMessage}</p> : null}
                  {row.status === "SUCCESS" && row.restoreStatus !== "READY" ? (
                    <p className="mt-2 text-sm text-slate-500">Bản sao lưu này hiện không thể khôi phục.</p>
                  ) : null}
                </div>
                {row.sizeLabel ? <span className="text-sm font-semibold text-slate-700">{row.sizeLabel}</span> : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {showAll && totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span className="text-slate-500">Trang {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button
              className="rounded-md border bg-white px-3 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Trước
            </button>
            <button
              className="rounded-md border bg-white px-3 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Sau
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function statusClass(status: string) {
  if (status === "SUCCESS") return "border-teal-200 bg-teal-50 text-teal-800";
  if (status === "FAILED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "QUEUED") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}
