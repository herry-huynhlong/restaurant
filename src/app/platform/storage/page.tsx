import { AlertTriangle, Archive, CalendarClock, CheckCircle2, HardDrive, RefreshCw } from "lucide-react";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { BackupHistoryCard } from "@/components/platform/backup-history-card";
import { ServerResourceMonitor } from "@/components/platform/server-resource-monitor";
import { isPlatformOwnerRole, requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPlatformStorageDashboard } from "@/server/services/platform-storage-service";
import { checkBackupRestoreReadinessAction, queueCleanupAction, queueManualBackupAction, refreshStorageUsageAction, updateStoragePolicyAction } from "./actions";

export default async function PlatformStoragePage({
  searchParams
}: {
  searchParams?: { success?: string; error?: string };
}) {
  const user = await requirePlatformAdmin();
  const dashboard = await getPlatformStorageDashboard();
  const canManageStorage = isPlatformOwnerRole(user.platformRole);

  return (
    <PlatformShell title="Tài nguyên & Sao lưu" subtitle="Quản lý dung lượng lưu trữ và bảo vệ dữ liệu cửa hàng.">
      <FeedbackBanner success={searchParams?.success} error={searchParams?.error} />

      <ServerResourceMonitor />

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<HardDrive className="h-5 w-5" />}
          label="Dung lượng cửa hàng"
          value={formatBytes(dashboard.totals.estimatedBytes)}
          helper={`${dashboard.totals.restaurantCount} nhà hàng đang quản lý`}
        />
        <StatCard
          icon={<Archive className="h-5 w-5" />}
          label="Bản sao lưu"
          value={formatBytes(dashboard.totals.backupBytes)}
          helper="Dung lượng bản sao hiện có"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Lần sao lưu gần nhất"
          value={dashboard.latestSuccessfulBackup ? formatDateTime(dashboard.latestSuccessfulBackup.completedAt ?? dashboard.latestSuccessfulBackup.updatedAt) : "Chưa có"}
          helper={dashboard.latestSuccessfulBackup ? formatBytes(Number(dashboard.latestSuccessfulBackup.sizeBytes)) : "Chưa ghi nhận bản sao lưu"}
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Lịch sao lưu tiếp theo"
          value={dashboard.policy.backupEnabled ? formatDateTime(dashboard.nextBackupAt) : "Đang tắt"}
          helper="Theo múi giờ Việt Nam"
        />
      </section>

      {(dashboard.latestFailedBackup || !dashboard.backupWorker.ready) ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {dashboard.latestFailedBackup ? (
            <WarningCard
              title="Có lần sao lưu chưa thành công"
              message="Hãy kiểm tra lần sao lưu gần nhất và thử lại sau khi xử lý nguyên nhân."
            />
          ) : null}

          {!dashboard.backupWorker.ready ? (
            <WarningCard
              title="Dịch vụ sao lưu chưa sẵn sàng"
              message={dashboard.backupWorker.message}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Dung lượng ước tính</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Dung lượng từng cửa hàng</h2>
            </div>
            {canManageStorage ? (
              <form action={refreshStorageUsageAction}>
                <button className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="submit">
                  <RefreshCw className="h-4 w-4" />
                  Cập nhật dung lượng
                </button>
              </form>
            ) : null}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-600">
                  <th className="w-[28%] px-4 py-3 font-semibold">Cửa hàng</th>
                  <th className="w-[10%] px-4 py-3 font-semibold">Gói</th>
                  <th className="w-[16%] px-4 py-3 text-right font-semibold">Dữ liệu</th>
                  <th className="w-[16%] px-4 py-3 text-right font-semibold">Ảnh tải lên</th>
                  <th className="w-[16%] px-4 py-3 text-right font-semibold">Tổng ước tính</th>
                  <th className="w-[14%] px-4 py-3 font-semibold">Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.restaurantUsages.map((usage) => (
                  <tr key={usage.id} className="border-b last:border-b-0">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{usage.restaurantName}</p>
                      <p className="mt-1 text-xs text-slate-500">/{usage.restaurantSlug}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        {usage.restaurantPlan}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-medium">{formatBytes(usage.dataBytes)}</td>
                    <td className="px-4 py-4 text-right font-medium">{formatBytes(usage.uploadBytes)}</td>
                    <td className="px-4 py-4 text-right text-base font-semibold text-slate-950">{formatBytes(usage.estimatedBytes)}</td>
                    <td className="px-4 py-4 text-slate-500">{formatDateTime(usage.calculatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {canManageStorage ? (
        <section className="mt-5 rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Cấu hình sao lưu và dọn dữ liệu</h2>
            <p className="mt-1 text-sm text-slate-500">Các yêu cầu sao lưu và dọn dữ liệu sẽ được tiếp nhận, xử lý an toàn ở nền.</p>
          </div>

          <form action={updateStoragePolicyAction} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            <label className="flex items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3 text-sm font-medium">
              <input className="h-4 w-4 rounded border-slate-300 text-teal-700" defaultChecked={dashboard.policy.backupEnabled} name="backupEnabled" type="checkbox" />
              Bật sao lưu tự động hằng ngày
            </label>

            <Field label="Giờ sao lưu">
              <input className="w-full rounded-md border px-3 py-2" defaultValue={dashboard.policy.backupTime} name="backupTime" type="time" />
            </Field>

            <Field label="Số bản sao lưu giữ lại">
              <input className="w-full rounded-md border px-3 py-2" defaultValue={dashboard.policy.backupRetentionCount} min={1} max={14} name="backupRetentionCount" type="number" />
            </Field>

            <Field label="Ngày giữ thông báo đã đọc">
              <input className="w-full rounded-md border px-3 py-2" defaultValue={dashboard.policy.notificationRetentionDays} min={1} max={90} name="notificationRetentionDays" type="number" />
            </Field>

            <Field label="Ngày giữ dữ liệu tạm">
              <input className="w-full rounded-md border px-3 py-2" defaultValue={dashboard.policy.temporaryDataRetentionDays} min={7} max={365} name="temporaryDataRetentionDays" type="number" />
            </Field>

            <Field label="Nơi lưu bản sao">
              <select className="w-full rounded-md border px-3 py-2" defaultValue={dashboard.policy.backupStorageKind} name="backupStorageKind">
                <option value="LOCAL">Nơi lưu hiện tại</option>
              </select>
            </Field>

            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-3">
              <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
                Lưu chính sách
              </button>
            </div>
          </form>

          <div className="flex flex-wrap gap-3 border-t bg-slate-50 px-5 py-4">
            <form action={queueManualBackupAction}>
              <button className="rounded-md border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100" type="submit">
                Sao lưu ngay
              </button>
            </form>
            <form action={queueCleanupAction}>
              <button className="rounded-md border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100" type="submit">
                Dọn dữ liệu tạm
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BackupHistoryCard
          canManageRestore={canManageStorage}
          checkRestoreAction={checkBackupRestoreReadinessAction}
          rows={dashboard.backupRuns.map((run) => ({
            id: run.id,
            status: run.status,
            title: backupStatusLabel(run.status),
            meta: `${run.triggerType === "MANUAL" ? "Thủ công" : "Tự động"} · ${formatDateTime(run.completedAt ?? run.startedAt ?? run.queuedAt)}`,
            sizeLabel: run.status === "SUCCESS" ? formatBytes(run.sizeBytes) : null,
            errorMessage: run.status === "FAILED" ? run.errorMessage : null,
            diagnosticMessage: run.diagnosticMessage,
            startedAtLabel: formatDateTime(run.startedAt),
            completedAtLabel: formatDateTime(run.completedAt),
            verifiedAtLabel: formatDateTime(run.verifiedAtLabel),
            restoreReadiness: run.restoreReadiness
          }))}
        />
        <HistoryCard
          title="Lịch sử dọn dữ liệu"
          emptyText="Chưa có lần dọn dữ liệu."
          rows={dashboard.maintenanceRuns.map((run) => ({
            id: run.id,
            title: statusLabel(run.status),
            meta: formatDateTime(run.completedAt ?? run.startedAt ?? run.queuedAt),
            value:
              run.status === "SUCCESS"
                ? `${run.deletedNotifications} thông báo · ${run.deletedDeviceSessions} phiên làm việc`
                : run.errorMessage ?? ""
          }))}
        />
      </div>
    </PlatformShell>
  );
}

function StatCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 text-teal-700">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">{icon}</span>
        <p className="text-sm font-semibold text-slate-600">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </article>
  );
}

function WarningCard({ title, message }: { title: string; message: string }) {
  return (
    <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6">{message}</p>
        </div>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function HistoryCard({
  title,
  emptyText,
  rows
}: {
  title: string;
  emptyText: string;
  rows: Array<{ id: string; title: string; meta: string; value: string }>;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-4 divide-y">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-slate-950">{row.title}</p>
                <p className="mt-1 text-sm text-slate-500">{row.meta}</p>
              </div>
              {row.value ? <p className="text-sm font-medium text-slate-600">{row.value}</p> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(value);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "Đang chờ",
    RUNNING: "Đang xử lý",
    SUCCESS: "Hoàn tất",
    FAILED: "Chưa thành công",
    EXPIRED: "Đã hết hạn lưu"
  };
  return labels[status] ?? status;
}

function backupStatusLabel(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "Đang chờ",
    RUNNING: "Đang sao lưu",
    SUCCESS: "Sao lưu thành công",
    FAILED: "Sao lưu chưa thành công",
    EXPIRED: "Đã hết hạn lưu"
  };
  return labels[status] ?? status;
}
