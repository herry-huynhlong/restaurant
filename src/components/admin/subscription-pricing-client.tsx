"use client";

import { CheckCircle2, Crown, ShieldCheck } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createRestaurantSubscriptionRequestAction } from "@/app/[rSlug]/admin/subscription/actions";
import type { CommercialPlan, PlanFeature } from "@/lib/plan/features";

type PlanPrice = {
  id: string;
  plan: CommercialPlan;
  termMonths: number;
  priceVnd: number;
  monthlyPriceVnd: number;
  isRecommended: boolean;
  description: string | null;
};

type FeatureItem = {
  key: PlanFeature;
  title: string;
};

type PendingRequest = {
  plan: CommercialPlan;
  termMonths: number;
};

type SubscriptionPricingClientProps = {
  slug: string;
  currentPlan: CommercialPlan;
  currentExpired: boolean;
  prices: PlanPrice[];
  features: Record<CommercialPlan, FeatureItem[]>;
  descriptions: Record<CommercialPlan, string>;
  pendingRequests: PendingRequest[];
};

const terms = [3, 6, 12] as const;

export function SubscriptionPricingClient({
  slug,
  currentPlan,
  currentExpired,
  prices,
  features,
  descriptions,
  pendingRequests
}: SubscriptionPricingClientProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedTerm, setSelectedTerm] = useState<(typeof terms)[number]>(12);
  const [selectedPrice, setSelectedPrice] = useState<PlanPrice | null>(null);
  const action = createRestaurantSubscriptionRequestAction.bind(null, slug);

  const pricesByPlan = useMemo(() => {
    return new Map(prices.map((price) => [`${price.plan}:${price.termMonths}`, price]));
  }, [prices]);

  function openConfirm(price: PlanPrice) {
    setSelectedPrice(price);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <section className="mt-5">
        <div className="flex flex-col gap-4 rounded-3xl border border-teal-100 bg-gradient-to-br from-white via-teal-50/60 to-white p-5 shadow-sm md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Bảng giá QuánPilot</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">
              Chọn gói dịch vụ phù hợp với cửa hàng
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Lựa chọn giải pháp quản lý phù hợp để vận hành cửa hàng hiệu quả hơn.
            </p>
          </div>
          <div className="inline-flex rounded-full border bg-white p-1 shadow-sm">
            {terms.map((term) => (
              <button
                key={term}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition ${selectedTerm === term ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                type="button"
                onClick={() => setSelectedTerm(term)}
              >
                {term} tháng
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-2">
          {(["BASIC", "PRO"] as CommercialPlan[]).map((plan) => {
            const price = pricesByPlan.get(`${plan}:${selectedTerm}`);
            const isCurrentPlan = currentPlan === plan && !currentExpired;
            const pending = pendingRequests.some((request) => request.plan === plan && request.termMonths === selectedTerm);
            const isPro = plan === "PRO";

            return (
              <article
                key={plan}
                className={`flex min-h-full flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isPro ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${isPro ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-200 bg-teal-50 text-teal-700"}`}>
                      {isPro ? <Crown className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      {plan}
                    </div>
                    {isPro ? <span className="ml-2 rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">Gói nâng cao</span> : null}
                  </div>
                  {isCurrentPlan ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Gói hiện tại</span>
                  ) : null}
                </div>

                <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600">{descriptions[plan]}</p>

                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  {price ? (
                    <>
                      <p className="text-sm font-medium text-slate-500">Bình quân mỗi tháng</p>
                      <p className="mt-1 text-4xl font-bold tracking-normal text-slate-950">{formatVnd(price.monthlyPriceVnd)}</p>
                      <p className="mt-2 text-sm text-slate-600">Tổng thanh toán: <span className="font-semibold text-slate-900">{formatVnd(price.priceVnd)}</span></p>
                      {price.isRecommended ? <p className="mt-2 text-xs font-semibold text-teal-700">Được đề xuất cho kỳ {selectedTerm} tháng</p> : null}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">Kỳ này hiện chưa mở bán.</p>
                  )}
                </div>

                <div className="mt-5 flex-1 space-y-2">
                  {features[plan].map((feature) => (
                    <div key={feature.key} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                      <span>{feature.title}</span>
                    </div>
                  ))}
                </div>

                <button
                  className={`mt-6 h-12 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isPro ? "bg-teal-700 text-white hover:bg-teal-800" : "border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"}`}
                  type="button"
                  disabled={!price || pending}
                  onClick={() => price && openConfirm(price)}
                >
                  {pending ? "Đang chờ xác nhận" : isCurrentPlan ? "Gia hạn" : "Đăng ký"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <dialog ref={dialogRef} className="w-full max-w-md rounded-2xl border bg-white p-0 shadow-2xl backdrop:bg-black/40">
        {selectedPrice ? (
          <form className="p-5" action={action}>
            <input name="plan" type="hidden" value={selectedPrice.plan} />
            <input name="termMonths" type="hidden" value={selectedPrice.termMonths} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Xác nhận yêu cầu</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">
                {currentPlan === selectedPrice.plan && !currentExpired ? "Gia hạn gói" : "Đăng ký gói"} {selectedPrice.plan}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Yêu cầu sẽ được gửi tới QuánPilot Admin để kiểm tra và xác nhận.
              </p>
            </div>
            <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Thời hạn</dt>
                <dd className="font-semibold">{selectedPrice.termMonths} tháng</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Tổng tiền</dt>
                <dd className="font-semibold">{formatVnd(selectedPrice.priceVnd)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Bình quân</dt>
                <dd className="font-semibold">{formatVnd(selectedPrice.monthlyPriceVnd)}/tháng</dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-md border px-4 py-2 text-sm font-semibold" type="button" onClick={() => dialogRef.current?.close()}>
                Hủy
              </button>
              <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
                Gửi yêu cầu đăng ký
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </>
  );
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}
