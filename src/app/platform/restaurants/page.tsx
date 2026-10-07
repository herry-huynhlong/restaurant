import Link from "next/link";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformRestaurantActions } from "@/components/platform/restaurant-row-actions";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { restaurantStatusLabel, subscriptionStatusLabel } from "@/lib/platform/restaurant-status";
import { getPlatformRestaurants } from "@/server/services/platform-service";

export default async function PlatformRestaurantsPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string };
}) {
  await requirePlatformAdmin();
  const restaurants = await getPlatformRestaurants();

  return (
    <PlatformShell
      title="Nhà hàng"
      action={<Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" href={platformRoutes.newRestaurant}>+ Thêm nhà hàng</Link>}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <div className="overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              {["Nhà hàng", "Slug", "Trạng thái", "Gói", "Bắt đầu", "Hết hạn", "Bàn", "Nhân viên", "Ngày tạo", "Thao tác"].map((item) => (
                <th key={item} className="px-3 py-3 font-medium">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {restaurants.map((restaurant) => {
              const owner = restaurant.users[0]?.user;
              return (
                <tr key={restaurant.id} className="border-t align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{restaurant.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{owner ? `${owner.name} · ${owner.email}` : "Chưa có admin"}</p>
                  </td>
                  <td className="px-3 py-3">{restaurant.slug}</td>
                  <td className="px-3 py-3">
                    <p>{restaurantStatusLabel(restaurant.status)}</p>
                    <p className="mt-1 text-xs text-slate-500">{subscriptionStatusLabel(restaurant.subscriptionStatus)}</p>
                  </td>
                  <td className="px-3 py-3">{restaurant.plan}</td>
                  <td className="px-3 py-3">{formatDate(restaurant.subscriptionStart)}</td>
                  <td className="px-3 py-3">{formatDate(restaurant.subscriptionEnd)}</td>
                  <td className="px-3 py-3">{restaurant._count.tables}</td>
                  <td className="px-3 py-3">{restaurant._count.users}</td>
                  <td className="px-3 py-3">{formatDate(restaurant.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-md border px-2 py-1 text-sm" href={platformRoutes.restaurantEdit(restaurant.id)}>Sửa</Link>
                      <PlatformRestaurantActions
                        restaurantId={restaurant.id}
                        restaurantName={restaurant.name}
                        status={restaurant.status}
                        plan={restaurant.plan}
                        returnTo={platformRoutes.restaurants}
                        compact
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PlatformShell>
  );
}

function formatDate(date: Date | null) {
  return date ? new Intl.DateTimeFormat("vi-VN").format(date) : "-";
}
