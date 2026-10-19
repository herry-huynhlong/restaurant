import Link from "next/link";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformRestaurantActions } from "@/components/platform/restaurant-row-actions";
import { SubscriptionRequestsDialog } from "@/components/platform/subscription-requests-dialog";
import { isPlatformOwnerRole, requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { getBusinessTypeLabel } from "@/lib/business-type";
import { restaurantStatusLabel, subscriptionStatusLabel } from "@/lib/platform/restaurant-status";
import { planDisplayLabel } from "@/lib/plan/features";
import { getPlatformRestaurants } from "@/server/services/platform-service";
import { getPublicPlanPrices } from "@/server/services/subscription-service";

export default async function PlatformRestaurantsPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string; view?: string };
}) {
  const user = await requirePlatformAdmin();
  const canManageSensitive = isPlatformOwnerRole(user.platformRole);
  const showDeleted = canManageSensitive && searchParams?.view === "deleted";
  const showPending = canManageSensitive && searchParams?.view === "pending";
  const [restaurants, planPrices] = await Promise.all([
    getPlatformRestaurants({ includeDeleted: showDeleted }),
    getPublicPlanPrices()
  ]);
  const visibleRestaurants = showPending
    ? restaurants.filter((restaurant) => restaurant.subscriptionRequests.length > 0)
    : restaurants;
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
        <Link className={`rounded-md border px-3 py-2 text-sm font-semibold ${!showDeleted && !showPending ? "bg-teal-700 text-white" : "bg-white hover:bg-slate-50"}`} href={platformRoutes.restaurants}>
          Đang quản lý
        </Link>
        {canManageSensitive ? (
          <>
            <Link className={`rounded-md border px-3 py-2 text-sm font-semibold ${showPending ? "bg-teal-700 text-white" : "bg-white hover:bg-slate-50"}`} href={`${platformRoutes.restaurants}?view=pending`}>
              Chờ xác nhận
            </Link>
            <Link className={`rounded-md border px-3 py-2 text-sm font-semibold ${showDeleted ? "bg-teal-700 text-white" : "bg-white hover:bg-slate-50"}`} href={`${platformRoutes.restaurants}?view=deleted`}>
              Đã xóa
            </Link>
          </>
        ) : null}
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
            {visibleRestaurants.map((restaurant) => {
              const owner = restaurant.users[0]?.user;
              const returnTo = showDeleted ? `${platformRoutes.restaurants}?view=deleted` : showPending ? `${platformRoutes.restaurants}?view=pending` : platformRoutes.restaurants;
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
                    <p className="font-semibold">
                      {planDisplayLabel(restaurant.plan, restaurant.planEntitlement)}
                      {restaurant.subscriptionRequests.length > 0 ? ` — ${restaurant.subscriptionRequests.length} yêu cầu chờ` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Hết hạn: {formatDate(restaurant.subscriptionEnd)}</p>
                    {canManageSensitive ? (
                      <SubscriptionRequestsDialog
                        restaurantName={restaurant.name}
                        restaurantPlan={restaurant.plan}
                        subscriptionEnd={restaurant.subscriptionEnd?.toISOString() ?? null}
                        returnTo={returnTo}
                        requests={restaurant.subscriptionRequests.map((request) => ({
                          id: request.id,
                          requestType: request.requestType,
                          plan: request.plan,
                          termMonths: request.termMonths,
                          priceVnd: request.priceVnd,
                          status: request.status,
                          createdAt: request.createdAt.toISOString(),
                          currentSubscriptionEnd: request.currentSubscriptionEnd?.toISOString() ?? null,
                          paymentOrder: request.paymentOrders[0]
                            ? {
                                provider: request.paymentOrders[0].provider,
                                status: request.paymentOrders[0].status,
                                amountVnd: request.paymentOrders[0].amountVnd,
                                paidAt: request.paymentOrders[0].paidAt?.toISOString() ?? null
                              }
                            : null
                        }))}
                      />
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
                        planEntitlement={restaurant.planEntitlement}
                        businessType={restaurant.businessType}
                        returnTo={returnTo}
                        priceOptions={priceOptions}
                        showStatusAction={canManageSensitive}
                        showPlanAction={canManageSensitive}
                        showResetPasswordAction={canManageSensitive}
                        showDeleteAction={canManageSensitive}
                        compact
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleRestaurants.length === 0 ? (
          <div className="border-t px-4 py-8 text-center text-sm text-slate-500">
            {showPending ? "Không có yêu cầu chờ xác nhận." : "Chưa có nhà hàng để hiển thị."}
          </div>
        ) : null}
      </div>
    </PlatformShell>
  );
}

function formatDate(date: Date | null) {
  return date ? new Intl.DateTimeFormat("vi-VN").format(date) : "-";
}
