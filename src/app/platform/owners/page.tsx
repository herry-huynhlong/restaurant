import { PlatformShell } from "@/components/app-shell/platform-shell";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPlatformOwners } from "@/server/services/platform-service";

export default async function PlatformOwnersPage() {
  await requirePlatformAdmin();
  const owners = await getPlatformOwners();
  return (
    <PlatformShell title="Tài khoản chủ quán">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="space-y-2">
          {owners.map((owner) => (
            <p key={owner.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              {owner.user.name} · {owner.user.email} · {owner.restaurant.name}
            </p>
          ))}
        </div>
      </section>
    </PlatformShell>
  );
}
