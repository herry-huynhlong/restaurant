"use client";

import { useMemo, useState, useTransition } from "react";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";
import { X } from "lucide-react";
import { InvoicePrintButton } from "@/components/billing/invoice-print-button";
import { formatVnd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payment-method";

type PaymentSummary = {
  id: string;
  invoiceNumber: string | null;
  paidAtLabel: string;
  tableName: string;
  amount: number;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  confirmedByName: string | null;
};

type BillDetail = {
  id: string;
  restaurantName: string;
  businessName: string | null;
  taxCode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoiceNumber: string | null;
  tableName: string;
  customerName: string | null;
  cashierName: string | null;
  paidAt: string | null;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  orders: Array<{
    id: string;
    orderNumber: number;
    customerName: string;
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
};

export function PaymentReportTable({
  slug,
  payments
}: {
  slug: string;
  payments: PaymentSummary[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredPayments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return payments;

    return payments.filter((payment) => [
      payment.invoiceNumber,
      payment.id,
      payment.tableName,
      payment.confirmedByName,
      payment.paidAtLabel,
      payment.status,
      paymentMethodLabels[payment.paymentMethod],
      String(payment.amount)
    ].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [payments, query]);

  function openBill(paymentId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/restaurants/${slug}/reports/payments/${paymentId}`, { cache: "no-store" });
      if (!response.ok) {
        setError("Không mở được chi tiết hóa đơn.");
        return;
      }
      setSelected(await response.json() as BillDetail);
    });
  }

  return (
    <>
      <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="space-y-3 border-b p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Danh sách thanh toán</h2>
            <span className="text-sm text-slate-500">{filteredPayments.length}/{payments.length} bill</span>
          </div>
          <input
            className="h-10 w-full rounded-md border px-3 text-sm outline-none focus:border-teal-600"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm mã bill / bàn / người xác nhận..."
          />
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3">Bàn</th>
                <th className="px-4 py-3">Phương thức</th>
                <th className="px-4 py-3">Người xác nhận</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPayments.length ? filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3">{payment.paidAtLabel}</td>
                  <td className="px-4 py-3">
                    <button className="font-semibold text-teal-700 hover:underline disabled:opacity-60" type="button" disabled={isPending} onClick={() => openBill(payment.id)}>
                      {payment.invoiceNumber ?? payment.id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-4 py-3">Bàn {payment.tableName}</td>
                  <td className="px-4 py-3">{paymentMethodLabels[payment.paymentMethod]}</td>
                  <td className="px-4 py-3">{payment.confirmedByName ?? "-"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatVnd(payment.amount)}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{payment.status}</span></td>
                  <td className="px-4 py-3">
                    <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" disabled={isPending} onClick={() => openBill(payment.id)}>
                      Xem bill
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>Không tìm thấy thanh toán phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <BillDetailModal bill={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}

function BillDetailModal({ bill, onClose }: { bill: BillDetail; onClose: () => void }) {
  const invoice = {
    restaurantName: bill.restaurantName,
    businessName: bill.businessName,
    taxCode: bill.taxCode,
    address: bill.address,
    phone: bill.phone,
    email: bill.email,
    invoiceNumber: bill.invoiceNumber,
    tableName: bill.tableName,
    cashierName: bill.cashierName,
    paidAt: bill.paidAt,
    status: bill.status === "PAID" ? "PAID" as const : bill.status === "PENDING" ? "PENDING" as const : "UNPAID" as const,
    paymentMethod: bill.paymentMethod,
    subtotal: bill.subtotal,
    taxRate: bill.taxRate,
    taxAmount: bill.taxAmount,
    grandTotal: bill.grandTotal,
    items: bill.items
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-3 sm:p-6">
      <div className="mx-auto flex max-h-[calc(100vh-24px)] max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:max-h-[calc(100vh-48px)]">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Chi tiết hóa đơn</p>
            <h2 className="mt-1 text-lg font-semibold">{bill.invoiceNumber ?? bill.id}</h2>
            <p className="mt-1 text-sm text-slate-600">Bàn {bill.tableName} · {bill.paidAt ?? "-"}</p>
          </div>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-slate-50" type="button" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <Info label="Mã bill" value={bill.invoiceNumber ?? bill.id} />
            <Info label="Bàn" value={bill.tableName} />
            <Info label="Thời gian" value={bill.paidAt ?? "-"} />
            <Info label="Người xác nhận" value={bill.cashierName ?? "-"} />
            <Info label="Phương thức" value={paymentMethodLabels[bill.paymentMethod]} />
            <Info label="Trạng thái" value={bill.status === "PAID" ? "Đã thanh toán" : bill.status} />
            {bill.customerName ? <Info label="Khách" value={bill.customerName} /> : null}
          </div>

          <section className="mt-5">
            <h3 className="font-semibold">Các món đã gọi</h3>
            <div className="mt-3 divide-y rounded-md border">
              {bill.items.length ? bill.items.map((item) => (
                <div key={`${item.name}-${item.unitPrice}`} className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-slate-600">{item.quantity} x {formatVnd(item.unitPrice)}</p>
                  </div>
                  <p className="font-semibold">{formatVnd(item.subtotal)}</p>
                </div>
              )) : <p className="p-3 text-sm text-slate-500">Không có món.</p>}
            </div>
          </section>

          <section className="mt-5 rounded-md border p-3">
            <SummaryRow label="Tạm tính" value={bill.subtotal} />
            <SummaryRow label={`Thuế ${bill.taxRate}%`} value={bill.taxAmount} />
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <p className="font-semibold">Tổng thanh toán</p>
              <p className="text-xl font-bold text-teal-700">{formatVnd(bill.grandTotal)}</p>
            </div>
          </section>

          {bill.orders.length ? (
            <section className="mt-5">
              <h3 className="font-semibold">Theo order</h3>
              <div className="mt-3 space-y-2">
                {bill.orders.map((order) => (
                  <details key={order.id} className="rounded-md border p-3">
                    <summary className="cursor-pointer font-medium">Order #{order.orderNumber} · {order.customerName} · {formatVnd(order.subtotal)}</summary>
                    <div className="mt-2 divide-y text-sm">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between gap-3 py-2">
                          <span>{item.quantity} x {item.name}</span>
                          <span className="font-medium">{formatVnd(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          <InvoicePrintButton label="In lại hóa đơn" invoice={invoice} />
          <button className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
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
