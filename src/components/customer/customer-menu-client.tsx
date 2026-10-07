"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { formatVnd } from "@/lib/money";
import { servedUploadUrl } from "@/lib/upload-url";

type Product = {
  id: string;
  categoryName: string;
  menuType: "MAIN" | "EXTRA" | "DRINK";
  nameVi: string;
  descriptionVi: string | null;
  price: number;
  imageUrl: string | null;
  isSoldOut: boolean;
};

type CartItem = Product & {
  quantity: number;
};

type BillItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

type CurrentBill = {
  totalAmount: number;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  items: BillItem[];
};

export function CustomerMenuClient({
  slug,
  products,
  primaryColor
}: {
  slug: string;
  products: Product[];
  primaryColor: string;
}) {
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [bill, setBill] = useState<CurrentBill>({ totalAmount: 0, items: [] });
  const [billStatus, setBillStatus] = useState<"live" | "reconnecting">("live");
  const [paymentRequested, setPaymentRequested] = useState(false);
  const [isPending, startTransition] = useTransition();
  const cartItems = Object.values(cart);
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const groups = useMemo(() => [
    { type: "MAIN", label: "Món chính", products: products.filter((product) => product.menuType === "MAIN") },
    { type: "EXTRA", label: "Món thêm", products: products.filter((product) => product.menuType === "EXTRA") },
    { type: "DRINK", label: "Nước / Đồ uống", products: products.filter((product) => product.menuType === "DRINK") }
  ] as const, [products]);

  const refreshBill = useCallback(async () => {
    try {
      const response = await fetch(`/api/restaurants/${slug}/customer/bill`, { cache: "no-store" });
      if (!response.ok) throw new Error("bill_failed");
      const data = (await response.json()) as CurrentBill;
      setBill({
        totalAmount: data.grandTotal ?? data.totalAmount ?? 0,
        subtotal: data.subtotal ?? data.totalAmount ?? 0,
        taxRate: data.taxRate ?? 0,
        taxAmount: data.taxAmount ?? 0,
        grandTotal: data.grandTotal ?? data.totalAmount ?? 0,
        items: Array.isArray(data.items) ? data.items : []
      });
      setBillStatus("live");
    } catch {
      setBillStatus("reconnecting");
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

  function add(product: Product) {
    if (product.isSoldOut) return;
    setCart((current) => ({
      ...current,
      [product.id]: {
        ...product,
        quantity: (current[product.id]?.quantity ?? 0) + 1
      }
    }));
  }

  function remove(productId: string) {
    setCart((current) => {
      const existing = current[productId];
      if (!existing) return current;
      if (existing.quantity <= 1) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: { ...existing, quantity: existing.quantity - 1 } };
    });
  }

  async function submitOrder() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/restaurants/${slug}/customer/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          items: cartItems.map((item) => ({ productId: item.id, quantity: item.quantity }))
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Không gửi được order.");
        return;
      }
      setCart({});
      setMessage(`Đã gửi order #${data.orderNumber}.`);
      await refreshBill();
    });
  }

  async function sendServiceRequest(requestType: string, label: string) {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/restaurants/${slug}/customer/service-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType })
      });
      const data = await response.json();
      if (response.ok && requestType === "REQUEST_PAYMENT") {
        setPaymentRequested(true);
        setMessage(data.message ?? "Đã gửi yêu cầu thanh toán. Vui lòng ra quầy để hoàn tất thanh toán.");
        await refreshBill();
        return;
      }
      setMessage(response.ok ? data.message ?? `Đã gửi yêu cầu: ${label}.` : data.error ?? "Không gửi được yêu cầu.");
    });
  }

  return (
    <>
      <section className="mb-4 rounded-lg border bg-white p-3 shadow-sm">
        <p className="text-sm font-semibold">Gọi nhanh</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <button className="rounded-md border px-3 py-2 disabled:opacity-60" type="button" disabled={isPending} onClick={() => sendServiceRequest("CALL_STAFF", "Gọi nhân viên")}>
            Gọi nhân viên
          </button>
          <button className="rounded-md border px-3 py-2" type="button" onClick={() => sendServiceRequest("REQUEST_WATER", "Thêm nước")}>
            Thêm nước
          </button>
          <button className="rounded-md border px-3 py-2" type="button" onClick={() => sendServiceRequest("REQUEST_UTENSILS", "Thêm dụng cụ")}>
            Thêm dụng cụ
          </button>
          <button className="rounded-md border px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" type="button" disabled={paymentRequested || isPending} onClick={() => sendServiceRequest("REQUEST_PAYMENT", "Yêu cầu thanh toán")}>
            {paymentRequested ? "Đang chờ thanh toán" : "Yêu cầu thanh toán"}
          </button>
        </div>
        {message ? <p className="mt-3 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</p> : null}
        {paymentRequested ? (
          <div className="mt-3 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
            <p className="font-semibold">Yêu cầu thanh toán đã được gửi</p>
            <p className="mt-1">Tổng bàn: <span className="font-bold">{formatVnd(bill.grandTotal ?? bill.totalAmount)}</span></p>
            <p className="mt-1">Vui lòng ra quầy để hoàn tất thanh toán.</p>
          </div>
        ) : null}
      </section>

      <section className="mb-5 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Đã gọi</h2>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${billStatus === "live" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
            {billStatus === "live" ? "Live" : "Đang cập nhật"}
          </span>
        </div>
        {bill.items.length ? (
          <div className="mt-3 divide-y">
            {bill.items.map((item) => (
              <div key={`${item.productName}-${item.unitPrice}`} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-sm text-slate-600">{item.quantity} x {formatVnd(item.unitPrice)}</p>
                </div>
                <p className="font-semibold">{formatVnd(item.subtotal)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Chưa có món nào được gọi.</p>
        )}
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <p className="font-semibold">Tạm tính</p>
          <p className="font-semibold">{formatVnd(bill.subtotal ?? bill.totalAmount)}</p>
        </div>
        {bill.taxAmount ? (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-slate-600">Thuế {bill.taxRate ?? 0}%</p>
            <p className="font-semibold">{formatVnd(bill.taxAmount)}</p>
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between">
          <p className="font-semibold">Tổng bàn</p>
          <p className="text-xl font-bold text-teal-700">{formatVnd(bill.grandTotal ?? bill.totalAmount)}</p>
        </div>
      </section>

      {groups.filter((group) => group.products.length > 0).map((group) => (
        <section key={group.type} className="mb-5">
          <h2 className="mb-3 text-base font-semibold">{group.label}</h2>
          <div className="space-y-3">
            {group.products.map((product) => {
              const quantity = cart[product.id]?.quantity ?? 0;
              return (
                <article key={product.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex gap-3">
                    <div className="h-20 w-20 shrink-0 rounded-md bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {product.imageUrl ? <img alt={product.nameVi} className="h-full w-full rounded-md object-cover" src={servedUploadUrl(product.imageUrl) ?? product.imageUrl} /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{product.nameVi}</h3>
                      {product.descriptionVi ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{product.descriptionVi}</p> : null}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="font-semibold text-teal-700">{formatVnd(product.price)}</p>
                        {product.isSoldOut ? (
                          <span className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-500">Hết món</span>
                        ) : quantity > 0 ? (
                          <div className="flex items-center gap-2">
                            <button className="h-8 w-8 rounded-md border" type="button" onClick={() => remove(product.id)}>-</button>
                            <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                            <button className="h-8 w-8 rounded-md text-white" style={{ backgroundColor: primaryColor }} type="button" onClick={() => add(product)}>+</button>
                          </div>
                        ) : (
                          <button className="rounded-md px-3 py-1 text-sm font-semibold text-white" style={{ backgroundColor: primaryColor }} type="button" onClick={() => add(product)}>
                            Thêm
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {products.length === 0 ? (
        <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Chưa có món ăn</h2>
          <p className="mt-2 text-sm text-slate-600">Nhà hàng đang cập nhật menu.</p>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-12 border-t bg-white p-3 shadow-lg">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{totalQuantity} món</p>
            <p className="text-lg font-bold">{formatVnd(totalAmount)}</p>
          </div>
          <button
            className="min-w-32 rounded-md px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-300"
            style={{ backgroundColor: totalQuantity > 0 ? primaryColor : undefined }}
            type="button"
            disabled={totalQuantity === 0 || isPending}
            onClick={submitOrder}
          >
            {isPending ? "Đang gửi..." : "Gọi món"}
          </button>
        </div>
      </div>
    </>
  );
}
