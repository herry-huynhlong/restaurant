"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatVnd } from "@/lib/money";
import { InvoicePrintButton } from "@/components/billing/invoice-print-button";
import { QrCard } from "@/components/admin/qr-card";

type TableState = {
  settings: {
    taxEnabled: boolean;
    taxRate: number;
    invoiceBusinessName: string | null;
    invoiceTaxCode: string | null;
    invoiceEmail: string | null;
    invoiceDisplayName: string | null;
    address: string | null;
    phone: string | null;
  };
  areas: Array<{
    id: string;
    name: string;
    sortOrder: number;
    tables: LiveTable[];
  }>;
};

type LiveTable = {
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
    orders: Array<{
      id: string;
      orderNumber: number;
      customerName: string;
      status: string;
      subtotal: number;
      createdAt: string;
      items: Array<{
        id: string;
        name: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }>;
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
  initialState,
  initialSelectedTableId
}: {
  slug: string;
  restaurantName: string;
  cashierName?: string | null;
  canUsePayment: boolean;
  initialState: TableState;
  initialSelectedTableId?: string | null;
}) {
  const [state, setState] = useState(initialState);
  const [selectedTableId, setSelectedTableId] = useState(initialSelectedTableId ?? initialState.areas[0]?.tables[0]?.id ?? null);
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const [payingSessionId, setPayingSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const tables = useMemo(() => state.areas.flatMap((area) => area.tables), [state.areas]);
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0] ?? null;

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

  async function confirmPaid(table: LiveTable) {
    if (!table.activeSession) return;
    const ok = window.confirm(`Xác nhận Bàn ${table.name} đã thanh toán ${formatVnd(table.activeSession.grandTotal)}?`);
    if (!ok) return;

    setPayingSessionId(table.activeSession.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/restaurants/${slug}/ops/pay-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diningSessionId: table.activeSession.id,
          paymentMethod: "CASH"
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("CONFIRM PAYMENT RESPONSE", {
          status: response.status,
          data
        });
        throw new Error(data.message || data.error || `Không xác nhận được thanh toán (${response.status}).`);
      }

      const data = await response.json().catch(() => ({}));
      console.log("CONFIRM PAYMENT RESPONSE", {
        status: response.status,
        data
      });
      setMessage(`Đã thanh toán Bàn ${table.name}. Bàn đã trở về trạng thái trống.`);
      await refreshTables();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xác nhận được thanh toán.");
    } finally {
      setPayingSessionId(null);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <div className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status === "live" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
          {status === "live" ? "Live" : "Đang kết nối lại"}
        </div>
        {message ? <p className="rounded-md border bg-white px-3 py-2 text-sm text-slate-700">{message}</p> : null}
        {state.areas.map((area) => (
          <section key={area.id} className="space-y-3">
            <h2 className="text-base font-semibold">{area.name}</h2>
            {area.tables.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {area.tables.map((table) => (
                  <TableSummaryCard
                    key={table.id}
                    table={table}
                    selected={selectedTable?.id === table.id}
                    onSelect={() => setSelectedTableId(table.id)}
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
        onRefresh={refreshTables}
        paymentPending={payingSessionId === selectedTable?.activeSession?.id}
      />
    </section>
  );
}

function TableSummaryCard({ table, selected, onSelect }: { table: LiveTable; selected: boolean; onSelect: () => void }) {
  const label = !table.isActive ? "Ngừng sử dụng" : tableStatusLabels[table.status] ?? table.status;
  const paymentLabel = table.activeSession?.paymentStatus === "PENDING" ? "Chờ xác nhận" : table.activeSession?.paymentStatus === "PAID" ? "Đã thanh toán" : "Chưa thanh toán";
  const badgeClass = !table.isActive
    ? "bg-slate-100 text-slate-600"
    : table.status === "PAYMENT_REQUESTED"
      ? "bg-amber-50 text-amber-700"
      : table.status === "AVAILABLE"
        ? "bg-slate-100 text-slate-700"
        : "bg-teal-50 text-teal-700";

  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm ${selected ? "ring-2 ring-teal-600" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Bàn {table.name}</h3>
          <p className="text-sm text-slate-600">{table.areaName}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>{label}</span>
      </div>
      {table.activeSession ? (
        <div className="mt-4 space-y-1 text-sm text-slate-600">
          <p>Thanh toán: <span className="font-semibold">{paymentLabel}</span></p>
          <p>Tổng: <span className="font-bold text-teal-700">{formatVnd(table.activeSession.grandTotal)}</span></p>
        </div>
      ) : null}
      <button className="mt-4 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={onSelect}>
        Xem bàn
      </button>
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
  onRefresh,
  paymentPending
}: {
  slug: string;
  restaurantName: string;
  cashierName?: string | null;
  settings: TableState["settings"];
  table: LiveTable | null;
  canUsePayment: boolean;
  onConfirmPaid: (table: LiveTable) => void;
  onRefresh: () => Promise<void>;
  paymentPending: boolean;
}) {
  if (!table) {
    return <aside className="rounded-lg border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Chưa có bàn để xem chi tiết.</p></aside>;
  }

  const session = table.activeSession;
  const guests = session ? Array.from(new Set([
    ...session.orders.map((order) => order.customerName),
    ...session.serviceRequests.map((request) => request.customerName)
  ])).filter(Boolean) : [];

  return (
    <aside className="rounded-lg border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">Bàn {table.name}</h2>
        <p className="text-sm text-slate-600">{table.areaName}</p>
      </div>
      <div className="mt-4 rounded-md bg-slate-50 p-3">
        <p className="text-sm text-slate-600">Trạng thái</p>
        <p className="font-semibold">{!table.isActive ? "Ngừng sử dụng" : tableStatusLabels[table.status] ?? table.status}</p>
        <p className="mt-2 text-sm text-slate-600">Thanh toán</p>
        <p className="font-semibold">{session?.paymentStatus === "PENDING" ? "Chờ xác nhận" : session?.paymentStatus === "PAID" ? "Đã thanh toán" : "Chưa thanh toán"}</p>
      </div>

      {session ? (
        <>
          <section className="mt-4">
            <h3 className="font-semibold">Khách hiện tại</h3>
            <p className="mt-2 text-sm text-slate-600">{guests.length ? guests.join(", ") : "Chưa có tên khách."}</p>
          </section>
          <section className="mt-4">
            <h3 className="font-semibold">Món đang gọi</h3>
            {session.orders.length ? (
              <div className="mt-2 space-y-3">
                {session.orders.map((order) => (
                  <div key={order.id} className="rounded-md bg-slate-50 p-3">
                    <p className="text-sm font-semibold">Order #{order.orderNumber} · {order.customerName} · {order.status}</p>
                    <ul className="mt-2 divide-y text-sm">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 py-1.5">
                          <span>{item.quantity} x {item.name}</span>
                          <span>{formatVnd(item.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Chưa có món nào.</p>}
          </section>
          <section className="mt-4">
            <h3 className="font-semibold">Service requests</h3>
            {session.serviceRequests.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {session.serviceRequests.map((request) => (
                  <li key={request.id} className="rounded-md bg-amber-50 p-2 text-amber-800">
                    {requestLabels[request.type] ?? request.type} · {request.customerName}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">Không có yêu cầu đang mở.</p>}
          </section>
          <div className="mt-4 space-y-2 border-t pt-4">
            <div className="flex justify-between"><span className="font-semibold">Tạm tính</span><span className="font-semibold">{formatVnd(session.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-slate-600">Thuế {session.taxRate}%</span><span className="font-semibold">{formatVnd(session.taxAmount)}</span></div>
            <div className="flex justify-between"><span className="font-semibold">Tổng thanh toán</span><span className="text-2xl font-bold text-teal-700">{formatVnd(session.grandTotal)}</span></div>
          </div>
          {canUsePayment ? <div className="mt-4 grid gap-3 border-t pt-4">
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Phương thức hiện tại: tiền mặt</p>
            <div className="grid grid-cols-2 gap-2">
            <InvoicePrintButton label="In bill" invoice={{
              restaurantName,
              businessName: settings.invoiceBusinessName ?? restaurantName,
              taxCode: settings.invoiceTaxCode,
              address: settings.address,
              phone: settings.phone,
              email: settings.invoiceEmail,
              invoiceNumber: null,
              tableName: table.name,
              cashierName,
              paidAt: null,
              status: session.paymentStatus === "PENDING" ? "PENDING" : "UNPAID",
              paymentMethod: null,
              subtotal: session.subtotal,
              taxRate: session.taxRate,
              taxAmount: session.taxAmount,
              grandTotal: session.grandTotal,
              items: session.orders.flatMap((order) => order.items)
            }} />
              <button
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                type="button"
                disabled={paymentPending}
                onClick={() => onConfirmPaid(table)}
              >
                {paymentPending ? "Đang lưu..." : "Đã thanh toán"}
              </button>
            </div>
          </div> : null}
        </>
      ) : (
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Bàn đang trống, chưa có phiên phục vụ.</p>
      )}

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
    </aside>
  );
}
