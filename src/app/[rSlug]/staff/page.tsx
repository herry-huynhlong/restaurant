import { EmptyState } from "@/components/ui/empty-state";
import { AppHeader } from "@/components/app-shell/app-header";
import { requireRestaurantAccess } from "@/lib/rbac/guards";

export default async function StaffPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER"]);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader title={`${access.restaurant.name} · Staff`} subtitle={`Role ${access.membership.role}`} />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 md:grid-cols-2">
        <EmptyState title="Đơn mới" description="Chưa có đơn mới." />
        <EmptyState title="Đang chuẩn bị" description="Chưa có món đang chuẩn bị." />
        <EmptyState title="Chờ phục vụ" description="Chưa có món đã xong." />
        <EmptyState title="Yêu cầu khách" description="Chưa có yêu cầu khách." />
      </section>
    </main>
  );
}
