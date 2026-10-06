import Link from "next/link";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { getPlatformRestaurants } from "@/server/services/platform-service";
import {
  changePlanAction,
  resetOwnerPasswordAction,
  setRestaurantStatusAction
} from "@/app/platform/restaurants/actions";

export default async function PlatformRestaurantsPage() {
  await requirePlatformAdmin();
  const restaurants = await getPlatformRestaurants();

  return (
    <PlatformShell
      title="Nhà hàng"
      action={<Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" href={platformRoutes.newRestaurant}>+ Thêm nhà hàng</Link>}
    >
      <div className="overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              {["Tên nhà hàng", "Slug", "Owner", "Plan", "Trạng thái", "Subscription", "Bắt đầu", "Hết hạn", "Bàn", "Nhân viên", "Order", "Ngày tạo", "Action"].map((item) => (
                <th key={item} className="px-3 py-3 font-medium">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {restaurants.map((restaurant) => {
              const owner = restaurant.users[0]?.user;
              return (
                <tr key={restaurant.id} className="border-t align-top">
                  <td className="px-3 py-3 font-medium">{restaurant.name}</td>
                  <td className="px-3 py-3">{restaurant.slug}</td>
                  <td className="px-3 py-3">{owner ? `${owner.name} · ${owner.email}` : "Chưa có"}</td>
                  <td className="px-3 py-3">{restaurant.plan}</td>
                  <td className="px-3 py-3">{restaurant.status}</td>
                  <td className="px-3 py-3">{restaurant.subscriptionStatus}</td>
                  <td className="px-3 py-3">{formatDate(restaurant.subscriptionStart)}</td>
                  <td className="px-3 py-3">{formatDate(restaurant.subscriptionEnd)}</td>
                  <td className="px-3 py-3">{restaurant._count.tables}</td>
                  <td className="px-3 py-3">{restaurant._count.users}</td>
                  <td className="px-3 py-3">{restaurant._count.orders}</td>
                  <td className="px-3 py-3">{formatDate(restaurant.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-md border px-2 py-1" href={platformRoutes.restaurantDetail(restaurant.id)}>Xem</Link>
                      <Link className="rounded-md border px-2 py-1" href={platformRoutes.restaurantEdit(restaurant.id)}>Sửa</Link>
                      <form action={setRestaurantStatusAction}>
                        <input name="restaurantId" type="hidden" value={restaurant.id} />
                        <input name="status" type="hidden" value="ACTIVE" />
                        <button className="rounded-md border px-2 py-1" type="submit">Kích hoạt</button>
                      </form>
                      <form action={setRestaurantStatusAction}>
                        <input name="restaurantId" type="hidden" value={restaurant.id} />
                        <input name="status" type="hidden" value="SUSPENDED" />
                        <ConfirmSubmitButton
                          className="rounded-md border border-red-200 px-2 py-1 text-red-700"
                          message={`Bạn có chắc muốn tạm khóa ${restaurant.name}?`}
                          description="Khách sẽ không thể gọi món và nhân viên sẽ không thể vận hành đơn hàng."
                        >
                          Tạm khóa
                        </ConfirmSubmitButton>
                      </form>
                      <form className="flex gap-1" action={changePlanAction}>
                        <input name="restaurantId" type="hidden" value={restaurant.id} />
                        <select className="rounded-md border px-1" name="plan" defaultValue={restaurant.plan}>
                          <option value="FREE">FREE</option>
                          <option value="BASIC">BASIC</option>
                          <option value="PRO">PRO</option>
                        </select>
                        <button className="rounded-md border px-2 py-1" type="submit">Đổi gói</button>
                      </form>
                      <form action={resetOwnerPasswordAction}>
                        <input name="restaurantId" type="hidden" value={restaurant.id} />
                        <button className="rounded-md border px-2 py-1" type="submit">Reset owner</button>
                      </form>
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
