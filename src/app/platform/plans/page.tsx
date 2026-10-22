import { CheckCircle2, Crown, ShieldCheck } from "lucide-react";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { discountBasisPoints } from "@/lib/plan/pricing";
import { productBrand } from "@/lib/brand";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import {
  basicPlanFeatures,
  commercialPlans,
  planFeatureLabels,
  planFeatureOrder,
  proPlanFeatures,
  type CommercialPlan,
  type PlanFeature
} from "@/lib/plan/features";
import { confirmPlanPermissionsAction, updatePlanPriceAction } from "@/app/platform/plans/actions";
import { getPlanPricingDashboard, planPriceDescription } from "@/server/services/subscription-service";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

const planFeatures: Record<CommercialPlan, PlanFeature[]> = {
  BASIC: basicPlanFeatures,
  PRO: proPlanFeatures
};

const planDescriptions: Record<CommercialPlan, string> = {
  BASIC: "Gói vận hành cơ bản cho QR bàn, menu, gọi món, phục vụ và báo cáo.",
  PRO: "Gói đầy đủ cho quản lý, bếp, thu ngân, thanh toán và báo cáo."
};

const planStyles: Record<CommercialPlan, { badge: string; border: string; icon: React.ReactNode }> = {
  BASIC: {
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    border: "border-slate-200",
    icon: <ShieldCheck className="h-5 w-5" />
  },
  PRO: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    border: "border-amber-200",
    icon: <Crown className="h-5 w-5" />
  }
};

