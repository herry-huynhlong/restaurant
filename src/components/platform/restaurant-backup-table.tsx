"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { Archive, RotateCcw, X } from "lucide-react";
import {
  queueRestaurantBackupAction,
  queueRestaurantRestoreAction
} from "@/app/platform/storage/actions";
import type { RestaurantRestoreActionState } from "@/app/platform/storage/actions";
import { FormCancelButton, PendingSubmitButton } from "@/components/ui/pending-submit-button";

type BackupRow = {
  id: string;
  status: string;
  triggerType: string;
  sizeBytes: number;
  verifiedAt: Date | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
};

type RestoreRow = {
  id: string;
  backupRunId: string;
  status: string;
  publicMessage: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
};

export type RestaurantBackupTableRow = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantPlan: string;
  estimatedBytes: number;
  calculatedAt: Date;
  backups: BackupRow[];
  restores: RestoreRow[];
};

const initialRestoreState: RestaurantRestoreActionState = {
  status: "idle",
  message: null,
  restoreRunId: null
};

export function RestaurantBackupTable({ rows, canManage, restoreEnabled }: { rows: RestaurantBackupTableRow[]; canManage: boolean; restoreEnabled: boolean }) {
  const router = useRouter();
  const [historyRestaurant, setHistoryRestaurant] = useState<RestaurantBackupTableRow | null>(null);
  const [restoreRestaurant, setRestoreRestaurant] = useState<RestaurantBackupTableRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hasActiveJobs = rows.some((row) =>
    row.backups.some((backup) => ["QUEUED", "RUNNING"].includes(backup.status))
    || row.restores.some((restore) => ["QUEUED", "VERIFYING", "PREPARING", "RESTORING"].includes(restore.status))
  );

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Bảo vệ dữ liệu theo cửa hàng</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Sao lưu từng cửa hàng</h2>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map((row) => {
          const successful = row.backups.filter((backup) => backup.status === "SUCCESS");
          const latest = successful[0];
          const activeRestore = row.restores.find((restore) => ["QUEUED", "VERIFYING", "PREPARING", "RESTORING"].includes(restore.status));
          return (
            <article key={row.restaurantId} className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-950">{row.restaurantName}</h3>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{row.restaurantPlan}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">/{row.restaurantSlug} · {formatBytes(row.estimatedBytes)}</p>
                <p className="mt-2 text-sm text-slate-700">
                  {latest ? `Sao lưu gần nhất: ${formatDateTime(latest.completedAt ?? latest.queuedAt)}` : "Chưa có bản sao lưu riêng"}
                  {` · ${successful.length} bản khả dụng`}
                </p>
                {activeRestore ? <p className="mt-2 text-sm font-semibold text-teal-700">{activeRestore.publicMessage ?? "Đang xử lý khôi phục cửa hàng."}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={() => setHistoryRestaurant(row)}>
                  <Archive className="h-4 w-4" /> Lịch sử sao lưu
                </button>
                {canManage && restoreEnabled ? (
                  <form action={queueRestaurantBackupAction}>
                    <input name="restaurantId" type="hidden" value={row.restaurantId} />
                    <TenantBackupSubmitButton />
                  </form>
                ) : null}
                {canManage ? (
                  <button
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    type="button"
                    disabled={!successful.some((backup) => backup.verifiedAt) || Boolean(activeRestore)}
                    onClick={() => setRestoreRestaurant(row)}
                  >
                    <RotateCcw className="h-4 w-4" /> Khôi phục
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {historyRestaurant ? <HistoryDialog row={historyRestaurant} onClose={() => setHistoryRestaurant(null)} /> : null}
      {restoreRestaurant ? (
        <RestaurantRestoreDialog
          key={restoreRestaurant.restaurantId}
          row={restoreRestaurant}
          onClose={() => setRestoreRestaurant(null)}
          onAccepted={(message) => {
            setRestoreRestaurant(null);
            setToast(message);
            router.refresh();
          }}
        />
      ) : null}
      {toast ? <div className="fixed bottom-5 right-5 z-[60] max-w-sm rounded-lg bg-teal-800 px-4 py-3 text-sm font-semibold text-white shadow-xl" role="status">{toast}</div> : null}
    </section>
  );
}

function TenantBackupSubmitButton() {
  return (
    <PendingSubmitButton className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-slate-300" pendingLabel="Đang tiếp nhận...">
      Sao lưu ngay
    </PendingSubmitButton>
  );
}

function HistoryDialog({ row, onClose }: { row: RestaurantBackupTableRow; onClose: () => void }) {
  return (
    <Modal title={`Lịch sử sao lưu · ${row.restaurantName}`} onClose={onClose}>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto">
        {row.backups.length ? row.backups.map((backup) => (
          <article key={backup.id} className="rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${backup.status === "SUCCESS" ? "bg-teal-50 text-teal-800" : backup.status === "FAILED" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {backupStatusLabel(backup.status)}
              </span>
              <span className="text-slate-500">{formatDateTime(backup.completedAt ?? backup.startedAt ?? backup.queuedAt)}</span>
            </div>
            <p className="mt-2 text-slate-600">{triggerLabel(backup.triggerType)}{backup.status === "SUCCESS" ? ` · ${formatBytes(backup.sizeBytes)}` : ""}</p>
            {backup.errorMessage ? <p className="mt-2 text-amber-700">{backup.errorMessage}</p> : null}
          </article>
        )) : <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">Chưa có lịch sử sao lưu.</p>}
      </div>
    </Modal>
  );
}

function RestaurantRestoreDialog({
  row,
  onClose,
  onAccepted
}: {
  row: RestaurantBackupTableRow;
  onClose: () => void;
  onAccepted: (message: string) => void;
}) {
  const backups = useMemo(() => row.backups.filter((backup) => backup.status === "SUCCESS" && backup.verifiedAt), [row.backups]);
  const [state, action] = useFormState(queueRestaurantRestoreAction, initialRestoreState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "success" || !state.message) return;
    formRef.current?.reset();
    onAccepted(state.message);
  }, [onAccepted, state]);

  return (
    <Modal title={`Khôi phục dữ liệu · ${row.restaurantName}`} onClose={onClose}>
      <p className="text-sm leading-6 text-slate-600">Chỉ dữ liệu nghiệp vụ của cửa hàng này được thay đổi. Các cửa hàng khác không nằm trong tác vụ khôi phục.</p>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Đơn hàng và dữ liệu vận hành của cửa hàng sau thời điểm đã chọn có thể bị thay thế. Hệ thống sẽ chặn thao tác nếu phát hiện giao dịch đã thanh toán mới hơn.</p>
      <form ref={formRef} action={action} className="mt-4 space-y-4">
        <input name="restaurantId" type="hidden" value={row.restaurantId} />
        <label className="block text-sm font-semibold text-slate-700">
          Bản sao lưu
          <select className="mt-2 w-full rounded-md border px-3 py-2" name="backupRunId" required defaultValue={backups[0]?.id}>
            {backups.map((backup) => <option key={backup.id} value={backup.id}>{formatDateTime(backup.completedAt ?? backup.queuedAt)} · {formatBytes(backup.sizeBytes)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Mật khẩu Admin chính
          <input className="mt-2 w-full rounded-md border px-3 py-2" autoComplete="current-password" name="currentPassword" required type="password" />
        </label>
        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm text-slate-700">
          <input className="mt-0.5 h-4 w-4" name="acknowledgeRisk" required type="checkbox" />
          <span>Tôi hiểu dữ liệu mới hơn của riêng cửa hàng này có thể bị thay thế.</span>
        </label>
        {state.status === "error" && state.message ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.message}</p> : null}
        <div className="flex justify-end gap-2">
          <FormCancelButton className="rounded-md border px-4 py-2 text-sm font-semibold" onClick={onClose} />
          <PendingSubmitButton className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300" pendingLabel="Đang xử lý...">
            Xác nhận khôi phục
          </PendingSubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={onClose}>
      <section aria-modal="true" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <button aria-label="Đóng" className="rounded-md p-2 hover:bg-slate-100" type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function backupStatusLabel(status: string) {
  return ({ QUEUED: "Đang chờ", RUNNING: "Đang sao lưu", SUCCESS: "Sao lưu thành công", FAILED: "Chưa thành công" } as Record<string, string>)[status] ?? status;
}

function triggerLabel(trigger: string) {
  return ({ AUTOMATIC: "Tự động", MANUAL: "Thủ công", PRE_RESTORE: "Điểm an toàn trước khôi phục" } as Record<string, string>)[trigger] ?? trigger;
}
