"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { RotateCcw, X } from "lucide-react";
import {
  restoreBackupAction
} from "@/app/platform/storage/actions";
import type { RestoreBackupActionState } from "@/app/platform/storage/actions";

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
const initialRestoreBackupActionState: RestoreBackupActionState = {
  status: "idle",
  message: null,
  restoreJobId: null
};

export function BackupHistoryCard({ rows, canRestore }: { rows: BackupHistoryRow[]; canRestore: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedRestore, setSelectedRestore] = useState<BackupHistoryRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
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

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleRestoreAccepted = useCallback((restoreJobId: string, message: string) => {
    setSelectedRestore(null);
    setToast(message);
    router.replace(`/platform/storage?restoreJob=${encodeURIComponent(restoreJobId)}`);
    router.refresh();
  }, [router]);

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
                  {row.status === "SUCCESS" && row.restoreStatus === "NOT_READY" ? (
                    <p className="mt-2 text-sm text-slate-500">Bản sao lưu không còn đầy đủ để khôi phục.</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {row.sizeLabel ? <span className="text-sm font-semibold text-slate-700">{row.sizeLabel}</span> : null}
                  {canRestore && row.status === "SUCCESS" && row.restoreStatus !== "NOT_READY" ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                      type="button"
                      onClick={() => setSelectedRestore(row)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Khôi phục
                    </button>
                  ) : null}
                </div>
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

      {selectedRestore ? (
        <RestoreDialog
          key={selectedRestore.id}
          row={selectedRestore}
          onAccepted={handleRestoreAccepted}
          onClose={() => setSelectedRestore(null)}
        />
      ) : null}
      {toast ? (
        <div aria-live="polite" className="fixed bottom-5 right-5 z-[60] max-w-sm rounded-lg bg-teal-800 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      ) : null}
    </section>
  );
}

function RestoreDialog({
  row,
  onAccepted,
  onClose
}: {
  row: BackupHistoryRow;
  onAccepted: (restoreJobId: string, message: string) => void;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState(restoreBackupAction, initialRestoreBackupActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "success" || !state.restoreJobId || !state.message) return;
    formRef.current?.reset();
    onAccepted(state.restoreJobId, state.message);
  }, [onAccepted, state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={onClose}>
      <section
        aria-labelledby="restore-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">Khôi phục toàn hệ thống</p>
            <h3 id="restore-title" className="mt-1 text-xl font-bold text-slate-950">Xác nhận khôi phục dữ liệu</h3>
          </div>
          <button aria-label="Đóng" className="rounded-md p-2 hover:bg-slate-100" type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Bạn muốn đưa toàn bộ hệ thống về thời điểm {row.meta.replace(/^.*? · /, "")}? Dữ liệu phát sinh sau thời điểm này có thể bị thay thế.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Hệ thống sẽ tự kiểm tra bản sao, tạo điểm an toàn và khóa thao tác ghi trong quá trình khôi phục.
        </p>

        <form ref={formRef} action={formAction} className="mt-5 space-y-4">
          <input name="backupRunId" type="hidden" value={row.id} />
          <label className="block text-sm font-semibold text-slate-700">
            Mật khẩu hiện tại của Admin chính
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border px-3 py-2"
              name="currentPassword"
              required
              type="password"
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <input className="mt-0.5 h-4 w-4" name="acknowledgeRisk" required type="checkbox" />
            <span>Tôi hiểu thao tác này ảnh hưởng đến mọi cửa hàng và dữ liệu mới hơn có thể bị thay thế.</span>
          </label>
          {state.status === "error" && state.message ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={onClose}>
              Hủy
            </button>
            <RestoreSubmitButton />
          </div>
        </form>
      </section>
    </div>
  );
}

function RestoreSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Đang xử lý..." : "Xác nhận khôi phục"}
    </button>
  );
}

function statusClass(status: string) {
  if (status === "SUCCESS") return "border-teal-200 bg-teal-50 text-teal-800";
  if (status === "FAILED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "QUEUED") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}
