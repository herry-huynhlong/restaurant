"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { InvoicePrintButton } from "@/components/billing/invoice-print-button";
import { StaffAddOrderModal, type LiveTable, type MenuProduct } from "@/components/admin/tables-live-panel";
import { FoodItemDisplayCard } from "@/components/ops/food-item-display-card";
import { getStaffDeviceId } from "@/lib/staff-device";
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

type StaffOrderFilter = "ALL" | "ATTENTION" | "PAYMENT";

export function OrdersByTableBoard({
  slug,
  restaurantName,
  initialTables,
  initialExpandedSessionId,
  products = [],
  enableAddOrder = false,
  compactForStaff = false
}: {
  slug: string;
  restaurantName: string;
  initialTables: ActiveTableOrder[];
  initialExpandedSessionId?: string;
  products?: MenuProduct[];
  enableAddOrder?: boolean;
  compactForStaff?: boolean;
}) {
  const [tables, setTables] = useState(initialTables);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Record<string, boolean>>(
    initialExpandedSessionId ? { [initialExpandedSessionId]: true } : {}
  );
  const [expandedHistorySessionIds, setExpandedHistorySessionIds] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [orderingTable, setOrderingTable] = useState<LiveTable | null>(null);
  const [syncStatus, setSyncStatus] = useState<"live" | "reconnecting">("live");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StaffOrderFilter>("ALL");
  const filteredTables = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    return tables.filter((table) => {
      const waitingForPayment = table.status === "AWAITING_PAYMENT" || table.paymentStatus === "PENDING";
      const matchesFilter = filter === "ALL"
        || (filter === "ATTENTION" && table.requests.length > 0)
        || (filter === "PAYMENT" && waitingForPayment);
      return matchesFilter && (!keyword || table.tableName.toLocaleLowerCase("vi").includes(keyword) || table.areaName.toLocaleLowerCase("vi").includes(keyword));
    });
  }, [filter, query, tables]);

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
        if (!response.ok) throw new Error("orders_state_failed");
        const data = await response.json() as { tables: ActiveTableOrder[] };
        if (isMounted) {
          setTables(data.tables);
          setSyncStatus("live");
        }
      } catch {
        if (isMounted) setSyncStatus("reconnecting");
      }
    }

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/restaurants/${slug}/notifications/stream?deviceId=${encodeURIComponent(getStaffDeviceId())}`);
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
      {syncStatus === "reconnecting" ? (
        <p className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Đang kết nối lại</p>
      ) : null}

      {compactForStaff ? (
        <div className="grid gap-2 rounded-lg border bg-white p-3 shadow-sm sm:grid-cols-[minmax(220px,1fr)_auto]">
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm bàn hoặc khu vực"
              aria-label="Tìm order theo bàn"
            />
          </label>
          <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1" aria-label="Lọc order theo bàn">
            <OrderFilterButton active={filter === "ALL"} onClick={() => setFilter("ALL")}>Tất cả</OrderFilterButton>
            <OrderFilterButton active={filter === "ATTENTION"} onClick={() => setFilter("ATTENTION")}>Có yêu cầu</OrderFilterButton>
            <OrderFilterButton active={filter === "PAYMENT"} onClick={() => setFilter("PAYMENT")}>Chờ thanh toán</OrderFilterButton>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {filteredTables.map((table) => {
          const isExpanded = expandedSessionIds[table.diningSessionId] ?? false;
          const isHistoryExpanded = expandedHistorySessionIds[table.diningSessionId] ?? false;
          const shownItems = table.items.slice(0, compactForStaff ? 3 : 5);
          const hiddenItemCount = Math.max(0, table.items.length - shownItems.length);

          return (
            <article id={`session-${table.diningSessionId}`} key={table.diningSessionId} className={`rounded-lg border bg-white p-4 shadow-sm transition hover:border-slate-300 ${table.requests.length ? "border-red-200" : ""} ${initialExpandedSessionId === table.diningSessionId ? "border-teal-300 ring-2 ring-teal-100" : ""}`}>
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

              <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3">
                <div className="col-span-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span>{table.items.length} món</span>
                  {table.requests.length > 0 ? (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                      {table.requests.length} yêu cầu
                    </span>
                  ) : null}
                </div>
                <button
                  className={`${enableAddOrder ? "" : "col-span-2"} min-h-10 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50`}
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
                    className="min-h-10 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
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
                            subtotal: item.subtotal,
                            note: item.note
                          }))
                        }}
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      {table.items.map((item) => (
                        <FoodItemDisplayCard
                          key={`${item.productName}-${item.unitPrice}-detail`}
                          imageUrl={item.imageUrl}
                          name={item.productName}
                          quantity={item.quantity}
                          unitPrice={item.unitPrice}
                          subtotal={item.subtotal}
                        />
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
                                <p className="font-semibold">Lượt gọi #{order.orderNumber} - {formatTime(order.createdAt)}</p>
                                <p className="text-xs text-slate-500">{order.customerName} · {orderStatusLabels[order.status] ?? order.status}</p>
                              </div>
                              <p className="font-semibold">{formatMoney(order.subtotal)}</p>
                            </div>
                            <ul className="mt-3 space-y-2 text-sm">
                              {order.items.map((item) => (
                                <li key={item.id}>
                                  <FoodItemDisplayCard
                                    imageUrl={item.imageUrl}
                                    name={item.productName}
                                    quantity={item.quantity}
                                    unitPrice={item.unitPrice}
                                    subtotal={item.subtotal}
                                    note={item.note}
                                    statusLabel={itemStatusLabels[item.status] ?? item.status}
                                  />
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
      {filteredTables.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-500">Không tìm thấy order phù hợp.</p>
      ) : null}
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
        subtotal: item.subtotal,
        note: item.note
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

function OrderFilterButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`h-8 rounded px-2.5 text-xs font-semibold transition ${active ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
      type="button"
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
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
