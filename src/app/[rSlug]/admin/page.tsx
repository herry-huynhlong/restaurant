import Link from "next/link";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { StatCard } from "@/components/ui/stat-card";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { getRestaurantAdminOverview } from "@/server/services/restaurant-service";

export default async function RestaurantAdminPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const overview = await getRestaurantAdminOverview(access.restaurant.id);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Tổng quan">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Doanh thu hôm nay" value={`${overview.revenueToday.toLocaleString("vi-VN")}đ`} />
        <StatCard label="Order hôm nay" value={overview.ordersToday} />
        <StatCard label="Bàn đang dùng" value={overview.occupiedTables} />
        <StatCard label="Bàn trống" value={overview.availableTables} />
        <StatCard label="Yêu cầu đang chờ" value={overview.pendingRequests} />
        <StatCard label="Top món" value={overview.topProduct ?? "Chưa có"} />
        <StatCard label="Products" value={overview.products} />
        <StatCard label="Staff" value={overview.staff} />
      </section>
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
