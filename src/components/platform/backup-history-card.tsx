"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LockKeyhole, ShieldCheck } from "lucide-react";

export type BackupHistoryRow = {
  id: string;
  status: string;
  title: string;
  meta: string;
  sizeLabel: string | null;
  errorMessage: string | null;
  diagnosticMessage: string | null;
  startedAtLabel: string;
  completedAtLabel: string;
  verifiedAtLabel: string;
  restoreReadiness: {
    status: "READY" | "NEEDS_CHECK" | "NOT_READY";
    productionRestoreMessage: string;
    checks: Array<{
      key: string;
      title: string;
      status: "PASS" | "WARN" | "FAIL";
      message: string;
    }>;
  };
};

const PAGE_SIZE = 10;

export function BackupHistoryCard({
  rows,
  canManageRestore = false,
  checkRestoreAction
}: {
  rows: BackupHistoryRow[];
  canManageRestore?: boolean;
  checkRestoreAction?: (formData: FormData) => void | Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const visibleRows = useMemo(() => {
    if (!showAll) return rows.slice(0, 3);
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [page, rows, showAll]);

  const toggleShowAll = () => {
    setShowAll((value) => !value);
    setPage(1);
    setExpanded({});
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
          {visibleRows.map((row) => {
            const isExpanded = Boolean(expanded[row.id]);
            return (
              <article key={row.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                        {row.title}
                      </span>
                      <p className="text-sm text-slate-500">{row.meta}</p>
                    </div>
                    {row.errorMessage ? <p className="mt-2 text-sm text-amber-700">{row.errorMessage}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {row.sizeLabel ? <span className="text-sm font-semibold text-slate-700">{row.sizeLabel}</span> : null}
                    <button
                      className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                      type="button"
                      onClick={() => setExpanded((value) => ({ ...value, [row.id]: !value[row.id] }))}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {isExpanded ? "Ẩn chi tiết" : "Xem chi tiết"}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="mt-3 space-y-3 rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <p>
                        <span className="font-semibold text-slate-800">Bắt đầu:</span> {row.startedAtLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Hoàn thành:</span> {row.completedAtLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Xác minh:</span> {row.verifiedAtLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Khả dụng:</span> {restoreStatusLabel(row.restoreReadiness.status)}
                      </p>
                      {row.diagnosticMessage ? (
                        <p className="sm:col-span-2">
                          <span className="font-semibold text-slate-800">Thông tin kiểm tra:</span> {row.diagnosticMessage}
                        </p>
                      ) : null}
                    </div>

                    {row.status === "SUCCESS" ? (
                      <div className="rounded-lg border bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">Khôi phục dữ liệu</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{row.restoreReadiness.productionRestoreMessage}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {canManageRestore && checkRestoreAction ? (
                              <form action={checkRestoreAction}>
                                <input name="backupRunId" type="hidden" value={row.id} />
                                <button className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="submit">
                                  <ShieldCheck className="h-4 w-4" />
                                  Kiểm tra khả năng khôi phục
                                </button>
                              </form>
                            ) : null}
                            <button
                              className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500"
                              type="button"
                              disabled
                              title="Khôi phục production đang khóa để bảo vệ dữ liệu."
                            >
                              <LockKeyhole className="h-4 w-4" />
                              Khôi phục
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {row.restoreReadiness.checks.map((check) => (
                            <div key={check.key} className="rounded-md border bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800">{check.title}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${checkClass(check.status)}`}>
                                  {checkLabel(check.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">{check.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {showAll && totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span className="text-slate-500">
            Trang {page}/{totalPages}
          </span>
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

function restoreStatusLabel(status: BackupHistoryRow["restoreReadiness"]["status"]) {
  if (status === "READY") return "File hợp lệ ở mức kiểm tra kỹ thuật";
  if (status === "NEEDS_CHECK") return "Cần kiểm tra thêm trước khi khôi phục";
  return "Chưa đủ điều kiện khôi phục";
}

function checkLabel(status: "PASS" | "WARN" | "FAIL") {
  if (status === "PASS") return "Đạt";
  if (status === "WARN") return "Cần lưu ý";
  return "Không đạt";
}

function checkClass(status: "PASS" | "WARN" | "FAIL") {
  if (status === "PASS") return "bg-teal-50 text-teal-800";
  if (status === "WARN") return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}
