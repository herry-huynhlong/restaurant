import { CheckCircle2, Crown, ShieldCheck } from "lucide-react";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRecentNotifications } from "@/server/services/notification-service";
import { daysRemaining, getPublicPlanPrices, getRestaurantSubscriptionSummary, planPriceDescription } from "@/server/services/subscription-service";
import { basicPlanFeatures, planFeatureLabels, proPlanFeatures, type CommercialPlan } from "@/lib/plan/features";
import { createRestaurantSubscriptionRequestAction } from "./actions";

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

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Gói đang sử dụng</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{restaurant.plan === "PRO" ? "PRO" : "BASIC"}</h2>
            <p className="mt-2 text-sm text-slate-600">{subscriptionStatusText(restaurant.subscriptionStatus, remainingDays)}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${restaurant.plan === "PRO" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
            {restaurant.plan === "PRO" ? "PRO" : "BASIC"}
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <InfoTile label="Ngày bắt đầu" value={formatDate(restaurant.subscriptionStart)} />
          <InfoTile label="Ngày hết hạn" value={formatDate(restaurant.subscriptionEnd)} />
          <InfoTile label="Số ngày còn lại" value={remainingDays == null ? "Chưa có" : remainingDays > 0 ? `${remainingDays} ngày` : "Đã hết hạn"} />
          <InfoTile label="Yêu cầu đang chờ" value={`${summary.pendingRequests.length}`} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <InfoTile label="Kỳ thanh toán đã xác nhận" value={summary.currentRequest ? `${summary.currentRequest.termMonths} tháng` : "Chưa có"} />
          <InfoTile label="Giá đã xác nhận" value={summary.currentRequest ? formatVnd(summary.currentRequest.priceVnd) : "Chưa có"} />
        </div>
      </section>

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

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        {(["BASIC", "PRO"] as CommercialPlan[]).map((plan) => {
          const planPrices = prices.filter((price) => price.plan === plan);
          return (
            <article key={plan} className={`rounded-2xl border bg-white p-5 shadow-sm ${plan === "PRO" ? "border-amber-200" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${plan === "PRO" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                    {plan === "PRO" ? <Crown className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    {plan}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{planPriceDescription(plan, planPrices[0]?.description)}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {planFeatures[plan].slice(0, 8).map((feature) => (
                  <div key={feature} className="flex gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <span>{planFeatureLabels[feature].title}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-3">
                {planPrices.map((price) => {
                  const currentPlan = restaurant.plan === plan;
                  return (
                    <form key={price.id} action={createRestaurantSubscriptionRequestAction.bind(null, access.restaurant.slug)} className="rounded-xl border bg-slate-50 p-3">
                      <input name="plan" type="hidden" value={plan} />
                      <input name="termMonths" type="hidden" value={price.termMonths} />
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{price.termMonths} tháng {price.isRecommended ? <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-800">Đề xuất</span> : null}</p>
                          <p className="mt-1 text-sm text-slate-600">{formatVnd(price.monthlyPriceVnd)}/tháng · Tổng {formatVnd(price.priceVnd)}</p>
                        </div>
                        <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
                          {currentPlan ? "Gia hạn" : "Đăng ký"}
                        </button>
                      </div>
                    </form>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </RestaurantAdminShell>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-950">{value}</p>
    </div>
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
