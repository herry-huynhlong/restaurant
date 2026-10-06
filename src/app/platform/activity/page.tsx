import { PlatformShell } from "@/components/app-shell/platform-shell";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPlatformAuditLogs } from "@/server/services/platform-service";

export default async function PlatformActivityPage() {
  await requirePlatformAdmin();
  const logs = await getPlatformAuditLogs();
  return (
    <PlatformShell title="Hoạt động hệ thống">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="space-y-2">
          {logs.map((log) => (
            <p key={log.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              {log.action} · {log.restaurant?.name ?? "Platform"} · {log.user?.email ?? "system"}
            </p>
          ))}
        </div>
      </section>
    </PlatformShell>
  );
}
