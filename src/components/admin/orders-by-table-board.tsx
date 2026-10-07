"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActiveTableOrder } from "@/server/services/order-board-service";

export function OrdersByTableBoard({
  slug,
  initialTables
}: {
  slug: string;
  initialTables: ActiveTableOrder[];
}) {
  const [tables, setTables] = useState(initialTables);
  const [selectedSessionId, setSelectedSessionId] = useState(initialTables[0]?.diningSessionId ?? "");
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

    const interval = window.setInterval(loadState, 3000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [slug]);

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
        {tables.map((table) => {
          const isSelected = table.diningSessionId === selectedTable?.diningSessionId;
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
                <p className="text-lg font-semibold text-teal-700">{formatMoney(table.totalAmount)}</p>
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
