import Link from "next/link";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { DashboardLiveOverview } from "@/components/admin/dashboard-live-overview";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { getRestaurantAdminOverview } from "@/server/services/restaurant-service";

export default async function RestaurantAdminPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const overview = await getRestaurantAdminOverview(access.restaurant.id);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Tổng quan" plan={access.restaurant.plan}>
      <DashboardLiveOverview slug={access.restaurant.slug} initialOverview={overview} />
      <section className="mt-6 rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Quick actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" href={restaurantRoutes.adminMenu(access.restaurant.slug)}>+ Thêm món</Link>
          <Link className="rounded-md border px-4 py-2 text-sm font-semibold" href={restaurantRoutes.adminTables(access.restaurant.slug)}>+ Tạo bàn</Link>
          <Link className="rounded-md border px-4 py-2 text-sm font-semibold" href={restaurantRoutes.adminOrders(access.restaurant.slug)}>Xem đơn mới</Link>
        </div>
      </section>
    </RestaurantAdminShell>
  );
}
