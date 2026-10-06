import { AppHeader } from "@/components/app-shell/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRestaurantAccess } from "@/lib/rbac/guards";

export default async function CashierPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader title={`${access.restaurant.name} · Cashier`} subtitle={`Role ${access.membership.role}`} />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 md:grid-cols-3">
        <EmptyState title="Bàn đang có khách" description="Chưa có dining session đang mở." />
        <EmptyState title="Bàn yêu cầu thanh toán" description="Chưa có yêu cầu thanh toán." />
        <EmptyState title="Bill hiện tại" description="Chọn bàn để xem bill khi có dữ liệu." />
      </section>
    </main>
  );
}
