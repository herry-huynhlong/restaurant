"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaymentMethod } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, Clock, Plus, Search, X } from "lucide-react";
import { formatVnd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payment-method";
import { restaurantRoutes } from "@/lib/routes";
import { servedUploadUrl } from "@/lib/upload-url";
import { InvoicePrintButton } from "@/components/billing/invoice-print-button";
import { QrCard } from "@/components/admin/qr-card";
import {
  BillDetailModal,
  BillHistoryButton,
  PaidBillButton,
  type BillDetail,
  type PaymentSummary
} from "@/components/admin/payment-report-table";

export type TableState = {
  settings: {
    taxEnabled: boolean;
    taxRate: number;
    invoiceBusinessName: string | null;
    invoiceTaxCode: string | null;
    invoiceEmail: string | null;
    invoiceDisplayName: string | null;
    address: string | null;
    phone: string | null;
    cashEnabled: boolean;
    qrPaymentEnabled: boolean;
    paymentQrImage: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountHolder: string | null;
    paymentTransferContent: string | null;
  };
  areas: Array<{
    id: string;
    name: string;
    sortOrder: number;
    tables: LiveTable[];
  }>;
};

export type LiveTable = {
  id: string;
  areaId: string;
  areaName: string;
  name: string;
  status: string;
  isActive: boolean;
  qrUrl: string;
  qrDataUrl: string;
  activeSession: null | {
    id: string;
    status: string;
    paymentStatus: string;
    openedAt: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    grandTotal: number;
    itemCount: number;
    orderCount: number;
    customers: string[];
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    serviceRequests: Array<{
      id: string;
      type: string;
      customerName: string;
      status: string;
      createdAt: string;
    }>;
  };
};

export type MenuProduct = {
  id: string;
  menuType: string;
  nameVi: string;
  descriptionVi: string | null;
  price: number;
  imageUrl: string | null;
  isSoldOut: boolean;
};

type CartItem = MenuProduct & {
  quantity: number;
  note: string;
};

type PaymentTarget = {
  tableId: string;
  tableName: string;
  sessionId: string;
  itemCount: number;
  grandTotal: number;
};

const tableStatusLabels: Record<string, string> = {
  AVAILABLE: "Đang trống",
  OCCUPIED: "Đang phục vụ",
  WAITING_FOOD: "Đang phục vụ",
  PAYMENT_REQUESTED: "Chờ thanh toán"
};

const requestLabels: Record<string, string> = {
  CALL_STAFF: "Gọi nhân viên",
  REQUEST_WATER: "Xin nước",
  REQUEST_UTENSILS: "Xin dụng cụ",
  REQUEST_PAYMENT: "Yêu cầu thanh toán",
  OTHER: "Hỗ trợ"
};

export function TablesLivePanel({
  slug,
  restaurantName,
  cashierName,
  canUsePayment,
  showQrTools = true,
  products,
  initialState,
  initialSelectedTableId,
  initialPaidPayments = []
}: {
  slug: string;
  restaurantName: string;
  cashierName?: string | null;
  canUsePayment: boolean;
  showQrTools?: boolean;
  products: MenuProduct[];
  initialState: TableState;
  initialSelectedTableId?: string | null;
  initialPaidPayments?: PaymentSummary[];
}) {
  const [state, setState] = useState(initialState);
  const [selectedTableId, setSelectedTableId] = useState(initialSelectedTableId ?? initialState.areas[0]?.tables[0]?.id ?? null);
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const [payingSessionId, setPayingSessionId] = useState<string | null>(null);
  const [orderingTableId, setOrderingTableId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paidPayments, setPaidPayments] = useState(initialPaidPayments);
  const [paymentDialog, setPaymentDialog] = useState<PaymentTarget | null>(null);
  const [paymentDialogError, setPaymentDialogError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [paidBill, setPaidBill] = useState<BillDetail | null>(null);
  const tables = useMemo(() => state.areas.flatMap((area) => area.tables), [state.areas]);
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0] ?? null;
  const selectedTableIdForBill = selectedTable?.id ?? null;
  const selectedSessionIdForBill = selectedTable?.activeSession?.id ?? null;

  const refreshTables = useCallback(async () => {
    try {
      const response = await fetch(`/api/restaurants/${slug}/admin/tables/state`, { cache: "no-store" });
      if (!response.ok) throw new Error("tables_state_failed");
      const data = (await response.json()) as TableState;
      setState(data);
      setStatus("live");
    } catch {
      setStatus("reconnecting");
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (!cancelled) await refreshTables();
    }
    const interval = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshTables]);

  useEffect(() => {
    if (!selectedTableIdForBill || selectedSessionIdForBill) return;
    const controller = new AbortController();

    void fetch(`/api/restaurants/${slug}/reports/payments?page=1&tableId=${encodeURIComponent(selectedTableIdForBill)}`, {
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as {
        items: Array<{
          id: string;
          tableId: string;
          invoiceNumber: string | null;
          tableName: string;
          amount: number;
          paymentMethod: PaymentSummary["paymentMethod"];
          dateLabel: string;
          timeLabel: string;
          confirmedByName: string | null;
        }>;
      };
      const latest = data.items[0];
      setPaidPayments((current) => {
        const otherTables = current.filter((payment) => payment.tableId !== selectedTableIdForBill);
        if (!latest) return otherTables;
        return [{
          id: latest.id,
          tableId: latest.tableId,
          invoiceNumber: latest.invoiceNumber,
          paidAtLabel: `${latest.timeLabel} ${latest.dateLabel}`,
          tableName: latest.tableName,
          amount: latest.amount,
          status: "PAID",
          paymentMethod: latest.paymentMethod,
          confirmedByName: latest.confirmedByName
        }, ...otherTables];
      });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
    });

    return () => controller.abort();
  }, [selectedSessionIdForBill, selectedTableIdForBill, slug]);

  async function paySession(target: PaymentTarget, method: PaymentMethod, verifyDisplayedTotal = false) {
    setPayingSessionId(target.sessionId);
    try {
      const response = await fetch(`/api/restaurants/${slug}/ops/pay-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diningSessionId: target.sessionId,
          paymentMethod: method,
          ...(verifyDisplayedTotal ? { expectedGrandTotal: target.grandTotal } : {})
        })
      });

      const data = await response.json().catch(() => ({})) as {
        message?: string;
        error?: string;
        grandTotal?: number;
        payment?: {
          paymentId: string;
          invoiceNumber: string | null;
          grandTotal: number;
          tableName: string;
          paymentMethod: PaymentMethod;
          paidAt: string;
        };
      };
      if (!response.ok) {
        if (data.error === "BILL_CHANGED" && Number.isSafeInteger(data.grandTotal)) {
          setPaymentDialog((current) => current?.sessionId === target.sessionId
            ? { ...current, grandTotal: data.grandTotal as number }
            : current);
        }
        throw new Error(data.message || data.error || `Không xác nhận được thanh toán (${response.status}).`);
      }
      if (!data.payment?.paymentId) throw new Error("Không nhận được thông tin giao dịch đã thanh toán.");

      const payment: PaymentSummary = {
        id: data.payment.paymentId,
        tableId: target.tableId,
        invoiceNumber: data.payment.invoiceNumber,
        paidAtLabel: new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.payment.paidAt)),
        tableName: data.payment.tableName,
        amount: data.payment.grandTotal,
        status: "PAID",
        paymentMethod: data.payment.paymentMethod,
        confirmedByName: cashierName ?? null
      };
      setPaidPayments((current) => [payment, ...current.filter((item) => item.tableId !== target.tableId)]);
      await refreshTables();
      return payment;
    } finally {
      setPayingSessionId(null);
    }
  }

  async function confirmPaid(table: LiveTable) {
    if (!table.activeSession) return;
    const ok = window.confirm(`Xác nhận Bàn ${table.name} đã thanh toán ${formatVnd(table.activeSession.grandTotal)}?`);
    if (!ok) return;

    setMessage(null);
    try {
      await paySession(toPaymentTarget(table), "CASH");
      setMessage(`Đã thanh toán Bàn ${table.name}. Bàn đã trở về trạng thái trống.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xác nhận được thanh toán. Vui lòng thử lại.");
    }
  }

  function openPaymentAndPrint(table: LiveTable) {
    if (!table.activeSession) return;
    setPaymentDialogError(null);
    setPaymentMethod(state.settings.cashEnabled ? "CASH" : state.settings.qrPaymentEnabled ? "QR" : "");
    setPaymentDialog(toPaymentTarget(table));
  }

  async function confirmPaymentAndPrint() {
    if (!paymentDialog || !paymentMethod) return;
    setPaymentDialogError(null);
    setMessage(null);
    try {
      const payment = await paySession(paymentDialog, paymentMethod, true);
      setPaymentDialog(null);
      setPaymentMethod("");
      setMessage("Đã thanh toán thành công. Bàn đã được giải phóng.");

      const response = await fetch(`/api/restaurants/${slug}/reports/payments/${payment.id}`, { cache: "no-store" });
      if (!response.ok) {
        setMessage("Đã thanh toán thành công. Không tự mở được bill; bạn có thể in lại trong Lịch sử bill.");
        return;
      }
      setPaidBill(await response.json() as BillDetail);
    } catch (error) {
      setPaymentDialogError(error instanceof Error ? error.message : "Không thể bắt đầu thanh toán. Vui lòng thử lại.");
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <div className="flex flex-wrap items-center justify-between gap-3 xl:col-span-2">
        <div>
          <h2 className="font-semibold">Sơ đồ bàn</h2>
          <p className="text-sm text-slate-500">Chọn bàn để thao tác nhanh hoặc in bill.</p>
        </div>
        {canUsePayment ? <BillHistoryButton slug={slug} tables={tables.map((table) => ({ id: table.id, name: table.name }))} /> : null}
      </div>
      <div className="space-y-5">
        {status === "reconnecting" ? (
          <div className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
            Đang kết nối lại
          </div>
        ) : null}
        {message ? <p className="rounded-md border bg-white px-3 py-2 text-sm text-slate-700">{message}</p> : null}
        {state.areas.map((area) => (
          <section key={area.id} className="space-y-3">
            <h2 className="text-base font-semibold">{area.name}</h2>
            {area.tables.length ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {area.tables.map((table) => (
                  <TableSummaryCard
                    key={table.id}
                    table={table}
                    selected={selectedTable?.id === table.id}
                    onSelect={() => setSelectedTableId(table.id)}
                    onAddOrder={() => {
                      setSelectedTableId(table.id);
                      setOrderingTableId(table.id);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Khu vực này chưa có bàn.</p>
            )}
          </section>
        ))}
      </div>
      <TableDetail
        slug={slug}
        restaurantName={restaurantName}
        cashierName={cashierName}
        settings={state.settings}
        table={selectedTable}
        canUsePayment={canUsePayment}
        onConfirmPaid={confirmPaid}
        onPaymentAndPrint={openPaymentAndPrint}
        onRefresh={refreshTables}
        onAddOrder={() => setOrderingTableId(selectedTable?.id ?? null)}
        showQrTools={showQrTools}
        paymentPending={payingSessionId === selectedTable?.activeSession?.id}
        latestPaidPayment={paidPayments.find((payment) => payment.tableId === selectedTable?.id) ?? null}
      />
      {orderingTableId ? (
        <StaffAddOrderModal
          slug={slug}
          table={tables.find((table) => table.id === orderingTableId) ?? null}
          products={products}
          onClose={() => setOrderingTableId(null)}
          onCreated={async (text) => {
            setMessage(text);
            setOrderingTableId(null);
            await refreshTables();
          }}
        />
      ) : null}
      {paymentDialog ? (
        <PaymentAndPrintDialog
          target={paymentDialog}
          settings={state.settings}
          paymentMethod={paymentMethod}
          error={paymentDialogError}
          pending={payingSessionId === paymentDialog.sessionId}
          onPaymentMethodChange={setPaymentMethod}
          onCancel={() => {
            if (payingSessionId === paymentDialog.sessionId) return;
            setPaymentDialog(null);
            setPaymentDialogError(null);
            setPaymentMethod("");
          }}
          onConfirm={() => void confirmPaymentAndPrint()}
        />
      ) : null}
      {paidBill ? <BillDetailModal bill={paidBill} onClose={() => setPaidBill(null)} /> : null}
    </section>
  );
}

function TableSummaryCard({
  table,
  selected,
  onSelect,
  onAddOrder
}: {
  table: LiveTable;
  selected: boolean;
  onSelect: () => void;
  onAddOrder: () => void;
}) {
  const label = !table.isActive ? "Ngừng sử dụng" : tableStatusLabels[table.status] ?? table.status;
  const itemCount = table.activeSession?.itemCount ?? 0;
  const openRequests = table.activeSession?.serviceRequests.length ?? 0;
  const badgeClass = statusBadgeClass(table);
  const cardClass = statusCardClass(table);
  const summary = !table.activeSession
    ? "Chưa có khách"
    : table.status === "PAYMENT_REQUESTED"
      ? `Tổng: ${formatVnd(table.activeSession.grandTotal)}`
      : `${itemCount} món · ${formatVnd(table.activeSession.grandTotal)}`;

  return (
    <article className={`flex min-h-44 flex-col rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${cardClass} ${selected ? "ring-2 ring-teal-400" : ""}`}>
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 max-w-full truncate text-lg font-semibold leading-tight">Bàn {table.name}</h3>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass}`}>{label}</span>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <p className={table.activeSession ? "font-semibold text-slate-800" : "text-slate-500"}>{summary}</p>
        {table.activeSession ? (
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Bắt đầu {formatTime(table.activeSession.openedAt)}
          </p>
        ) : null}
        {openRequests > 0 ? (
          <p className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {openRequests} yêu cầu hỗ trợ
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <button className="rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={onSelect}>
          Xem bàn
        </button>
        <button className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-slate-300" type="button" onClick={onAddOrder} disabled={!table.isActive}>
          <Plus className="h-4 w-4" />
          Thêm món
        </button>
      </div>
    </article>
  );
}

function TableDetail({
  slug,
  restaurantName,
  cashierName,
  settings,
  table,
  canUsePayment,
  onConfirmPaid,
  onPaymentAndPrint,
  onRefresh,
  onAddOrder,
  showQrTools,
  paymentPending,
  latestPaidPayment
}: {
  slug: string;
  restaurantName: string;
  cashierName?: string | null;
  settings: TableState["settings"];
  table: LiveTable | null;
  canUsePayment: boolean;
  onConfirmPaid: (table: LiveTable) => void;
  onPaymentAndPrint: (table: LiveTable) => void;
  onRefresh: () => Promise<void>;
  onAddOrder: () => void;
  showQrTools: boolean;
  paymentPending: boolean;
  latestPaidPayment: PaymentSummary | null;
}) {
  if (!table) {
    return <aside className="rounded-lg border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Chưa có bàn để xem chi tiết.</p></aside>;
  }

  const session = table.activeSession;
  const guests = session ? Array.from(new Set([
    ...session.customers,
    ...session.serviceRequests.map((request) => request.customerName)
  ])).filter(Boolean) : [];
  const openRequestCount = session?.serviceRequests.length ?? 0;

  return (
    <aside className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Bàn {table.name} — {!table.isActive ? "Ngừng sử dụng" : tableStatusLabels[table.status] ?? table.status}</h2>
          <p className="text-sm text-slate-600">Khu vực: {table.areaName}</p>
        </div>
        {openRequestCount > 0 ? (
          <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{openRequestCount} yêu cầu</span>
        ) : null}
      </div>

      <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoLine label="Khách hiện tại" value={guests.length ? guests.join(", ") : "Chưa có khách"} />
          <InfoLine label="Số lượng món" value={session ? `${session.itemCount} món · ${session.orderCount} lượt gọi` : "0 món"} />
          <InfoLine label="Tổng tạm tính" value={session ? formatVnd(session.grandTotal) : formatVnd(0)} strong />
          <InfoLine label="Thanh toán" value={session?.paymentStatus === "PENDING" ? "Chờ xác nhận" : session?.paymentStatus === "PAID" ? "Đã thanh toán" : "Chưa thanh toán"} />
          <InfoLine label="Bắt đầu phục vụ" value={session ? formatTime(session.openedAt) : "Chưa mở phiên"} />
          <InfoLine label="Yêu cầu hỗ trợ" value={openRequestCount > 0 ? `${openRequestCount} đang mở` : "Không có"} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-slate-300" type="button" disabled={!table.isActive} onClick={onAddOrder}>
          <Plus className="h-4 w-4" />
          Thêm món
        </button>
        <Link className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" href={session ? `${restaurantRoutes.adminOrders(slug)}?session=${session.id}` : restaurantRoutes.adminOrders(slug)}>
          Xem Order
        </Link>
        {session ? (
          <InvoicePrintButton label="In phiếu tạm tính" invoice={{
            restaurantName,
            businessName: settings.invoiceBusinessName ?? restaurantName,
            taxCode: settings.invoiceTaxCode,
            address: settings.address,
            phone: settings.phone,
            email: settings.invoiceEmail,
            invoiceNumber: null,
            tableName: table.name,
            areaName: table.areaName,
            cashierName,
            openedAt: new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(new Date(session.openedAt)),
            paidAt: null,
            status: session.paymentStatus === "PENDING" ? "PENDING" : "UNPAID",
            paymentMethod: null,
            subtotal: session.subtotal,
            taxRate: session.taxRate,
            taxAmount: session.taxAmount,
            grandTotal: session.grandTotal,
            items: session.items,
            paymentQr: {
              enabled: settings.qrPaymentEnabled,
              imageUrl: settings.paymentQrImage,
              bankName: settings.bankName,
              accountNumber: settings.accountNumber,
              accountHolder: settings.accountHolder,
              transferContent: settings.paymentTransferContent || `Bàn ${table.name}`
            }
          }} />
        ) : null}
        {!session && latestPaidPayment ? (
          <PaidBillButton slug={slug} paymentId={latestPaidPayment.id} label="In bill gần nhất" />
        ) : null}
        {canUsePayment && session && session.itemCount > 0 ? (
          <button
            className="rounded-md border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={paymentPending}
            onClick={() => onPaymentAndPrint(table)}
          >
            In bill thanh toán
          </button>
        ) : null}
        {canUsePayment && session ? (
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            type="button"
            disabled={paymentPending}
            onClick={() => onConfirmPaid(table)}
          >
            {paymentPending ? "Đang lưu..." : "Thanh toán"}
          </button>
        ) : null}
      </div>

      {!session ? (
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Bàn đang trống, chưa có phiên phục vụ.</p>
      ) : null}

      {showQrTools ? (
        <details className="mt-5">
          <summary className="cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">Xem QR / Tải / In</summary>
          <div className="mt-3">
            <QrCard
              restaurantName={restaurantName}
              tableName={table.name}
              tableId={table.id}
              slug={slug}
              qrDataUrl={table.qrDataUrl}
              qrUrl={table.qrUrl}
              onRegenerated={onRefresh}
            />
          </div>
        </details>
      ) : null}
    </aside>
  );
}

function PaymentAndPrintDialog({
  target,
  settings,
  paymentMethod,
  error,
  pending,
  onPaymentMethodChange,
  onCancel,
  onConfirm
}: {
  target: PaymentTarget;
  settings: TableState["settings"];
  paymentMethod: PaymentMethod | "";
  error: string | null;
  pending: boolean;
  onPaymentMethodChange: (method: PaymentMethod | "") => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const paymentMethods: PaymentMethod[] = [
    ...(settings.cashEnabled ? ["CASH" as const] : []),
    ...(settings.qrPaymentEnabled ? ["QR" as const] : [])
  ];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, pending]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-print-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div className="w-full max-w-lg rounded-t-xl bg-white shadow-2xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Thanh toán và in</p>
            <h2 className="mt-1 text-lg font-semibold" id="payment-print-title">Xác nhận thanh toán và in bill</h2>
          </div>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-slate-50 disabled:opacity-50" type="button" disabled={pending} onClick={onCancel} aria-label="Đóng xác nhận thanh toán">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <InfoLine label="Bàn" value={`Bàn ${target.tableName}`} />
            <InfoLine label="Số lượng món" value={`${target.itemCount} món`} />
            <div className="sm:col-span-2">
              <InfoLine label="Tổng tiền cần thu" value={formatVnd(target.grandTotal)} strong />
            </div>
          </div>

          <label className="block text-sm font-semibold">
            Phương thức thanh toán
            <select
              className="mt-2 h-11 w-full rounded-md border bg-white px-3 font-normal outline-none focus:border-teal-600"
              value={paymentMethod}
              disabled={pending}
              onChange={(event) => onPaymentMethodChange(event.target.value as PaymentMethod | "")}
            >
              <option value="">Chọn phương thức</option>
              {paymentMethods.map((method) => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}
            </select>
          </label>

          {!paymentMethods.length ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Chưa có phương thức thanh toán được bật trong Cài đặt.</p>
          ) : null}
          <p className="text-sm leading-6 text-slate-600">Bạn xác nhận đã nhận thanh toán cho bàn này? Sau khi hoàn tất, bill sẽ được mở để in và bàn sẽ trở về trạng thái trống.</p>
          {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end">
          <button className="rounded-md border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50" type="button" disabled={pending} onClick={onCancel}>Hủy</button>
          <button className="rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" type="button" disabled={pending || !paymentMethod} onClick={onConfirm}>
            {pending ? "Đang xử lý..." : "Xác nhận thanh toán & In bill"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StaffAddOrderModal({
  slug,
  table,
  products,
  onClose,
  onCreated
}: {
  slug: string;
  table: LiveTable | null;
  products: MenuProduct[];
  onClose: () => void;
  onCreated: (message: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cartItems = Object.values(cart);
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const filteredProducts = products.filter((product) => {
    const keyword = query.trim().toLowerCase();
    return !keyword || product.nameVi.toLowerCase().includes(keyword) || (product.descriptionVi ?? "").toLowerCase().includes(keyword);
  });

  function add(product: MenuProduct) {
    if (product.isSoldOut) return;
    setCart((current) => ({
      ...current,
      [product.id]: {
        ...product,
        quantity: (current[product.id]?.quantity ?? 0) + 1,
        note: current[product.id]?.note ?? ""
      }
    }));
  }

  function updateQuantity(productId: string, nextQuantity: number) {
    setCart((current) => {
      const existing = current[productId];
      if (!existing) return current;
      if (nextQuantity <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: { ...existing, quantity: Math.min(99, nextQuantity) } };
    });
  }

  function updateNote(productId: string, note: string) {
    setCart((current) => {
      const existing = current[productId];
      if (!existing) return current;
      return { ...current, [productId]: { ...existing, note } };
    });
  }

  async function submit() {
    if (!table || totalQuantity === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/restaurants/${slug}/admin/tables/${table.id}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          items: cartItems.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            note: item.note || undefined
          }))
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Không thể thêm món.");
      }
      await onCreated(`Đã thêm order #${data.orderNumber} vào Bàn ${table.name}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể thêm món.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!table) return null;

  return (
    <div aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" role="dialog">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <p className="text-sm font-semibold text-teal-700">Thêm món trực tiếp</p>
            <h2 className="text-xl font-semibold">Bàn {table.name}</h2>
            <p className="text-sm text-slate-500">{table.areaName} · món sẽ vào cùng phiên phục vụ hiện tại</p>
          </div>
          <button className="rounded-md border p-2 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60" type="button" disabled={isSubmitting} onClick={onClose} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-82px)] overflow-y-auto md:grid-cols-[1fr_320px]">
          <div className="space-y-3 p-4">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-11 w-full rounded-md border pl-9 pr-3 outline-none focus:border-teal-600"
                placeholder="Tìm món..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredProducts.map((product) => {
                const quantity = cart[product.id]?.quantity ?? 0;
                return (
                  <article key={product.id} className="rounded-lg border p-3">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 rounded-md bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {product.imageUrl ? <img alt={product.nameVi} className="h-full w-full rounded-md object-cover" src={servedUploadUrl(product.imageUrl) ?? product.imageUrl} /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{product.nameVi}</p>
                        <p className="text-sm font-semibold text-teal-700">{formatVnd(product.price)}</p>
                        {product.descriptionVi ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{product.descriptionVi}</p> : null}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {product.isSoldOut ? (
                        <span className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500">Hết món</span>
                      ) : quantity > 0 ? (
                        <div className="flex items-center gap-2">
                          <button className="h-9 w-9 rounded-md border" type="button" onClick={() => updateQuantity(product.id, quantity - 1)}>-</button>
                          <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
                          <button className="h-9 w-9 rounded-md bg-teal-700 text-white" type="button" onClick={() => add(product)}>+</button>
                        </div>
                      ) : (
                        <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => add(product)}>
                          Thêm
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="border-t bg-slate-50 p-4 md:border-l md:border-t-0">
            <h3 className="font-semibold">Giỏ món tạm</h3>
            {cartItems.length ? (
              <div className="mt-3 space-y-3">
                {cartItems.map((item) => (
                  <div key={item.id} className="rounded-md bg-white p-3 text-sm shadow-sm">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.nameVi}</p>
                        <p className="text-xs text-slate-500">{item.quantity} x {formatVnd(item.price)}</p>
                      </div>
                      <p className="font-semibold">{formatVnd(item.price * item.quantity)}</p>
                    </div>
                    <input
                      className="mt-2 h-9 w-full rounded-md border px-2 text-sm"
                      placeholder="Ghi chú món"
                      value={item.note}
                      onChange={(event) => updateNote(item.id, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-md bg-white p-3 text-sm text-slate-500">Chưa chọn món.</p>
            )}
            {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-4 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>{totalQuantity} món</span>
                <span className="text-lg font-bold text-teal-700">{formatVnd(totalAmount)}</span>
              </div>
              <button
                className="mt-3 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-slate-300"
                type="button"
                disabled={totalQuantity === 0 || isSubmitting}
                onClick={submit}
              >
                {isSubmitting ? "Đang gửi..." : "Xác nhận gọi món"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={strong ? "font-bold text-teal-700" : "font-semibold text-slate-900"}>{value}</p>
    </div>
  );
}

function toPaymentTarget(table: LiveTable): PaymentTarget {
  if (!table.activeSession) throw new Error("Bàn không còn phiên phục vụ đang mở.");
  return {
    tableId: table.id,
    tableName: table.name,
    sessionId: table.activeSession.id,
    itemCount: table.activeSession.itemCount,
    grandTotal: table.activeSession.grandTotal
  };
}

function statusBadgeClass(table: LiveTable) {
  if (!table.isActive) return "border-slate-200 bg-slate-50 text-slate-600";
  if ((table.activeSession?.serviceRequests.length ?? 0) > 0) return "border-red-200 bg-red-50 text-red-700";
  if (table.status === "PAYMENT_REQUESTED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (table.status === "AVAILABLE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function statusCardClass(table: LiveTable) {
  if (!table.isActive) return "border-slate-200 bg-slate-50";
  if ((table.activeSession?.serviceRequests.length ?? 0) > 0) return "border-red-200 bg-red-50/60";
  if (table.status === "PAYMENT_REQUESTED") return "border-amber-200 bg-amber-50/70";
  if (table.status === "AVAILABLE") return "border-emerald-200 bg-emerald-50/60";
  return "border-sky-200 bg-sky-50/60";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}
