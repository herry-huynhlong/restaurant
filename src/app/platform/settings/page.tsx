import { PlatformShell } from "@/components/app-shell/platform-shell";
import { requirePlatformAdmin } from "@/lib/rbac/guards";

export default async function PlatformSettingsPage() {
  await requirePlatformAdmin();
  return (
    <PlatformShell title="Cài đặt nền tảng">
      <section className="rounded-lg border bg-white p-5 text-sm text-slate-600 shadow-sm">
        Shell cài đặt nền tảng. Các thiết lập global sẽ được thêm khi có requirement cụ thể.
      </section>
    </PlatformShell>
  );
}
