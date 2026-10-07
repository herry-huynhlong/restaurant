"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActiveTableOrder } from "@/server/services/order-board-service";

const requestLabels: Record<string, { icon: string; label: string; tone: string }> = {
  CALL_STAFF: { icon: "🔔", label: "Gọi nhân viên", tone: "bg-red-50 text-red-700 border-red-100" },
  REQUEST_WATER: { icon: "💧", label: "Xin nước", tone: "bg-sky-50 text-sky-700 border-sky-100" },
  REQUEST_UTENSILS: { icon: "🍴", label: "Xin dụng cụ", tone: "bg-amber-50 text-amber-700 border-amber-100" },
  REQUEST_PAYMENT: { icon: "💵", label: "Yêu cầu thanh toán", tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  OTHER: { icon: "📝", label: "Hỗ trợ", tone: "bg-slate-50 text-slate-700 border-slate-100" }
};

export function OrdersByTableBoard({
  slug,
  initialTables
}: {
  slug: string;
  initialTables: ActiveTableOrder[];
}) {
  const [tables, setTables] = useState(initialTables);
  const [selectedSessionId, setSelectedSessionId] = useState(initialTables[0]?.diningSessionId ?? "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const selectedTable = useMemo(
    () => tables.find((table) => table.diningSessionId === selectedSessionId) ?? tables[0] ?? null,
    [selectedSessionId, tables]
  );

  useEffect(() => {
    if (!selectedTable && tables[0]) {
      setSelectedSessionId(tables[0].diningSessionId);
    }
  }, [selectedTable, tables]);

  useEffect(() => {
    let isMounted = true;

    async function loadState() {
      try {
        const response = await fetch(`/api/restaurants/${slug}/admin/orders/state`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { tables: ActiveTableOrder[] };
        if (isMounted) {
          setTables(data.tables);
        }
      } catch {
        // Keep the last good state on transient network errors.
      }
    }

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/restaurants/${slug}/notifications/stream`);
      eventSource.addEventListener("notification", () => void loadState());
    } catch {
      // Polling below is the fallback.
    }

    const interval = window.setInterval(loadState, 5000);
    return () => {
      isMounted = false;
      eventSource?.close();
      window.clearInterval(interval);
    };
  }, [slug]);

  async function completeRequest(requestId: string) {
    const previousTables = tables;
    setProcessingRequestId(requestId);
    setMessage(null);
    setTables((current) => current.map((table) => ({
      ...table,
      requests: table.requests.filter((request) => request.id !== requestId)
    })));

    try {
      const response = await fetch(`/api/restaurants/${slug}/admin/orders/requests/${requestId}`, {
        method: "PATCH"
      });
      if (!response.ok) throw new Error("request_failed");
      setMessage({ type: "success", text: "Đã xử lý yêu cầu." });
    } catch {
      setTables(previousTables);
      setMessage({ type: "error", text: "Không thể cập nhật yêu cầu." });
    } finally {
      setProcessingRequestId(null);
    }
  }

  if (!tables.length) {
    return (
      <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold">Chưa có bàn đang gọi món</h2>
        <p className="mt-2 text-sm text-slate-600">Khi khách tạo order, bàn sẽ tự xuất hiện tại đây.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
      <div className="space-y-3">
        {message ? (
          <p className={`rounded-md border px-3 py-2 text-sm ${message.type === "success" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {message.text}
          </p>
        ) : null}
        {tables.map((table) => {
          const isSelected = table.diningSessionId === selectedTable?.diningSessionId;
          const requestCount = table.requests.length;
          return (
            <button
              key={table.diningSessionId}
              className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm transition ${isSelected ? "border-teal-600 ring-1 ring-teal-600" : "hover:border-slate-300"}`}
              type="button"
              onClick={() => setSelectedSessionId(table.diningSessionId)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Bàn {table.tableName}</h2>
                  <p className="mt-1 text-sm text-slate-500">{table.areaName}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-teal-700">{formatMoney(table.totalAmount)}</p>
                  {requestCount > 0 ? <p className="mt-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">🔴 {requestCount} yêu cầu</p> : null}
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {table.items.map((item) => (
                  <li key={`${item.productName}-${item.unitPrice}`} className="flex justify-between gap-3">
                    <span>{item.quantity} x {item.productName}</span>
                    <span className="shrink-0 text-slate-600">{formatMoney(item.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">{table.orders.length} order trong phiên hiện tại</p>
            </button>
          );
        })}
      </div>

      <aside className="rounded-lg border bg-white p-4 shadow-sm">
        {selectedTable ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
              <div>
                <h2 className="text-lg font-semibold">Chi tiết bàn {selectedTable.tableName}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedTable.areaName}</p>
              </div>
              <p className="text-lg font-semibold text-teal-700">{formatMoney(selectedTable.totalAmount)}</p>
            </div>

            <div className="mt-4 space-y-4">
              <section className="rounded-md border p-3">
                <h3 className="font-semibold">Yêu cầu</h3>
                {selectedTable.requests.length ? (
                  <div className="mt-3 space-y-2">
                    {selectedTable.requests.map((request) => {
                      const label = requestLabels[request.requestType] ?? requestLabels.OTHER;
                      return (
                        <article key={request.id} className={`rounded-md border p-3 ${label.tone}`}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">{label.icon} {label.label}</p>
                              <p className="mt-1 text-xs opacity-80">{formatTime(request.createdAt)} · {request.status === "NEW" ? "Chờ xử lý" : "Đã nhận"}</p>
                              {request.message ? <p className="mt-2 text-sm">{request.message}</p> : null}
                            </div>
                            <button
                              className="min-h-10 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm disabled:opacity-60"
                              type="button"
                              disabled={processingRequestId === request.id}
                              onClick={() => void completeRequest(request.id)}
                            >
                              Đã xử lý
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Không có yêu cầu đang chờ.</p>
                )}
              </section>

              <h3 className="font-semibold">Món đang gọi</h3>
              {selectedTable.orders.map((order) => (
                <article key={order.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">Order #{order.orderNumber}</p>
                      <p className="text-xs text-slate-500">{order.customerName} · {formatTime(order.createdAt)}</p>
                    </div>
                    <p className="font-semibold">{formatMoney(order.subtotal)}</p>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <div className="flex justify-between gap-3">
                          <span>{item.quantity} x {item.productName}</span>
                          <span className="shrink-0">{formatMoney(item.subtotal)}</span>
                        </div>
                        {item.note ? <p className="mt-1 text-xs text-slate-500">Ghi chú: {item.note}</p> : null}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </aside>
    </section>
  );
}

function formatMoney(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}
