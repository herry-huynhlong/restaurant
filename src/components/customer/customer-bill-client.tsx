"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatVnd } from "@/lib/money";

type BillItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

type BillOrder = {
  id: string;
  orderNumber: number;
  customerName: string;
  status: string;
  subtotal: number;
  createdAt: string;
  items: BillItem[];
};

type CustomerBill = {
  totalAmount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  items: BillItem[];
  orders: BillOrder[];
};

const emptyBill: CustomerBill = {
  totalAmount: 0,
  subtotal: 0,
  taxRate: 0,
  taxAmount: 0,
  grandTotal: 0,
  items: [],
  orders: []
};

export function CustomerBillClient({ slug, mode }: { slug: string; mode: "orders" | "payment" }) {
  const [bill, setBill] = useState<CustomerBill>(emptyBill);
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshBill = useCallback(async () => {
    try {
      const response = await fetch(`/api/restaurants/${slug}/customer/bill`, { cache: "no-store" });
      if (!response.ok) throw new Error("bill_failed");
      const data = await response.json() as Partial<CustomerBill>;
      setBill({
        totalAmount: data.grandTotal ?? data.totalAmount ?? 0,
        subtotal: data.subtotal ?? data.totalAmount ?? 0,
        taxRate: data.taxRate ?? 0,
        taxAmount: data.taxAmount ?? 0,
        grandTotal: data.grandTotal ?? data.totalAmount ?? 0,
        items: Array.isArray(data.items) ? data.items : [],
        orders: Array.isArray(data.orders) ? data.orders : []
      });
      setStatus("live");
    } catch {
      setStatus("reconnecting");
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (!cancelled) await refreshBill();
    }

    void tick();
    const interval = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshBill]);

  async function requestPayment() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/restaurants/${slug}/customer/service-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "REQUEST_PAYMENT" })
      });
      const data = await response.json().catch(() => ({})) as { message?: string; error?: string };
      setMessage(response.ok
        ? data.message ?? "Đã gửi yêu cầu thanh toán. Vui lòng đến quầy để hoàn tất thanh toán."
        : data.error ?? "Không gửi được yêu cầu thanh toán.");
      await refreshBill();
    });
  }

  if (mode === "payment") {
    return (
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Thanh toán</h2>
          <LiveBadge status={status} />
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-4">
          <p className="text-sm text-slate-600">Tổng bàn</p>
          <p className="mt-1 text-3xl font-bold text-teal-700">{formatVnd(bill.grandTotal)}</p>
        </div>
        <button
          className="mt-4 w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-300"
          type="button"
          disabled={isPending}
          onClick={requestPayment}
        >
          {isPending ? "Đang gửi..." : "Yêu cầu thanh toán"}
        </button>
        <p className="mt-3 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Vui lòng đến quầy để hoàn tất thanh toán.
        </p>
        {message ? <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Đã gọi</h2>
        <LiveBadge status={status} />
      </div>
      {bill.orders.length ? (
        <div className="mt-4 space-y-4">
          {bill.orders.map((order) => (
            <article key={order.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Order #{order.orderNumber} - {order.customerName}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(new Date(order.createdAt))}</p>
                </div>
                <p className="font-semibold text-teal-700">{formatVnd(order.subtotal)}</p>
              </div>
              <div className="mt-3 divide-y">
                {order.items.map((item) => (
                  <div key={`${order.id}-${item.productName}-${item.unitPrice}`} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-slate-600">{item.quantity} x {formatVnd(item.unitPrice)}</p>
                    </div>
                    <p className="font-semibold">{formatVnd(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Chưa có món nào được gọi.</p>
      )}
      <div className="mt-4 border-t pt-4">
        {bill.items.length ? (
          <div className="mb-4 rounded-md bg-slate-50 p-3">
            <p className="text-sm font-semibold">Tổng theo món</p>
            <div className="mt-2 divide-y">
              {bill.items.map((item) => (
                <div key={`${item.productName}-${item.unitPrice}`} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-sm text-slate-600">{item.quantity} x {formatVnd(item.unitPrice)}</p>
                  </div>
                  <p className="font-semibold">{formatVnd(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <SummaryRow label="Tạm tính" value={bill.subtotal} />
        {bill.taxAmount ? <SummaryRow label={`Thuế ${bill.taxRate}%`} value={bill.taxAmount} /> : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-semibold">Tổng bàn</p>
          <p className="text-2xl font-bold text-teal-700">{formatVnd(bill.grandTotal)}</p>
        </div>
      </div>
    </section>
  );
}

function LiveBadge({ status }: { status: "live" | "reconnecting" }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${status === "live" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
      {status === "live" ? "Live" : "Đang cập nhật"}
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="font-semibold">{formatVnd(value)}</p>
    </div>
  );
}
