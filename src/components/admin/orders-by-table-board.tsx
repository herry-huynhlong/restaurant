"use client";

import { useEffect, useState } from "react";
import { InvoicePrintButton } from "@/components/billing/invoice-print-button";
import { StaffAddOrderModal, type LiveTable, type MenuProduct } from "@/components/admin/tables-live-panel";
import type { ActiveTableOrder } from "@/server/services/order-board-service";

const requestLabels: Record<string, { label: string; tone: string }> = {
  CALL_STAFF: { label: "Gọi nhân viên", tone: "border-red-100 bg-red-50 text-red-700" },
  REQUEST_WATER: { label: "Xin nước", tone: "border-sky-100 bg-sky-50 text-sky-700" },
  REQUEST_UTENSILS: { label: "Xin dụng cụ", tone: "border-amber-100 bg-amber-50 text-amber-700" },
  REQUEST_PAYMENT: { label: "Yêu cầu thanh toán", tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  OTHER: { label: "Hỗ trợ", tone: "border-slate-100 bg-slate-50 text-slate-700" }
};

const orderStatusLabels: Record<string, string> = {
  NEW: "Mới",
  CONFIRMED: "Đã nhận",
  PREPARING: "Đang làm",
  READY: "Sẵn sàng",
  SERVED: "Đã phục vụ"
};

const itemStatusLabels: Record<string, string> = {
  NEW: "Mới",
  COOKING: "Đang làm",
  READY: "Sẵn sàng",
  SERVED: "Đã phục vụ"
};

export function OrdersByTableBoard({
  slug,
  restaurantName,
  initialTables,
  initialExpandedSessionId,
  products = [],
  enableAddOrder = false
}: {
  slug: string;
  restaurantName: string;
  initialTables: ActiveTableOrder[];
  initialExpandedSessionId?: string;
  products?: MenuProduct[];
  enableAddOrder?: boolean;
}) {
  const [tables, setTables] = useState(initialTables);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Record<string, boolean>>(
    initialExpandedSessionId ? { [initialExpandedSessionId]: true } : {}
  );
  const [expandedHistorySessionIds, setExpandedHistorySessionIds] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [orderingTable, setOrderingTable] = useState<LiveTable | null>(null);

  useEffect(() => {
    const liveSessionIds = new Set(tables.map((table) => table.diningSessionId));
    setExpandedSessionIds((current) => pruneMissingSessionIds(current, liveSessionIds));
    setExpandedHistorySessionIds((current) => pruneMissingSessionIds(current, liveSessionIds));
  }, [tables]);

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
    <section className="space-y-4">
      {message ? (
        <p className={`rounded-md border px-3 py-2 text-sm ${message.type === "success" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {tables.map((table) => {
          const isExpanded = expandedSessionIds[table.diningSessionId] ?? false;
          const isHistoryExpanded = expandedHistorySessionIds[table.diningSessionId] ?? false;
          const shownItems = table.items.slice(0, 5);
          const hiddenItemCount = Math.max(0, table.items.length - shownItems.length);

          return (
            <article id={`session-${table.diningSessionId}`} key={table.diningSessionId} className={`rounded-xl border bg-white p-4 shadow-sm transition hover:border-slate-300 ${initialExpandedSessionId === table.diningSessionId ? "border-teal-300 ring-2 ring-teal-100" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">Bàn {table.tableName}</h2>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tableBadgeClass(table)}`}>
                      {tableStatusLabel(table)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {table.areaName} · {table.orders.length} lượt gọi · mở lúc {formatTime(table.openedAt)}
                  </p>
                </div>
                <p className="text-xl font-bold text-teal-700">{formatMoney(table.totalAmount)}</p>
              </div>

              <div className="mt-4 space-y-2">
                {shownItems.map((item) => (
                  <div key={`${item.productName}-${item.unitPrice}`} className="grid grid-cols-[1fr_52px_96px] items-center gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{item.productName}</span>
                    <span className="text-center tabular-nums">{item.quantity}</span>
                    <span className="text-right font-semibold tabular-nums">{formatMoney(item.subtotal)}</span>
                  </div>
                ))}
                {hiddenItemCount > 0 ? <p className="text-sm text-slate-500">+ {hiddenItemCount} món khác</p> : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span>{table.items.length} món</span>
                  {table.requests.length > 0 ? (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                      {table.requests.length} yêu cầu
                    </span>
                  ) : null}
                </div>
                <button
                  className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  type="button"
                  onClick={() => setExpandedSessionIds((current) => ({
                    ...current,
                    [table.diningSessionId]: !isExpanded
                  }))}
                >
                  {isExpanded ? "Ẩn chi tiết" : "Xem chi tiết"}
                </button>
                {enableAddOrder ? (
                  <button
                    className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                    type="button"
                    onClick={() => setOrderingTable(activeTableOrderToLiveTable(table))}
                  >
                    + Thêm món
                  </button>
                ) : null}
              </div>

              {isExpanded ? (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold">Tổng hợp món</h3>
                      <InvoicePrintButton
                        label="In phiếu tạm tính"
                        invoice={{
                          restaurantName,
                          tableName: table.tableName,
                          areaName: table.areaName,
                          openedAt: formatTime(table.openedAt),
                          status: table.paymentStatus === "PENDING" ? "PENDING" : "UNPAID",
                          subtotal: table.totalAmount,
                          taxRate: 0,
                          taxAmount: 0,
                          grandTotal: table.totalAmount,
                          items: table.items.map((item) => ({
                            id: `${item.productName}-${item.unitPrice}`,
                            name: item.productName,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            subtotal: item.subtotal
                          }))
                        }}
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      {table.items.map((item) => (
                        <div key={`${item.productName}-${item.unitPrice}-detail`} className="grid grid-cols-[1fr_48px_92px_104px] items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm max-sm:grid-cols-[1fr_44px_96px]">
                          <span className="min-w-0 font-medium">{item.productName}</span>
                          <span className="text-center tabular-nums">{item.quantity}</span>
                          <span className="text-right text-slate-600 tabular-nums max-sm:hidden">{formatMoney(item.unitPrice)}</span>
                          <span className="text-right font-semibold tabular-nums">{formatMoney(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">Yêu cầu khách</h3>
                      {table.requests.length > 0 ? <span className="text-sm font-semibold text-red-700">{table.requests.length} đang chờ</span> : null}
                    </div>
                    {table.requests.length ? (
                      <div className="mt-3 space-y-2">
                        {table.requests.map((request) => {
                          const label = requestLabels[request.requestType] ?? requestLabels.OTHER;
                          return (
                            <article key={request.id} className={`rounded-md border p-3 ${label.tone}`}>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-semibold">{label.label}</p>
                                  <p className="mt-1 text-xs opacity-80">
                                    {request.customerName} · {formatTime(request.createdAt)} · {request.status === "NEW" ? "Chờ xử lý" : "Đã nhận"}
                                  </p>
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
                      <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">Không có yêu cầu đang chờ.</p>
                    )}
                  </section>

                  <section>
                    <button
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50"
                      type="button"
                      onClick={() => setExpandedHistorySessionIds((current) => ({ ...current, [table.diningSessionId]: !isHistoryExpanded }))}
                    >
                      <span>Lịch sử gọi món</span>
                      <span>{isHistoryExpanded ? "Ẩn" : `${table.orders.length} lượt`}</span>
                    </button>

                    {isHistoryExpanded ? (
                      <div className="mt-3 space-y-3">
                        {table.orders.map((order) => (
                          <article key={order.id} className="rounded-md border p-3">
                            <div className="flex flex-wrap justify-between gap-2">
                              <div>
                                <p className="font-semibold">Order #{order.orderNumber} - {formatTime(order.createdAt)}</p>
                                <p className="text-xs text-slate-500">{order.customerName} · {orderStatusLabels[order.status] ?? order.status}</p>
                              </div>
                              <p className="font-semibold">{formatMoney(order.subtotal)}</p>
                            </div>
                            <ul className="mt-3 space-y-2 text-sm">
                              {order.items.map((item) => (
                                <li key={item.id} className="rounded-md bg-slate-50 px-3 py-2">
                                  <div className="grid grid-cols-[1fr_44px_92px] gap-2">
                                    <span className="min-w-0">{item.productName}</span>
                                    <span className="text-center tabular-nums">{item.quantity}</span>
                                    <span className="text-right font-semibold tabular-nums">{formatMoney(item.subtotal)}</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span>{formatMoney(item.unitPrice)} / món</span>
                                    <span>{itemStatusLabels[item.status] ?? item.status}</span>
                                  </div>
                                  {item.note ? <p className="mt-1 text-xs text-slate-500">Ghi chú: {item.note}</p> : null}
                                </li>
                              ))}
                            </ul>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {orderingTable ? (
        <StaffAddOrderModal
          slug={slug}
          table={orderingTable}
          products={products}
          onClose={() => setOrderingTable(null)}
          onCreated={async (text) => {
            setMessage({ type: "success", text });
            setOrderingTable(null);
            const response = await fetch(`/api/restaurants/${slug}/admin/orders/state`, { cache: "no-store" });
            if (response.ok) {
              const data = await response.json() as { tables: ActiveTableOrder[] };
              setTables(data.tables);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function activeTableOrderToLiveTable(table: ActiveTableOrder): LiveTable {
  return {
    id: table.tableId,
    areaId: "",
    areaName: table.areaName,
    name: table.tableName,
    status: table.status,
    isActive: true,
    qrUrl: "",
    qrDataUrl: "",
    activeSession: {
      id: table.diningSessionId,
      status: table.status,
      paymentStatus: table.paymentStatus,
      openedAt: table.openedAt,
      subtotal: table.totalAmount,
      taxRate: 0,
      taxAmount: 0,
      grandTotal: table.totalAmount,
      itemCount: table.items.reduce((sum, item) => sum + item.quantity, 0),
      orderCount: table.orders.length,
      customers: Array.from(new Set(table.orders.map((order) => order.customerName).filter(Boolean))),
      items: table.items.map((item) => ({
        id: `${item.productName}-${item.unitPrice}`,
        name: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal
      })),
      serviceRequests: table.requests.map((request) => ({
        id: request.id,
        type: request.requestType,
        customerName: request.customerName,
        status: request.status,
        createdAt: request.createdAt
      }))
    }
  };
}

function tableStatusLabel(table: ActiveTableOrder) {
  if (table.status === "AWAITING_PAYMENT" || table.paymentStatus === "PENDING") return "Chờ thanh toán";
  return "Đang phục vụ";
}

function tableBadgeClass(table: ActiveTableOrder) {
  if (table.status === "AWAITING_PAYMENT" || table.paymentStatus === "PENDING") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-teal-50 text-teal-700";
}

function pruneMissingSessionIds(current: Record<string, boolean>, liveSessionIds: Set<string>) {
  const next: Record<string, boolean> = {};
  for (const [sessionId, isOpen] of Object.entries(current)) {
    if (isOpen && liveSessionIds.has(sessionId)) {
      next[sessionId] = true;
    }
  }
  return next;
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
