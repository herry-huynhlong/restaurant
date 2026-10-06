import { AppHeader } from "@/components/app-shell/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRestaurantAccess } from "@/lib/rbac/guards";

export default async function KitchenPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "KITCHEN"]);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader title={`${access.restaurant.name} · Kitchen`} subtitle={`Role ${access.membership.role}`} />
      <section className="mx-auto w-full max-w-6xl px-4 py-6">
        <EmptyState title="Chưa có món đang chờ" description="Sau này realtime order sẽ hiển thị tại đây." />
      </section>
    </main>
  );
}
