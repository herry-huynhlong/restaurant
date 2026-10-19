"use client";

import { CheckCircle2, Clock3, Copy, QrCode, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { cancelSubscriptionPaymentOrderAction } from "@/app/[rSlug]/admin/subscription/actions";

type Checkout = {
  id: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "NEEDS_REVIEW";
  plan: "BASIC" | "PRO";
  termMonths: number;
  amountVnd: number;
  currency: string;
  transferCode: string;
  expiresAt: string;
  paidAt: string | null;
  bank:
    | { ready: false }
    | { ready: true; bankCode: string; accountNumber: string; accountName: string | null };
  qrImageUrl: string | null;
};

export function SubscriptionPaymentCheckout({
  slug,
  paymentOrderId,
  onClose
}: {
  slug: string;
  paymentOrderId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const [isCancelling, startCancellationTransition] = useTransition();

  const loadCheckout = useCallback(async () => {
    try {
      const response = await fetch(`/api/restaurants/${encodeURIComponent(slug)}/admin/subscription/payment-orders/${encodeURIComponent(paymentOrderId)}`, {
        cache: "no-store"
      });
      const data = await response.json() as Checkout | { error?: string };
      if (!response.ok || !("id" in data)) {
        throw new Error("Không thể tải trạng thái thanh toán.");
      }
      setCheckout(data);
      setError(null);
    } catch {
      setError("Không thể cập nhật trạng thái thanh toán. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [paymentOrderId, slug]);

  useEffect(() => {
    void loadCheckout();
  }, [loadCheckout]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!checkout || checkout.status !== "PENDING") return;
    const interval = window.setInterval(() => void loadCheckout(), 15_000);
    return () => window.clearInterval(interval);
  }, [checkout, loadCheckout]);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Không thể sao chép. Vui lòng chọn và sao chép thủ công.");
    }
  }

  function cancelPaymentOrder() {
    startCancellationTransition(async () => {
      const result = await cancelSubscriptionPaymentOrderAction(slug, paymentOrderId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirmingCancellation(false);
      await loadCheckout();
      router.refresh();
    });
  }

  const remaining = checkout ? formatRemaining(checkout.expiresAt, now) : null;
  const isPending = checkout?.status === "PENDING";
  const configuredBank = checkout?.bank.ready ? checkout.bank : null;

  return (
    <section className="max-h-[min(720px,calc(100vh-2rem))] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Thanh toán gói dịch vụ</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Chuyển khoản qua VietQR</h3>
        </div>
        <button aria-label="Đóng" className="grid h-10 w-10 place-items-center rounded-lg border text-slate-600 hover:bg-slate-50" type="button" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {loading ? <p className="mt-6 text-sm text-slate-600">Đang tải lệnh thanh toán...</p> : null}
      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{error}</p>
          <button className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 font-semibold" type="button" onClick={() => void loadCheckout()}>
            <RefreshCw className="h-4 w-4" /> Thử lại
          </button>
        </div>
      ) : null}

      {checkout ? (
        <div className="mt-5 space-y-4">
          <CheckoutStatus status={checkout.status} remaining={remaining} />

          <dl className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <Info label="Gói dịch vụ" value={`${checkout.plan} · ${checkout.termMonths} tháng`} />
            <Info label="Số tiền" value={formatVnd(checkout.amountVnd)} strong />
            <Info label="Nội dung chuyển khoản" value={checkout.transferCode} copy={() => void copy(checkout.transferCode, "content")} copied={copied === "content"} />
            <Info label="Hết hạn lúc" value={formatDateTime(checkout.expiresAt)} />
          </dl>

          {isPending && configuredBank ? (
            <div className="grid gap-4 rounded-xl border border-teal-100 bg-teal-50/50 p-4 sm:grid-cols-[minmax(0,1fr)_176px] sm:items-center">
              <div className="space-y-3 text-sm">
                <p className="font-semibold text-slate-950">Chuyển đúng số tiền và nội dung để hệ thống đối chiếu.</p>
                <Info label="Ngân hàng" value={configuredBank.bankCode} />
                <Info label="Số tài khoản" value={configuredBank.accountNumber} copy={() => void copy(configuredBank.accountNumber, "account")} copied={copied === "account"} />
                {configuredBank.accountName ? <Info label="Chủ tài khoản" value={configuredBank.accountName} /> : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <CopyButton label="Sao chép số tiền" onClick={() => void copy(String(checkout.amountVnd), "amount")} copied={copied === "amount"} />
                  <button className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => void loadCheckout()}>
                    <RefreshCw className="h-4 w-4" /> Cập nhật trạng thái
                  </button>
                </div>
              </div>
              {checkout.qrImageUrl ? <>
                {/* VietQR is an external, dynamically generated payment image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="mx-auto aspect-square w-40 rounded-lg border bg-white p-1" src={checkout.qrImageUrl} alt="Mã VietQR thanh toán gói dịch vụ" />
              </> : null}
            </div>
          ) : null}

          {isPending && !configuredBank ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <p>Lệnh thanh toán này chưa có thông tin nhận tiền đã được lưu. Vui lòng liên hệ QuánPilot để tạo lệnh mới.</p>
              </div>
            </div>
          ) : null}

          {isPending ? (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-900">
              {confirmingCancellation ? <>
                <p className="font-semibold">Hủy mã thanh toán này?</p>
                <p className="mt-1 leading-5">Mã QR và nội dung chuyển khoản sẽ mất hiệu lực ngay. Bạn có thể tạo mã mới sau đó.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="h-10 rounded-lg border border-red-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50" type="button" disabled={isCancelling} onClick={() => setConfirmingCancellation(false)}>Quay lại</button>
                  <button className="h-10 rounded-lg bg-red-700 px-3 font-semibold text-white hover:bg-red-800 disabled:cursor-wait disabled:bg-red-400" type="button" disabled={isCancelling} onClick={cancelPaymentOrder}>{isCancelling ? "Đang hủy..." : "Xác nhận hủy mã"}</button>
                </div>
              </> : <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="leading-5">Không chuyển tiền vào mã này nữa nếu bạn muốn thay đổi lựa chọn.</p><button className="h-10 shrink-0 rounded-lg border border-red-300 bg-white px-3 font-semibold text-red-700 hover:bg-red-100" type="button" onClick={() => setConfirmingCancellation(true)}>Hủy mã thanh toán</button></div>}
            </div>
          ) : null}

          <p className="text-xs leading-5 text-slate-500">Việc hiển thị QR hoặc chuyển khoản không tự kích hoạt gói. Gói chỉ được kích hoạt khi SePay xác minh giao dịch hợp lệ.</p>
        </div>
      ) : null}
    </section>
  );
}

function CheckoutStatus({ status, remaining }: { status: Checkout["status"]; remaining: string | null }) {
  if (status === "PAID") {
    return <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0" /><p>Thanh toán đã được SePay xác minh. Gói dịch vụ đã được kích hoạt.</p></div>;
  }
  if (status === "EXPIRED" || status === "CANCELLED") {
    return <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><Clock3 className="h-5 w-5 shrink-0" /><p>Mã thanh toán đã hết hiệu lực. Bạn có thể tạo mã thanh toán mới.</p></div>;
  }
  if (status === "NEEDS_REVIEW") {
    return <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert className="h-5 w-5 shrink-0" /><p>Giao dịch đang cần QuánPilot Admin kiểm tra.</p></div>;
  }
  return <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900"><QrCode className="h-5 w-5 shrink-0" /><span>Đang chờ thanh toán{remaining ? ` · Còn ${remaining}` : ""}</span></div>;
}

function Info({ label, value, strong = false, copy, copied = false }: { label: string; value: string; strong?: boolean; copy?: () => void; copied?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className={`mt-1 flex min-w-0 items-center gap-2 ${strong ? "text-lg font-bold text-slate-950" : "font-semibold text-slate-900"}`}><span className="truncate">{value}</span>{copy ? <CopyButton label={copied ? "Đã sao chép" : "Sao chép"} onClick={copy} copied={copied} /> : null}</dd></div>;
}

function CopyButton({ label, onClick, copied }: { label: string; onClick: () => void; copied: boolean }) {
  return <button className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={onClick}><Copy className="h-3.5 w-3.5" />{copied ? "Đã chép" : label}</button>;
}

function formatVnd(value: number) { return `${value.toLocaleString("vi-VN")}đ`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)); }
function formatRemaining(value: string, now: number) {
  const milliseconds = new Date(value).getTime() - now;
  if (milliseconds <= 0) return "0 phút";
  const minutes = Math.ceil(milliseconds / 60_000);
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}
