"use client";

import { AlertCircle, Clock3, CreditCard, Eye, MapPin, ReceiptText, Search, Utensils, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { updateServiceRequestStatusAction } from "@/app/[rSlug]/ops/actions";
import { InvoicePrintButton } from "@/components/billing/invoice-print-button";
import { PaidBillButton } from "@/components/admin/payment-report-table";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatVnd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payment-method";
import { getStaffDeviceId } from "@/lib/staff-device";
import type { CashierSession, CashierSummary } from "@/server/services/cashier-state-service";

type PaymentMethod = "CASH" | "QR" | "BANK_TRANSFER" | "CARD" | "OTHER";
type SessionFilter = "ALL" | "PAYMENT" | "SERVING" | "NO_ITEMS";

export type CashierSettings = {
  restaurantName: string;
  invoiceBusinessName: string | null;
  invoiceTaxCode: string | null;
  invoiceAddress: string | null;
  invoicePhone: string | null;
  invoiceEmail: string | null;
  cashEnabled: boolean;
  qrPaymentEnabled: boolean;
  paymentQrImage: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  paymentTransferContent: string | null;
};

export function CashierWorkspace({
  slug,
  cashierName,
  sessions,
  initialSummary,
  settings
}: {
  slug: string;
  cashierName: string | null;
  sessions: CashierSession[];
  initialSummary: CashierSummary;
  settings: CashierSettings;
}) {
  const [liveSessions, setLiveSessions] = useState(sessions);
  const [summary, setSummary] = useState(initialSummary);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paidPaymentId, setPaidPaymentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("ALL");
  const latestRefreshRef = useRef(0);

  const selectedSession = liveSessions.find((session) => session.id === selectedSessionId) ?? null;
  const paymentSession = liveSessions.find((session) => session.id === paymentSessionId) ?? null;
  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    return liveSessions.filter((session) => {
      const waitingForPayment = isWaitingForPayment(session);
      const matchesFilter = sessionFilter === "ALL"
        || (sessionFilter === "PAYMENT" && waitingForPayment)
        || (sessionFilter === "SERVING" && session.itemCount > 0 && !waitingForPayment)
        || (sessionFilter === "NO_ITEMS" && session.itemCount === 0);
      if (!matchesFilter) return false;
      if (!keyword) return true;
      return [session.tableName, session.areaName, session.customerName ?? ""]
        .some((value) => value.toLocaleLowerCase("vi").includes(keyword));
    });
  }, [liveSessions, query, sessionFilter]);

  const refreshState = useCallback(async () => {
    const refreshId = ++latestRefreshRef.current;
    try {
      const response = await fetch(`/api/restaurants/${slug}/cashier/state?deviceId=${encodeURIComponent(getStaffDeviceId())}`, {
        cache: "no-store"
      });
      if (response.status === 403) {
        window.location.href = `/${slug}/login?error=${encodeURIComponent("Thiết bị này đã bị quản lý khóa.")}`;
        return;
      }
      if (!response.ok) return;
      const data = await response.json() as {
        sessions: CashierSession[];
        summary: CashierSummary;
      };
      if (refreshId !== latestRefreshRef.current) return;
      setLiveSessions(data.sessions);
      setSummary(data.summary);
    } catch {
      // Keep the last known state. SSE reconnect and the fallback poll will retry.
    }
  }, [slug]);

  useEffect(() => {
    setLiveSessions(sessions);
    setSummary(initialSummary);
  }, [initialSummary, sessions]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let refreshTimer: number | null = null;
    const refreshSoon = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshState(), 150);
    };
    try {
      eventSource = new EventSource(`/api/restaurants/${slug}/notifications/stream?deviceId=${encodeURIComponent(getStaffDeviceId())}`);
      eventSource.addEventListener("notification", refreshSoon);
    } catch {
      // The lightweight polling fallback below remains active.
    }

    const interval = window.setInterval(() => void refreshState(), 15000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshState();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      eventSource?.close();
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshState, slug]);

  useEffect(() => {
    if (selectedSessionId && !liveSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(null);
    }
    if (paymentSessionId && !liveSessions.some((session) => session.id === paymentSessionId)) {
      setPaymentSessionId(null);
    }
  }, [liveSessions, paymentSessionId, selectedSessionId]);

  function openDetails(sessionId: string) {
    setSelectedSessionId(sessionId);
    setMessage(null);
  }

  function openPayment(sessionId: string) {
    setPaymentSessionId(sessionId);
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <QuickStat icon={Utensils} label="Bàn đang phục vụ" value={String(summary.activeSessionCount)} unit="bàn" tone="teal" />
        <QuickStat icon={AlertCircle} label="Yêu cầu thanh toán" value={String(summary.paymentRequestCount)} unit="yêu cầu" tone={summary.paymentRequestCount ? "amber" : "slate"} />
        <QuickStat icon={WalletCards} label="Bill hôm nay" value={String(summary.paidBillCount)} unit="hóa đơn" detail={`Doanh thu ${formatVnd(summary.paidRevenue)}`} tone="slate" />
      </section>

      {message ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          <span>{message}</span>
          {paidPaymentId ? <PaidBillButton slug={slug} paymentId={paidPaymentId} label="Xem và in bill" /> : null}
        </div>
      ) : null}

      <section className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
              <p className="text-xs font-semibold uppercase text-teal-700">Vận hành hiện tại</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">Bàn đang phục vụ</h2>
              <p className="mt-1 text-sm text-slate-500">Ưu tiên bàn chờ thanh toán và thao tác trực tiếp tại từng bàn.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{filteredSessions.length}/{liveSessions.length} bàn</span>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-md border bg-white pl-9 pr-9 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo bàn, khu vực hoặc tên khách"
                aria-label="Tìm bàn"
              />
              {query ? (
                <button className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded hover:bg-slate-100" type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </label>
            <div className="flex max-w-full flex-wrap gap-1 rounded-md bg-slate-100 p-1" aria-label="Lọc trạng thái bàn">
              <FilterButton active={sessionFilter === "ALL"} onClick={() => setSessionFilter("ALL")}>Tất cả</FilterButton>
              <FilterButton active={sessionFilter === "PAYMENT"} onClick={() => setSessionFilter("PAYMENT")}>Chờ thanh toán</FilterButton>
              <FilterButton active={sessionFilter === "SERVING"} onClick={() => setSessionFilter("SERVING")}>Đang phục vụ</FilterButton>
              <FilterButton active={sessionFilter === "NO_ITEMS"} onClick={() => setSessionFilter("NO_ITEMS")}>Chưa có món</FilterButton>
            </div>
          </div>
        </div>

        {filteredSessions.length ? (
          <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredSessions.map((session) => (
              <CashierTableCard
                key={session.id}
                session={session}
                slug={slug}
                settings={settings}
                cashierName={cashierName}
                onDetails={() => openDetails(session.id)}
                onPayment={() => openPayment(session.id)}
              />
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <Utensils className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800">Không tìm thấy bàn phù hợp</p>
            <p className="mt-1 text-sm text-slate-500">Thử đổi từ khóa hoặc chọn trạng thái khác.</p>
          </div>
        )}
      </section>

      {selectedSession ? (
        <SessionDetailDialog
          session={selectedSession}
          settings={settings}
          cashierName={cashierName}
          onClose={() => setSelectedSessionId(null)}
          onPay={() => openPayment(selectedSession.id)}
        />
      ) : null}

      {paymentSession ? (
        <PaymentDialog
          slug={slug}
          session={paymentSession}
          settings={settings}
          onClose={() => setPaymentSessionId(null)}
          onSuccess={(paymentId) => {
            setPaymentSessionId(null);
            setSelectedSessionId(null);
            setPaidPaymentId(paymentId);
            setMessage(`Đã thanh toán bàn ${paymentSession.tableName} thành công.`);
            void refreshState();
          }}
          onRefresh={refreshState}
        />
      ) : null}
    </div>
  );
}

function CashierTableCard({
  session,
  slug,
  settings,
  cashierName,
  onDetails,
  onPayment
}: {
  session: CashierSession;
  slug: string;
  settings: CashierSettings;
  cashierName: string | null;
  onDetails: () => void;
  onPayment: () => void;
}) {
  const request = session.paymentRequest;
  const waitingForPayment = isWaitingForPayment(session);

  return (
    <article className={`flex min-w-0 flex-col rounded-lg border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${waitingForPayment ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-bold text-slate-950">Bàn {session.tableName}</h3>
            <SessionStatusBadge session={session} />
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{session.areaName}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-slate-500">Tạm tính</p>
          <p className="mt-0.5 max-w-40 break-words text-right text-base font-bold text-teal-700 tabular-nums sm:text-lg">
            {formatVnd(session.bill.grandTotal)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x rounded-md border bg-slate-50 py-2.5 text-center">
        <div className="px-2">
          <p className="text-[11px] text-slate-500">Mở bàn</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-800" title={session.openedAtLabel}>
            {session.openedAtLabel}
          </p>
        </div>
        <div className="px-2">
          <p className="text-[11px] text-slate-500">Số món</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{session.itemCount}</p>
        </div>
        <div className="px-2">
          <p className="text-[11px] text-slate-500">Lượt gọi</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{session.orderCount}</p>
        </div>
      </div>

      <p className="mt-3 truncate text-sm text-slate-600">
        <span className="text-slate-400">Khách:</span> {session.customerName ?? "Chưa cập nhật"}
      </p>

      {request ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-900">Yêu cầu thanh toán · {request.createdAtLabel}</p>
            <p className="truncate text-xs text-amber-700">{request.customerName}</p>
          </div>
          {request.status === "NEW" ? (
            <form action={updateServiceRequestStatusAction.bind(null, slug, request.id, "ACKNOWLEDGED")}>
              <PendingSubmitButton className="h-8 shrink-0 rounded-md border border-amber-300 bg-white px-2.5 text-xs font-semibold text-amber-900" pendingLabel="Đang nhận...">Đã nhận</PendingSubmitButton>
            </form>
          ) : <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Đã nhận</span>}
        </div>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border bg-white px-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={onDetails}>
          <Eye className="h-4 w-4" /> Xem order
        </button>
        <InvoicePrintButton className="h-10 w-full justify-center px-2" label="In tạm tính" invoice={buildPreliminaryInvoice(session, settings, cashierName)} />
        <button className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800" type="button" onClick={onPayment}>
          <CreditCard className="h-4 w-4" /> Thanh toán {formatVnd(session.bill.grandTotal)}
        </button>
      </div>
    </article>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`h-8 shrink-0 rounded px-3 text-xs font-semibold transition ${active ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function QuickStat({ icon: Icon, label, value, unit, detail, tone }: {
  icon: typeof Utensils;
  label: string;
  value: string;
  unit: string;
  detail?: string;
  tone: "teal" | "amber" | "slate";
}) {
  const toneClass = tone === "teal"
    ? "border-teal-100 bg-white text-teal-800"
    : tone === "amber"
      ? "border-amber-200 bg-white text-amber-800"
      : "border-slate-200 bg-white text-slate-800";
  const iconClass = tone === "teal" ? "bg-teal-50 text-teal-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-lg border p-3.5 shadow-sm ${toneClass}`}>
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${iconClass}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-1"><span className="text-xl font-bold tabular-nums">{value}</span><span className="text-xs font-medium text-slate-500">{unit}</span></p>
        {detail ? <p className="mt-0.5 truncate text-xs font-semibold text-teal-700">{detail}</p> : null}
      </div>
    </div>
  );
}

function isWaitingForPayment(session: CashierSession) {
  return Boolean(session.paymentRequest) || session.status === "AWAITING_PAYMENT" || session.paymentStatus === "PENDING";
}

function SessionStatusBadge({ session }: { session: CashierSession }) {
  if (session.paymentRequest || session.status === "AWAITING_PAYMENT" || session.paymentStatus === "PENDING") {
    return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Yêu cầu thanh toán</span>;
  }
  if (!session.itemCount) {
    return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Chưa có món</span>;
  }
  return <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">Đang phục vụ</span>;
}

function SessionDetailDialog({ session, settings, cashierName, onClose, onPay }: {
  session: CashierSession;
  settings: CashierSettings;
  cashierName: string | null;
  onClose: () => void;
  onPay: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={`Chi tiết bàn ${session.tableName}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="mx-auto flex max-h-[calc(100vh-16px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:max-h-[calc(100vh-48px)]">
        <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">Bàn {session.tableName}</h2>
              <SessionStatusBadge session={session} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{session.areaName} · {session.customerName ?? "Chưa có tên khách"} · mở lúc {session.openedAtLabel}</p>
          </div>
          <button className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border" type="button" onClick={onClose} aria-label="Đóng"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {session.orders.length ? (
            <div className="space-y-3">
              {session.orders.map((order) => (
                <section key={order.id} className="overflow-hidden rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="font-semibold">Lượt gọi #{order.orderNumber} · {order.customerName}</p>
                      <p className="text-xs text-slate-500">{order.createdAtLabel}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700">{order.statusLabel}</span>
                  </div>
                  <div className="divide-y">
                    {order.items.map((item) => (
                      <div key={item.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-start">
                        <div className="min-w-0">
                          <p className="font-semibold">{item.name}</p>
                          {item.note ? <p className="mt-1 text-xs text-amber-700">Ghi chú: {item.note}</p> : null}
                          <p className="mt-1 text-xs text-slate-500">{item.statusLabel}</p>
                        </div>
                        <p>{item.quantity} x {formatVnd(item.unitPrice)}</p>
                        <p className="font-semibold sm:min-w-24 sm:text-right">{formatVnd(item.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <ReceiptText className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 font-semibold">Bàn chưa có món</p>
              <p className="mt-1 text-sm text-slate-500">Phiên phục vụ đã mở và sẽ cập nhật khi có order mới.</p>
            </div>
          )}

          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <BillRow label="Tạm tính" value={session.bill.subtotal} />
            {session.bill.taxRate > 0 ? <BillRow label={`Thuế ${session.bill.taxRate}%`} value={session.bill.taxAmount} /> : null}
            <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
              <span className="font-semibold">Tổng dự kiến</span>
              <span className="text-xl font-bold text-teal-700">{formatVnd(session.bill.grandTotal)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t p-4 sm:p-5">
          <InvoicePrintButton label="In phiếu tạm tính" invoice={buildPreliminaryInvoice(session, settings, cashierName)} />
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={onPay}>Thanh toán</button>
          <button className="rounded-md border px-4 py-2 text-sm font-semibold" type="button" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function PaymentDialog({ slug, session, settings, onClose, onSuccess, onRefresh }: {
  slug: string;
  session: CashierSession;
  settings: CashierSettings;
  onClose: () => void;
  onSuccess: (paymentId: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const methods = getAvailablePaymentMethods(settings);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(methods[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmPayment() {
    if (busy) return;
    setBusy(true);
    setError(null);
    getStaffDeviceId();
    try {
      const response = await fetch(`/api/restaurants/${slug}/ops/pay-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diningSessionId: session.id,
          paymentMethod,
          expectedGrandTotal: session.bill.grandTotal
        })
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: string; payment?: { paymentId: string } } | null;
      if (!response.ok || !result?.ok || !result.payment) {
        setError(result?.message ?? "Không thể hoàn tất thanh toán. Vui lòng thử lại.");
        if (response.status === 409) await onRefresh();
        return;
      }
      onSuccess(result.payment.paymentId);
    } catch {
      setError("Mất kết nối khi xác nhận thanh toán. Vui lòng kiểm tra mạng và thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Thanh toán bàn ${session.tableName}`} onMouseDown={(event) => {
      if (!busy && event.target === event.currentTarget) onClose();
    }}>
      <div className="mx-auto w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Xác nhận thanh toán</p>
            <h2 className="mt-1 text-xl font-bold">Bàn {session.tableName}</h2>
            <p className="mt-1 text-sm text-slate-500">{session.itemCount} món · {session.orderCount} lượt gọi</p>
          </div>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border disabled:opacity-50" type="button" disabled={busy} onClick={onClose} aria-label="Đóng"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-slate-50 p-4">
            <BillRow label="Tạm tính" value={session.bill.subtotal} />
            {session.bill.taxRate > 0 ? <BillRow label={`Thuế ${session.bill.taxRate}%`} value={session.bill.taxAmount} /> : null}
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="font-semibold">Tổng thanh toán</span>
              <span className="text-2xl font-bold text-teal-700">{formatVnd(session.bill.grandTotal)}</span>
            </div>
          </div>
          <label className="block text-sm font-semibold">
            Phương thức thanh toán
            <select className="mt-2 h-11 w-full rounded-md border bg-white px-3 font-normal" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} disabled={busy}>
              {methods.map((method) => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}
            </select>
          </label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
          <p className="text-xs text-slate-500">Hệ thống sẽ kiểm tra lại tổng tiền trước khi ghi nhận. Nếu order vừa thay đổi, thanh toán sẽ dừng để bạn xác nhận lại.</p>
        </div>
        <div className="flex justify-end gap-2 border-t p-5">
          <button className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50" type="button" disabled={busy} onClick={onClose}>Hủy</button>
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60" type="button" disabled={busy} onClick={() => void confirmPayment()}>
            {busy ? "Đang xử lý..." : `Xác nhận ${formatVnd(session.bill.grandTotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillRow({ label, value }: { label: string; value: number }) {
  return <div className="mt-1 flex items-center justify-between gap-3 text-sm"><span className="text-slate-600">{label}</span><span className="font-semibold">{formatVnd(value)}</span></div>;
}

function getAvailablePaymentMethods(settings: CashierSettings): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  if (settings.cashEnabled) methods.push("CASH");
  if (settings.qrPaymentEnabled) methods.push("QR");
  return methods.length ? methods : ["CASH"];
}

function buildPreliminaryInvoice(session: CashierSession, settings: CashierSettings, cashierName: string | null) {
  return {
    restaurantName: settings.restaurantName,
    businessName: settings.invoiceBusinessName ?? settings.restaurantName,
    taxCode: settings.invoiceTaxCode,
    address: settings.invoiceAddress,
    phone: settings.invoicePhone,
    email: settings.invoiceEmail,
    invoiceNumber: null,
    tableName: session.tableName,
    cashierName,
    paidAt: null,
    status: session.paymentStatus === "PENDING" ? "PENDING" as const : "UNPAID" as const,
    paymentMethod: null,
    subtotal: session.bill.subtotal,
    taxRate: session.bill.taxRate,
    taxAmount: session.bill.taxAmount,
    grandTotal: session.bill.grandTotal,
    paymentQr: {
      enabled: settings.qrPaymentEnabled,
      imageUrl: settings.paymentQrImage,
      bankName: settings.bankName,
      bankCode: settings.bankCode,
      accountNumber: settings.accountNumber,
      accountHolder: settings.accountHolder,
      transferContent: settings.paymentTransferContent || `Bàn ${session.tableName}`
    },
    items: session.orders.flatMap((order) => order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      note: item.note
    })))
  };
}
