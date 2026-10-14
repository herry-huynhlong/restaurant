import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { SubscriptionPricingClient } from "@/components/admin/subscription-pricing-client";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRecentNotifications } from "@/server/services/notification-service";
import { daysRemaining, getPublicPlanPrices, getRestaurantSubscriptionSummary, planPriceDescription } from "@/server/services/subscription-service";
import { basicPlanFeatures, planFeatureLabels, proPlanFeatures, type CommercialPlan } from "@/lib/plan/features";

const planFeatures: Record<CommercialPlan, typeof basicPlanFeatures> = {
  BASIC: basicPlanFeatures,
  PRO: proPlanFeatures
};

export default async function AdminSubscriptionPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [notifications, prices, summary] = await Promise.all([
    getRecentNotifications(access.restaurant.id, access.user.id),
    getPublicPlanPrices(),
    getRestaurantSubscriptionSummary(access.restaurant.id)
  ]);
  const restaurant = summary.restaurant;
  if (!restaurant) return null;
  const remainingDays = daysRemaining(restaurant.subscriptionEnd);
  const currentExpired = remainingDays != null && remainingDays <= 0;
  const currentPlan = restaurant.plan === "PRO" ? "PRO" : "BASIC";
  const featureItems = {
    BASIC: planFeatures.BASIC.map((feature) => ({ key: feature, title: planFeatureLabels[feature].title })),
    PRO: planFeatures.PRO.map((feature) => ({ key: feature, title: planFeatureLabels[feature].title }))
  };
  const descriptions = {
    BASIC: planPriceDescription("BASIC", prices.find((price) => price.plan === "BASIC")?.description),
    PRO: planPriceDescription("PRO", prices.find((price) => price.plan === "PRO")?.description)
  };

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Đăng ký gói"
      userName={access.user.name}
      notifications={notifications}
      plan={access.restaurant.plan}
      businessType={access.restaurant.businessType}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Gói đang sử dụng</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-950">Gói hiện tại: {currentPlan}</h2>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${currentPlan === "PRO" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-200 bg-teal-50 text-teal-700"}`}>
                {subscriptionStatusText(restaurant.subscriptionStatus, remainingDays)}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Hết hạn: <span className="font-semibold text-slate-900">{formatDate(restaurant.subscriptionEnd)}</span>
              <span className="mx-2 text-slate-300">•</span>
              Còn lại: <span className="font-semibold text-slate-900">{remainingDays == null ? "Chưa cập nhật" : remainingDays > 0 ? `${remainingDays} ngày` : "Đã hết hạn"}</span>
            </p>
          </div>
          <details className="rounded-xl border bg-slate-50 px-3 py-2 text-sm md:min-w-72">
            <summary className="cursor-pointer font-semibold text-slate-800">Chi tiết gói hiện tại</summary>
            <div className="mt-3 grid gap-2 text-slate-600">
              <p>Ngày kích hoạt: <span className="font-medium text-slate-900">{formatDate(restaurant.subscriptionStart)}</span></p>
              <p>Kỳ thanh toán đã xác nhận: <span className="font-medium text-slate-900">{summary.currentRequest ? `${summary.currentRequest.termMonths} tháng` : "Chưa có"}</span></p>
              <p>Giá đã xác nhận: <span className="font-medium text-slate-900">{summary.currentRequest ? formatVnd(summary.currentRequest.priceVnd) : "Chưa có"}</span></p>
            </div>
          </details>
        </div>
      </section>

      {remainingDays != null && remainingDays > 0 && remainingDays <= 14 ? (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Gói dịch vụ còn {remainingDays} ngày. Bạn có thể chọn kỳ phù hợp bên dưới và gửi yêu cầu gia hạn ngay.
        </section>
      ) : null}

      {summary.pendingRequests.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <h2 className="text-lg font-semibold">Yêu cầu đang chờ xác nhận</h2>
          <div className="mt-3 space-y-2">
            {summary.pendingRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-amber-200 bg-white/70 p-3 text-sm">
                <p className="font-semibold">{request.plan} · {request.termMonths} tháng · {formatVnd(request.priceVnd)}</p>
                <p className="mt-1">Đã gửi lúc {formatDateTime(request.createdAt)}. Gói chỉ được kích hoạt sau khi QuánPilot Admin xác nhận thanh toán.</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <SubscriptionPricingClient
        slug={access.restaurant.slug}
        currentPlan={currentPlan}
        currentExpired={currentExpired}
        prices={prices.map((price) => ({
          id: price.id,
          plan: price.plan === "PRO" ? "PRO" : "BASIC",
          termMonths: price.termMonths,
          priceVnd: price.priceVnd,
          monthlyPriceVnd: price.monthlyPriceVnd,
          isRecommended: price.isRecommended,
          description: price.description
        }))}
        features={featureItems}
        descriptions={descriptions}
        pendingRequests={summary.pendingRequests.map((request) => ({
          plan: request.plan === "PRO" ? "PRO" : "BASIC",
          termMonths: request.termMonths
        }))}
      />
    </RestaurantAdminShell>
  );
}

function subscriptionStatusText(status: string, remainingDays: number | null) {
  if (status === "SUSPENDED") return "Tạm ngưng";
  if (remainingDays != null && remainingDays <= 0) return "Đã hết hạn";
  if (remainingDays != null && remainingDays <= 14) return "Sắp hết hạn";
  return "Đang hoạt động";
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(value);
}
