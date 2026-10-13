import { CheckCircle2, ClipboardCheck, Crown, ShieldCheck } from "lucide-react";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import {
  basicPlanFeatures,
  commercialPlans,
  planFeatureLabels,
  planFeatureOrder,
  proPlanFeatures,
  type CommercialPlan,
  type PlanFeature
} from "@/lib/plan/features";
import { confirmPlanPermissionsAction } from "@/app/platform/plans/actions";

const planFeatures: Record<CommercialPlan, PlanFeature[]> = {
  BASIC: basicPlanFeatures,
  PRO: proPlanFeatures
};

const planDescriptions: Record<CommercialPlan, string> = {
  BASIC: "Gói vận hành cơ bản cho QR bàn, menu, gọi món, phục vụ và báo cáo.",
  PRO: "Gói đầy đủ cho quản lý, bếp, thu ngân, thanh toán và báo cáo nâng cao."
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
  await requirePlatformAdmin();
  const groups = groupFeaturesByLabel();

  return (
    <PlatformShell title="Gói dịch vụ">
      <FeedbackBanner success={searchParams.success} error={searchParams.error} />

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Ma trận quyền</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">BASIC và PRO đang mở quyền gì?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Các checkbox bên dưới phản ánh trực tiếp feature gating hiện tại trong hệ thống. Đây là màn hình đối soát nhanh cho Platform Admin trước khi đổi gói cho nhà hàng.
            </p>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            <div className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-4 w-4" />
              Source of truth
            </div>
            <p className="mt-1 text-teal-800">src/lib/plan/features.ts</p>
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
          <button className="inline-flex h-11 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
            Lưu xác nhận
          </button>
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
          Lưu xác nhận sẽ ghi audit log cho cấu hình quyền hiện tại. Nếu cần cho phép tự chỉnh quyền runtime theo từng gói, bước tiếp theo nên thêm bảng cấu hình quyền trong database để backend đọc từ DB thay vì hardcode.
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
