"use client";

import { CheckCircle2, Crown, ShieldCheck, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRestaurantSubscriptionRequestAction } from "@/app/[rSlug]/admin/subscription/actions";
import { FormCancelButton, PendingSubmitButton } from "@/components/ui/pending-submit-button";
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
  BASIC: boolean;
  PRO: boolean;
};

type PendingRequest = {
  plan: CommercialPlan;
  termMonths: number;
  requestType: "RENEWAL" | "UPGRADE";
};

type SubscriptionPricingClientProps = {
  slug: string;
  currentPlan: CommercialPlan;
  currentExpired: boolean;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  currentTerm: number | null;
  prices: PlanPrice[];
  features: FeatureItem[];
  pendingRequests: PendingRequest[];
};

const terms = [3, 6, 12] as const;

export function SubscriptionPricingClient({
  slug,
  currentPlan,
  currentExpired,
  subscriptionStart,
  subscriptionEnd,
  currentTerm,
  prices,
  features,
  pendingRequests
}: SubscriptionPricingClientProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchParams = useSearchParams();
  const [selectedTerm, setSelectedTerm] = useState<(typeof terms)[number]>(12);
  const [selectedPrice, setSelectedPrice] = useState<PlanPrice | null>(null);
  const [selectedRequestType, setSelectedRequestType] = useState<"RENEWAL" | "UPGRADE">("RENEWAL");
  const action = createRestaurantSubscriptionRequestAction.bind(null, slug);

  useEffect(() => {
    if (!searchParams.get("success")) return;
    dialogRef.current?.close();
    setSelectedPrice(null);
  }, [searchParams]);

  const pricesByPlan = useMemo(() => {
    return new Map(prices.map((price) => [`${price.plan}:${price.termMonths}`, price]));
  }, [prices]);

  function openConfirm(price: PlanPrice, requestType: "RENEWAL" | "UPGRADE") {
    setSelectedPrice(price);
    setSelectedRequestType(requestType);
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
            const isUpgrade = currentPlan === "BASIC" && plan === "PRO" && !currentExpired && Boolean(subscriptionStart && subscriptionEnd);
            const effectiveTerm = isUpgrade && currentTerm ? currentTerm : selectedTerm;
            const effectivePrice = isUpgrade ? pricesByPlan.get(`PRO:${effectiveTerm}`) : price;
            const currentBasicPrice = isUpgrade ? pricesByPlan.get(`BASIC:${effectiveTerm}`) : null;
            const upgradeQuote = isUpgrade && effectivePrice && currentBasicPrice && subscriptionStart && subscriptionEnd
              ? calculateUpgradeQuote(currentBasicPrice.priceVnd, effectivePrice.priceVnd, subscriptionStart, subscriptionEnd)
              : null;
            const pending = pendingRequests.some((request) => {
              if (isUpgrade) return request.requestType === "UPGRADE";
              return request.plan === plan && request.termMonths === selectedTerm && request.requestType !== "UPGRADE";
            });
            const isPro = plan === "PRO";
            const ctaLabel = pending ? "Đang chờ xác nhận" : isUpgrade ? "Nâng cấp lên PRO" : isCurrentPlan ? "Gia hạn" : "Đăng ký";

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

                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  {isUpgrade && upgradeQuote ? (
                    <>
                      <p className="text-sm font-medium text-slate-500">Phí nâng cấp dự kiến</p>
                      <p className="mt-1 text-4xl font-bold tracking-normal text-slate-950">{formatVnd(upgradeQuote.amount)}</p>
                      <p className="mt-2 text-sm text-slate-600">Giữ nguyên hạn dùng: <span className="font-semibold text-slate-900">{formatDate(subscriptionEnd)}</span></p>
                      <p className="mt-2 text-xs font-semibold text-teal-700">Còn khoảng {upgradeQuote.remainingDays} ngày sử dụng</p>
                    </>
                  ) : price ? (
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
                  {features.map((feature) => {
                    const enabled = feature[plan];
                    return (
                    <div key={feature.key} className={`flex items-start gap-2 text-sm ${enabled ? "text-slate-800" : "text-slate-400"}`}>
                      {enabled ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                      <span>{feature.title}</span>
                    </div>
                    );
                  })}
                </div>

                <button
                  className={`mt-6 h-12 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isPro ? "bg-teal-700 text-white hover:bg-teal-800" : "border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"}`}
                  type="button"
                  disabled={!(isUpgrade ? effectivePrice : price) || pending}
                  onClick={() => (isUpgrade ? effectivePrice : price) && openConfirm((isUpgrade ? effectivePrice : price)!, isUpgrade ? "UPGRADE" : "RENEWAL")}
                >
                  {ctaLabel}
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
            <input name="termMonths" type="hidden" value={selectedRequestType === "UPGRADE" && currentTerm ? currentTerm : selectedPrice.termMonths} />
            <input name="requestType" type="hidden" value={selectedRequestType} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Xác nhận yêu cầu</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">
                {selectedRequestType === "UPGRADE" ? "Nâng cấp lên PRO" : currentPlan === selectedPrice.plan && !currentExpired ? `Gia hạn gói ${selectedPrice.plan}` : `Đăng ký gói ${selectedPrice.plan}`}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Yêu cầu sẽ được gửi tới QuánPilot Admin để kiểm tra và xác nhận.
              </p>
            </div>
            <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              {selectedRequestType === "UPGRADE" ? (
                <UpgradeModalRows
                  basicPrice={pricesByPlan.get(`BASIC:${currentTerm ?? selectedPrice.termMonths}`)}
                  proPrice={pricesByPlan.get(`PRO:${currentTerm ?? selectedPrice.termMonths}`)}
                  subscriptionStart={subscriptionStart}
                  subscriptionEnd={subscriptionEnd}
                />
              ) : (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Kỳ gia hạn</dt>
                    <dd className="font-semibold">{selectedPrice.termMonths} tháng</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Tổng tiền</dt>
                    <dd className="font-semibold">{formatVnd(selectedPrice.priceVnd)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Ngày hết hạn dự kiến</dt>
                    <dd className="font-semibold">{formatProjectedEnd(subscriptionEnd, selectedPrice.termMonths)}</dd>
                  </div>
                </>
              )}
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <FormCancelButton className="rounded-md border px-4 py-2 text-sm font-semibold" onClick={() => {
                dialogRef.current?.close();
                setSelectedPrice(null);
              }} />
              <PendingSubmitButton className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:bg-slate-400" pendingLabel="Đang gửi...">
                Gửi yêu cầu
              </PendingSubmitButton>
            </div>
          </form>
        ) : null}
      </dialog>
    </>
  );
}

function UpgradeModalRows({
  basicPrice,
  proPrice,
  subscriptionStart,
  subscriptionEnd
}: {
  basicPrice?: PlanPrice;
  proPrice?: PlanPrice;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
}) {
  const quote = basicPrice && proPrice && subscriptionStart && subscriptionEnd
    ? calculateUpgradeQuote(basicPrice.priceVnd, proPrice.priceVnd, subscriptionStart, subscriptionEnd)
    : null;
  return (
    <>
      <div className="flex justify-between gap-3">
        <dt className="text-slate-500">Gói hiện tại</dt>
        <dd className="font-semibold">BASIC</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-slate-500">Gói sau khi xác nhận</dt>
        <dd className="font-semibold">PRO</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-slate-500">Thời gian còn lại</dt>
        <dd className="font-semibold">{quote ? `${quote.remainingDays} ngày` : "Chưa đủ dữ liệu"}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-slate-500">Phí nâng cấp dự kiến</dt>
        <dd className="font-semibold">{quote ? formatVnd(quote.amount) : "Chưa đủ dữ liệu"}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-slate-500">Ngày hết hạn giữ nguyên</dt>
        <dd className="font-semibold">{formatDate(subscriptionEnd)}</dd>
      </div>
    </>
  );
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

function calculateUpgradeQuote(basicPrice: number, proPrice: number, startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const now = new Date();
  const totalMs = Math.max(end.getTime() - start.getTime(), 1);
  const remainingMs = Math.max(end.getTime() - now.getTime(), 0);
  const amount = Math.max(Math.round(Math.max(proPrice - basicPrice, 0) * remainingMs / totalMs), 0);
  const remainingDays = Math.max(Math.ceil(remainingMs / (24 * 60 * 60 * 1000)), 0);
  return { amount, remainingDays };
}

function formatDate(value: string | null) {
  if (!value) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function formatProjectedEnd(currentEndIso: string | null, months: number) {
  const base = currentEndIso && new Date(currentEndIso).getTime() > Date.now() ? new Date(currentEndIso) : new Date();
  const projected = new Date(base);
  const originalDay = projected.getDate();
  projected.setDate(1);
  projected.setMonth(projected.getMonth() + months);
  const lastDay = new Date(projected.getFullYear(), projected.getMonth() + 1, 0).getDate();
  projected.setDate(Math.min(originalDay, lastDay));
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(projected);
}
