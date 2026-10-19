"use client";

import { CheckCircle2, Crown, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { startSubscriptionCheckoutAction } from "@/app/[rSlug]/admin/subscription/actions";
import { SubscriptionPaymentCheckout } from "@/components/admin/subscription-payment-checkout";
import type { CommercialPlan, PlanFeature } from "@/lib/plan/features";

type PlanPrice = { id: string; plan: CommercialPlan; termMonths: number; priceVnd: number; monthlyPriceVnd: number; isRecommended: boolean; description: string | null };
type FeatureItem = { key: PlanFeature; title: string; BASIC: boolean; PRO: boolean };
type PendingRequest = { id: string; plan: CommercialPlan; termMonths: number; requestType: "RENEWAL" | "UPGRADE"; priceVnd: number; quoteExpiresAt: string | null };
type ActivePaymentOrder = { id: string; subscriptionRequestId: string; plan: CommercialPlan; termMonths: number; amountVnd: number; expiresAt: string };

type SubscriptionPricingClientProps = {
  slug: string;
  currentPlan: CommercialPlan;
  currentExpired: boolean;
  subscriptionEnd: string | null;
  prices: PlanPrice[];
  features: FeatureItem[];
  pendingRequests: PendingRequest[];
  activePaymentOrders: ActivePaymentOrder[];
};

const terms = [3, 6, 12] as const;

export function SubscriptionPricingClient({ slug, currentPlan, currentExpired, subscriptionEnd, prices, features, pendingRequests, activePaymentOrders }: SubscriptionPricingClientProps) {
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const checkoutDialogRef = useRef<HTMLDialogElement>(null);
  const [selectedTerm, setSelectedTerm] = useState<(typeof terms)[number]>(12);
  const [selectedPrice, setSelectedPrice] = useState<PlanPrice | null>(null);
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isStartingCheckout, startCheckoutTransition] = useTransition();
  const pricesByPlan = useMemo(() => new Map(prices.map((price) => [`${price.plan}:${price.termMonths}`, price])), [prices]);

  function openConfirmation(price: PlanPrice) {
    setSelectedPrice(price);
    setCheckoutError(null);
    confirmDialogRef.current?.showModal();
  }

  function openCheckout(paymentOrderId: string) {
    setCheckoutOrderId(paymentOrderId);
    checkoutDialogRef.current?.showModal();
  }

  function startCheckout() {
    if (!selectedPrice) return;
    startCheckoutTransition(async () => {
      const result = await startSubscriptionCheckoutAction(slug, { plan: selectedPrice.plan, termMonths: selectedPrice.termMonths });
      if (!result.ok) {
        setCheckoutError(result.message);
        return;
      }
      confirmDialogRef.current?.close();
      setSelectedPrice(null);
      openCheckout(result.paymentOrderId);
    });
  }

  return <>
    {activePaymentOrders.length > 0 ? <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-teal-950">Bạn có lệnh thanh toán đang chờ</p><p className="mt-1 text-sm text-teal-800">{activePaymentOrders[0].plan} · {activePaymentOrders[0].termMonths} tháng · {formatVnd(activePaymentOrders[0].amountVnd)}</p></div><button className="h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800" type="button" onClick={() => openCheckout(activePaymentOrders[0].id)}>Tiếp tục thanh toán</button></div></section> : null}

    <section className="mt-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-teal-100 bg-gradient-to-br from-white via-teal-50/60 to-white p-5 shadow-sm md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Bảng giá QuánPilot</p><h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">Chọn gói dịch vụ phù hợp với cửa hàng</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Báo giá, số tiền và nội dung chuyển khoản đều được tạo từ dữ liệu máy chủ.</p></div>
        <div className="inline-flex rounded-full border bg-white p-1 shadow-sm">{terms.map((term) => <button key={term} className={`h-10 rounded-full px-4 text-sm font-semibold transition ${selectedTerm === term ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`} type="button" onClick={() => setSelectedTerm(term)}>{term} tháng</button>)}</div>
      </div>

      <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-2">
        {(["BASIC", "PRO"] as CommercialPlan[]).map((plan) => {
          const price = pricesByPlan.get(`${plan}:${selectedTerm}`);
          const isCurrentPlan = currentPlan === plan && !currentExpired;
          const upgradeNeedsReconciliation = currentPlan === "BASIC" && plan === "PRO" && !currentExpired;
          const matchingRequest = pendingRequests.find((request) => request.plan === plan && request.termMonths === selectedTerm && request.requestType === "RENEWAL");
          const matchingOrder = matchingRequest ? activePaymentOrders.find((order) => order.subscriptionRequestId === matchingRequest.id) : null;
          const isPro = plan === "PRO";
          const ctaLabel = upgradeNeedsReconciliation ? "Cần đối soát quyền lợi" : matchingOrder ? "Tiếp tục thanh toán" : matchingRequest ? "Thanh toán báo giá" : isCurrentPlan ? "Gia hạn" : "Đăng ký";
          return <article key={plan} className={`flex min-h-full flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isPro ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${isPro ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-200 bg-teal-50 text-teal-700"}`}>{isPro ? <Crown className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}{plan}</div>{isPro ? <span className="ml-2 rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">Gói nâng cao</span> : null}</div>{isCurrentPlan ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Gói hiện tại</span> : null}</div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              {upgradeNeedsReconciliation ? <><p className="text-sm font-medium text-slate-500">Nâng cấp BASIC → PRO</p><p className="mt-2 text-base font-semibold text-slate-900">Cần đối soát các kỳ BASIC đã thanh toán</p><p className="mt-2 text-sm leading-6 text-slate-600">QuánPilot Admin sẽ lập báo giá sau khi xác minh entitlement lịch sử.</p></> : price ? <><p className="text-sm font-medium text-slate-500">Bình quân mỗi tháng</p><p className="mt-1 text-4xl font-bold tracking-normal text-slate-950">{formatVnd(price.monthlyPriceVnd)}</p><p className="mt-2 text-sm text-slate-600">Tổng thanh toán: <span className="font-semibold text-slate-900">{formatVnd(price.priceVnd)}</span></p>{price.isRecommended ? <p className="mt-2 text-xs font-semibold text-teal-700">Được đề xuất cho kỳ {selectedTerm} tháng</p> : null}</> : <p className="text-sm text-slate-500">Kỳ này hiện chưa mở bán.</p>}
            </div>
            <div className="mt-5 flex-1 space-y-2">{features.map((feature) => <div key={feature.key} className={`flex items-start gap-2 text-sm ${feature[plan] ? "text-slate-800" : "text-slate-400"}`}>{feature[plan] ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}<span>{feature.title}</span></div>)}</div>
            <button className={`mt-6 h-12 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isPro ? "bg-teal-700 text-white hover:bg-teal-800" : "border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"}`} type="button" disabled={!price || upgradeNeedsReconciliation} onClick={() => matchingOrder ? openCheckout(matchingOrder.id) : price && openConfirmation(price)}>{ctaLabel}</button>
          </article>;
        })}
      </div>
    </section>

    <dialog ref={confirmDialogRef} className="w-full max-w-md rounded-2xl border bg-white p-0 shadow-2xl backdrop:bg-black/40">
      {selectedPrice ? <form className="p-5" onSubmit={(event) => { event.preventDefault(); startCheckout(); }}><p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Xác nhận thanh toán</p><h3 className="mt-2 text-xl font-semibold text-slate-950">{currentPlan === selectedPrice.plan && !currentExpired ? `Gia hạn gói ${selectedPrice.plan}` : `Đăng ký gói ${selectedPrice.plan}`}</h3><p className="mt-2 text-sm leading-6 text-slate-600">Hệ thống sẽ tạo một mã chuyển khoản duy nhất, có hiệu lực 30 phút. Trong thời gian này không thể tạo mã khác.</p><dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Kỳ đăng ký</dt><dd className="font-semibold">{selectedPrice.termMonths} tháng</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Tổng tiền</dt><dd className="font-semibold">{formatVnd(selectedPrice.priceVnd)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Ngày hết hạn dự kiến</dt><dd className="font-semibold">{formatProjectedEnd(subscriptionEnd, selectedPrice.termMonths)}</dd></div></dl>{checkoutError ? <p className="mt-3 text-sm font-medium text-red-700">{checkoutError}</p> : null}<div className="mt-5 flex justify-end gap-2"><button className="rounded-md border px-4 py-2 text-sm font-semibold" type="button" disabled={isStartingCheckout} onClick={() => { confirmDialogRef.current?.close(); setSelectedPrice(null); setCheckoutError(null); }}>Hủy</button><button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-slate-400" type="submit" disabled={isStartingCheckout}>{isStartingCheckout ? "Đang tạo..." : "Tạo mã thanh toán"}</button></div></form> : null}
    </dialog>

    <dialog ref={checkoutDialogRef} className="w-full max-w-xl rounded-2xl border bg-white p-0 shadow-2xl backdrop:bg-black/40">{checkoutOrderId ? <SubscriptionPaymentCheckout slug={slug} paymentOrderId={checkoutOrderId} onClose={() => { checkoutDialogRef.current?.close(); setCheckoutOrderId(null); }} /> : null}</dialog>
  </>;
}

function formatVnd(value: number) { return `${value.toLocaleString("vi-VN")}đ`; }
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