export default async function PlatformPlansPage({
  searchParams
}: {
  searchParams: { success?: string; error?: string };
}) {
  await requirePlatformOwner();
  const groups = groupFeaturesByLabel();
  const pricing = await getPlanPricingDashboard();
  const publishedCount = pricing.prices.filter(price => price.isPublished && price.isActive && price.priceVnd > 0).length;

  return (
    <PlatformShell title="Quản lý gói dịch vụ" subtitle={productBrand.plansSubtitle}>
      <FeedbackBanner success={searchParams.success} error={searchParams.error} />

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Bảng giá dịch vụ</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Giá đăng ký và gia hạn</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Giá được lưu trong hệ thống và dùng làm cơ sở chốt tiền cho các yêu cầu đăng ký mới. Những yêu cầu đã tạo vẫn giữ giá tại thời điểm xác nhận.
            </p>
          </div>
        </div>

        <div className={`mt-4 rounded-xl border p-4 text-sm ${publishedCount ? "border-teal-200 bg-teal-50 text-teal-950" : "border-amber-200 bg-amber-50 text-amber-950"}`} role="status">
          <p className="font-semibold">Đang công bố trên QAVIO: {publishedCount}/{pricing.prices.length} kỳ giá</p>
          <p className="mt-1 leading-6">
            {publishedCount === 0 ? "Website đang hiển thị Liên hệ nhận báo giá vì chưa có kỳ giá được công bố. " : "Website chỉ hiển thị những kỳ giá đang bán và được công bố. "}
            Để hiển thị một kỳ giá, bật Công bố trên QAVIO ở kỳ đó rồi bấm Lưu. Những lần sửa giá đã công bố sẽ tự cập nhật trên QAVIO trong khoảng 35 giây.
          </p>
          <p className="mt-1 leading-6">Giá PRO ở đây là giá đăng ký và gia hạn thông thường; báo giá nâng cấp riêng của từng nhà hàng được xử lý trong tài khoản nhà hàng.</p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {commercialPlans.map((plan) => (
            <article key={plan} className={`rounded-2xl border p-4 ${planStyles[plan].border}`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${planStyles[plan].badge}`}>
                  {planStyles[plan].icon}
                  {plan}
                </div>
                <span className="text-sm text-slate-500">{pricing.prices.filter((price) => price.plan === plan && price.isActive).length} kỳ đang bán</span>
              </div>
              <div className="mt-4 space-y-3">
                {pricing.prices.filter((price) => price.plan === plan).map((price) => (
                  <form
                    key={price.id}
                    action={updatePlanPriceAction}
                    className="rounded-xl border bg-slate-50 p-3"
                  >
                    <input name="priceId" type="hidden" value={price.id} />
                    <div className="grid gap-3 md:grid-cols-[90px_1fr_1fr]">
                      <div>
                        <p className="text-xs font-medium uppercase text-slate-500">Thời hạn</p>
                        <p className="mt-1 text-lg font-semibold">{price.termMonths} tháng</p>
                      </div>
                      <label className="block text-sm font-medium">
                        Giá bán cả kỳ (VND)
                        <input className="mt-1 h-10 w-full rounded-md border bg-white px-3" name="priceVnd" type="number" min={0} step={1} defaultValue={price.priceVnd} />
                      </label>
                      <div>
                        <p className="text-sm font-medium">Bình quân mỗi tháng</p>
                        <p className="mt-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold">{formatVnd(price.monthlyPriceVnd)}/tháng</p>
                      </div>
                    </div>
                    <label className="mt-3 block text-sm font-medium">
                      Giá gốc cả kỳ (VND, chỉ nhập khi có ưu đãi thật)
                      <input className="mt-1 h-10 w-full rounded-md border bg-white px-3" name="originalPriceVnd" type="number" min={1} step={1} defaultValue={price.originalPriceVnd ?? ""} />
                    </label>
                    <p className="mt-2 text-xs text-slate-600">Để trống giá gốc khi không giảm giá. Giá bán cả kỳ là số tiền dùng cho yêu cầu thanh toán mới.</p>
                    <p className="mt-2 text-xs text-slate-600">Ưu đãi: {price.originalPriceVnd ? `${(discountBasisPoints(price.originalPriceVnd, price.priceVnd) / 100).toLocaleString("vi-VN", {maximumFractionDigits: 2})}%` : "Không có"} · Cập nhật: {formatDateTime(price.updatedAt)} · {price.isPublished ? "Đã công bố" : "Chưa công bố"}</p>
                    <label className="mt-3 block text-sm font-medium">
                      Mô tả gói
                      <textarea className="mt-1 min-h-16 w-full rounded-md border bg-white px-3 py-2" name="description" defaultValue={planPriceDescription(price.plan, price.description)} />
                    </label>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-3 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <input name="isActive" type="checkbox" defaultChecked={price.isActive} />
                          Đang bán
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input name="isRecommended" type="checkbox" defaultChecked={price.isRecommended} />
                          Đề xuất
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input name="isPublished" type="checkbox" defaultChecked={price.isPublished} />
                          Công bố trên QAVIO
                        </label>
                      </div>
                      <PendingSubmitButton
                        className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                        pendingLabel="Đang lưu..."
                      >
                        Lưu
                      </PendingSubmitButton>
                    </div>
                  </form>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-xl border bg-slate-50 p-4">
          <h3 className="font-semibold">Lịch sử thay đổi giá</h3>
          {pricing.history.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Chưa có thay đổi giá.</p>
          ) : (
            <div className="mt-3 divide-y">
              {pricing.history.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{item.plan} · {item.termMonths} tháng</p>
                    <p className="mt-1 text-slate-500">{formatDateTime(item.createdAt)} · {item.actorName}</p>
                    <p className="mt-1 text-slate-500">Giá gốc: {item.oldOriginalPriceVnd ? formatVnd(item.oldOriginalPriceVnd) : "Không có"} → {item.newOriginalPriceVnd ? formatVnd(item.newOriginalPriceVnd) : "Không có"} · Công bố: {item.oldIsPublished ? "Bật" : "Tắt"} → {item.newIsPublished ? "Bật" : "Tắt"}</p>
                  </div>
                  <p className="font-medium text-slate-700">
                    {item.oldPriceVnd == null ? "Khởi tạo" : `${formatVnd(item.oldPriceVnd)} → ${formatVnd(item.newPriceVnd)}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Quyền lợi gói dịch vụ</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">So sánh quyền lợi các gói dịch vụ</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Theo dõi và quản lý những tính năng được cung cấp trong từng gói dịch vụ, giúp cửa hàng lựa chọn giải pháp phù hợp với nhu cầu kinh doanh.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {commercialPlans.map((plan) => (
            <PlanSummaryCard key={plan} plan={plan} />
          ))}
        </div>
      </section>

      <form action={confirmPlanPermissionsAction} className="mt-5 rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Quyền theo gói</h2>
            <p className="mt-1 text-sm text-slate-500">Tích xanh là quyền đang được bật cho từng gói.</p>
          </div>
          <PendingSubmitButton className="inline-flex h-11 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800" pendingLabel="Đang xác nhận...">
            Xác nhận đã kiểm tra
          </PendingSubmitButton>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="w-[44%] px-5 py-3 font-semibold">Quyền / chức năng</th>
                <th className="w-[18%] px-5 py-3 text-center font-semibold">BASIC</th>
                <th className="w-[18%] px-5 py-3 text-center font-semibold">PRO</th>
                <th className="px-5 py-3 font-semibold">Nhóm</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((feature) => (
                <tr key={feature.key} className="border-b last:border-b-0">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">{feature.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{feature.description}</p>
                  </td>
                  {commercialPlans.map((plan) => {
                    const checked = planFeatures[plan].includes(feature.key);
                    return (
                      <td key={plan} className="px-5 py-4 text-center">
                        <label className="inline-flex items-center justify-center">
                          <input
                            aria-label={`${plan} - ${feature.title}`}
                            checked={checked}
                            className="h-5 w-5 rounded border-slate-300 text-teal-700"
                            name={`${plan}:${feature.key}`}
                            readOnly
                            type="checkbox"
                          />
                        </label>
                      </td>
                    );
                  })}
                  <td className="px-5 py-4">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {feature.group}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t bg-slate-50 px-5 py-4 text-sm text-slate-600">
          Bảng này hiển thị quyền lợi đang áp dụng cho từng gói. Khi cần thay đổi quyền thực tế, hãy cập nhật cấu hình gói dịch vụ tương ứng.
        </div>
      </form>
    </PlatformShell>
  );
}

function PlanSummaryCard({ plan }: { plan: CommercialPlan }) {
  const style = planStyles[plan];
  const features = planFeatures[plan];

  return (
    <article className={`rounded-2xl border ${style.border} bg-white p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${style.badge}`}>
            {style.icon}
            {plan}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{planDescriptions[plan]}</p>
        </div>
        <p className="text-3xl font-bold text-slate-950">{features.length}</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {features.slice(0, 6).map((feature) => (
          <div key={feature} className="flex items-start gap-2 rounded-xl border bg-slate-50 px-3 py-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
            <span className="text-sm font-medium text-slate-700">{planFeatureLabels[feature].title}</span>
          </div>
        ))}
        {features.length > 6 ? (
          <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
            + {features.length - 6} quyền khác
          </div>
        ) : null}
      </div>
    </article>
  );
}

function groupFeaturesByLabel() {
  return planFeatureOrder.map((key) => ({
    key,
    ...planFeatureLabels[key]
  }));
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
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
