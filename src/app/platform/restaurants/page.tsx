import Link from "next/link";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformRestaurantActions } from "@/components/platform/restaurant-row-actions";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { getBusinessTypeLabel } from "@/lib/business-type";
import { restaurantStatusLabel, subscriptionStatusLabel } from "@/lib/platform/restaurant-status";
import { getPlatformRestaurants } from "@/server/services/platform-service";
import { getPublicPlanPrices } from "@/server/services/subscription-service";
import { confirmSubscriptionRequestAction, rejectSubscriptionRequestAction } from "./actions";

export default async function PlatformRestaurantsPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string; view?: string };
}) {
  await requirePlatformAdmin();
  const showDeleted = searchParams?.view === "deleted";
  const [restaurants, planPrices] = await Promise.all([
    getPlatformRestaurants({ includeDeleted: showDeleted }),
    getPublicPlanPrices()
  ]);
  const priceOptions = planPrices.map((price) => ({
    id: price.id,
    plan: price.plan === "PRO" ? "PRO" as const : "BASIC" as const,
    termMonths: price.termMonths,
    priceVnd: price.priceVnd,
    monthlyPriceVnd: price.monthlyPriceVnd,
    isRecommended: price.isRecommended
  }));

  return (
    <PlatformShell
      title="Nhà hàng"
      action={<Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" href={platformRoutes.newRestaurant}>+ Thêm nhà hàng</Link>}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className={`rounded-md border px-3 py-2 text-sm font-semibold ${!showDeleted ? "bg-teal-700 text-white" : "bg-white hover:bg-slate-50"}`} href={platformRoutes.restaurants}>
          Đang quản lý
        </Link>
        <Link className={`rounded-md border px-3 py-2 text-sm font-semibold ${showDeleted ? "bg-teal-700 text-white" : "bg-white hover:bg-slate-50"}`} href={`${platformRoutes.restaurants}?view=deleted`}>
          Đã xóa
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              {["Cơ sở", "Loại", "Trạng thái", "Gói dịch vụ", "Quy mô", "Thao tác"].map((item) => (
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
                    <p className="mt-1 text-xs text-slate-500">/{restaurant.slug}</p>
                    <p className="mt-1 text-xs text-slate-500">{owner ? `${owner.name} · ${owner.email}` : "Chưa có chủ quán"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{getBusinessTypeLabel(restaurant.businessType)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <p>{restaurantStatusLabel(restaurant.status)}</p>
                    <p className="mt-1 text-xs text-slate-500">{subscriptionStatusLabel(restaurant.subscriptionStatus)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold">{restaurant.plan}</p>
                    <p className="mt-1 text-xs text-slate-500">Hết hạn: {formatDate(restaurant.subscriptionEnd)}</p>
                    {restaurant.subscriptionRequests.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {restaurant.subscriptionRequests.map((request) => (
                          <div key={request.id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            <p className="font-semibold">Chờ xác nhận: {requestTypeLabel(request.requestType)} · {request.plan} · {formatVnd(request.priceVnd)}</p>
                            <p className="mt-1">Kỳ tham chiếu: {request.termMonths} tháng</p>
                            {request.requestType === "UPGRADE" ? (
                              <p className="mt-1">Giữ hạn đến: {formatDate(request.currentSubscriptionEnd)}</p>
                            ) : (
                              <p className="mt-1">Hạn hiện tại: {formatDate(restaurant.subscriptionEnd)}</p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <form action={confirmSubscriptionRequestAction}>
                                <input name="requestId" type="hidden" value={request.id} />
                                <input name="returnTo" type="hidden" value={showDeleted ? `${platformRoutes.restaurants}?view=deleted` : platformRoutes.restaurants} />
                                <button className="rounded bg-teal-700 px-2 py-1 font-semibold text-white" type="submit">Xác nhận</button>
                              </form>
                              <form action={rejectSubscriptionRequestAction}>
                                <input name="requestId" type="hidden" value={request.id} />
                                <input name="returnTo" type="hidden" value={showDeleted ? `${platformRoutes.restaurants}?view=deleted` : platformRoutes.restaurants} />
                                <button className="rounded border border-amber-300 bg-white px-2 py-1 font-semibold" type="submit">Từ chối</button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <p>{restaurant._count.tables} bàn</p>
                    <p className="mt-1 text-xs text-slate-500">{restaurant._count.users} nhân sự</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-md border px-2 py-1 text-sm" href={platformRoutes.restaurantEdit(restaurant.id)}>Sửa</Link>
                      <PlatformRestaurantActions
                        restaurantId={restaurant.id}
                        restaurantName={restaurant.name}
                        restaurantSlug={restaurant.slug}
                        status={restaurant.status}
                        plan={restaurant.plan}
                        businessType={restaurant.businessType}
                        returnTo={platformRoutes.restaurants}
                        priceOptions={priceOptions}
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

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

function requestTypeLabel(type: string) {
  if (type === "UPGRADE") return "Nâng cấp";
  return "Gia hạn";
}
