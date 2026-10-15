"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { confirmSubscriptionRequestAction, rejectSubscriptionRequestAction } from "@/app/platform/restaurants/actions";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

type PendingRequest = {
  id: string;
  requestType: string;
  plan: string;
  termMonths: number;
  priceVnd: number;
  status: string;
  createdAt: string;
  currentSubscriptionEnd: string | null;
};

export function SubscriptionRequestsDialog({
  restaurantName,
  restaurantPlan,
  subscriptionEnd,
  requests,
  returnTo
}: {
  restaurantName: string;
  restaurantPlan: string;
  subscriptionEnd: string | null;
  requests: PendingRequest[];
  returnTo: string;
}) {
  const searchParams = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestCount = requests.length;

  useEffect(() => {
    if (!searchParams.get("success")) return;
    dialogRef.current?.close();
  }, [searchParams]);

  if (requestCount === 0) {
    return <p className="mt-1 text-xs text-slate-500">Không có yêu cầu chờ.</p>;
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
          {requestCount} yêu cầu chờ
        </span>
        <button
          className="rounded-md border px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          type="button"
          onClick={() => dialogRef.current?.showModal()}
        >
          Xem yêu cầu
        </button>
      </div>

      <dialog ref={dialogRef} className="w-full max-w-2xl rounded-2xl border bg-white p-0 shadow-2xl backdrop:bg-black/40">
        <div className="border-b p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Yêu cầu đăng ký</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{restaurantName}</h3>
          <p className="mt-1 text-sm text-slate-600">
            Gói hiện tại: <span className="font-semibold text-slate-900">{restaurantPlan}</span>
            {" · "}
            Hết hạn: <span className="font-semibold text-slate-900">{formatDate(subscriptionEnd)}</span>
          </p>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          {requests.map((request) => (
            <article key={request.id} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {requestTypeLabel(request.requestType, restaurantPlan)} · {request.plan} · {request.termMonths} tháng
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Gửi lúc {formatDateTime(request.createdAt)} · Trạng thái: {request.status === "PENDING" ? "Chờ xác nhận" : request.status}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-900">
                  {formatVnd(request.priceVnd)}
                </span>
              </div>

              <p className="mt-3 text-xs text-amber-900">
                {request.requestType === "UPGRADE"
                  ? `Giữ hạn đến: ${formatDate(request.currentSubscriptionEnd)}`
                  : `Kỳ đăng ký/gia hạn: ${request.termMonths} tháng`}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={confirmSubscriptionRequestAction}>
                  <input name="requestId" type="hidden" value={request.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <PendingSubmitButton className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800" pendingLabel="Đang xác nhận...">
                    Xác nhận
                  </PendingSubmitButton>
                </form>
                <form action={rejectSubscriptionRequestAction}>
                  <input name="requestId" type="hidden" value={request.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <PendingSubmitButton className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-amber-100" pendingLabel="Đang từ chối...">
                    Từ chối
                  </PendingSubmitButton>
                </form>
              </div>
            </article>
          ))}
        </div>

        <div className="flex justify-end border-t p-4">
          <button className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={() => dialogRef.current?.close()}>
            Đóng
          </button>
        </div>
      </dialog>
    </>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

function requestTypeLabel(type: string, currentPlan: string) {
  if (type === "UPGRADE") return "Nâng cấp";
  if (currentPlan === "FREE") return "Đăng ký";
  return "Gia hạn";
}
