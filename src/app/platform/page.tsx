import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPlatformOverview } from "@/server/services/platform-service";
import { AppHeader } from "@/components/app-shell/app-header";
import { StatCard } from "@/components/ui/stat-card";

export default async function PlatformPage() {
  await requirePlatformAdmin();
  const overview = await getPlatformOverview();

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader title="Platform Admin" subtitle="Quản lý các nhà hàng tenant" />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng nhà hàng" value={overview.totalRestaurants} />
        <StatCard label="Active" value={overview.activeRestaurants} />
        <StatCard label="Inactive" value={overview.inactiveRestaurants} />
        <StatCard label="Tổng order" value={overview.totalOrders} />
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-10">
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-medium">Tên</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Bàn</th>
                <th className="px-4 py-3 font-medium">Nhân viên</th>
                <th className="px-4 py-3 font-medium">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {overview.restaurants.map((restaurant) => (
                <tr key={restaurant.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{restaurant.name}</td>
                  <td className="px-4 py-3">{restaurant.slug}</td>
                  <td className="px-4 py-3">{restaurant.plan}</td>
                  <td className="px-4 py-3">{restaurant.status}</td>
                  <td className="px-4 py-3">{restaurant._count.tables}</td>
                  <td className="px-4 py-3">{restaurant._count.users}</td>
                  <td className="px-4 py-3">
                    {new Intl.DateTimeFormat("vi-VN").format(restaurant.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
