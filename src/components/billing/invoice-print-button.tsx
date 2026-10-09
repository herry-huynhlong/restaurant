"use client";

import { Printer } from "lucide-react";
import { formatVnd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payment-method";
import type { PaymentMethod } from "@prisma/client";

type InvoiceItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

type InvoicePrintButtonProps = {
  label?: string;
  invoice: {
    restaurantName: string;
    businessName?: string | null;
    taxCode?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    invoiceNumber?: string | null;
    tableName: string;
    areaName?: string | null;
    cashierName?: string | null;
    openedAt?: string | null;
    paidAt?: string | null;
    status: "UNPAID" | "PENDING" | "PAID";
    paymentMethod?: PaymentMethod | null;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    grandTotal: number;
    items: InvoiceItem[];
    paymentQr?: {
      enabled: boolean;
      imageUrl?: string | null;
      bankName?: string | null;
      accountNumber?: string | null;
      accountHolder?: string | null;
      transferContent?: string | null;
    };
  };
};

export function InvoicePrintButton({ label = "In hóa đơn", invoice }: InvoicePrintButtonProps) {
  function printInvoice() {
    const popup = window.open("", "_blank", "width=380,height=720");
    if (!popup) return;

    const lines = invoice.items.map((item) => `
      <div class="item">
        <div>${escapeHtml(item.name)}</div>
        <div class="row"><span>${item.quantity} x ${formatVnd(item.unitPrice)}</span><span>${formatVnd(item.subtotal)}</span></div>
      </div>
    `).join("");
    const isPaid = invoice.status === "PAID";
    const title = isPaid ? "PHIẾU THANH TOÁN" : "PHIẾU TẠM TÍNH";
    const paymentQr = invoice.paymentQr;
    const showPaymentQr = !isPaid && paymentQr?.enabled && paymentQr.imageUrl;
    const transferContent = paymentQr?.transferContent || (invoice.invoiceNumber ? `HD ${invoice.invoiceNumber}` : `Bàn ${invoice.tableName}`);

    popup.document.write(`
      <html>
        <head>
          <title>${escapeHtml(invoice.invoiceNumber ?? "Bill")}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            * { box-sizing: border-box; }
            body { width: 72mm; margin: 0 auto; font-family: Arial, sans-serif; color: #111; font-size: 12px; }
            .center { text-align: center; }
            .title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
            .muted { color: #444; }
            .divider { border-top: 1px dashed #111; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; gap: 8px; }
            .item { margin: 8px 0; }
            .total { font-size: 15px; font-weight: 700; }
            .qr { width: 42mm; height: 42mm; object-fit: contain; margin: 6px auto; display: block; }
            @media print { button { display: none; } body { width: 72mm; } }
          </style>
        </head>
        <body>
          <div class="center">
            <p class="title">${escapeHtml(invoice.businessName || invoice.restaurantName)}</p>
            ${invoice.address ? `<div>${escapeHtml(invoice.address)}</div>` : ""}
            ${invoice.taxCode ? `<div>MST: ${escapeHtml(invoice.taxCode)}</div>` : ""}
            ${invoice.phone ? `<div>SĐT: ${escapeHtml(invoice.phone)}</div>` : ""}
            ${invoice.email ? `<div>${escapeHtml(invoice.email)}</div>` : ""}
          </div>
          <div class="divider"></div>
          <div class="center"><strong>${title}</strong></div>
          <div class="divider"></div>
          <div class="row"><span>Mã:</span><span>${escapeHtml(invoice.invoiceNumber ?? "Tạm tính")}</span></div>
          <div class="row"><span>Bàn:</span><span>${escapeHtml(invoice.tableName)}</span></div>
          ${invoice.areaName ? `<div class="row"><span>Khu vực:</span><span>${escapeHtml(invoice.areaName)}</span></div>` : ""}
          ${invoice.openedAt ? `<div class="row"><span>Giờ vào:</span><span>${escapeHtml(invoice.openedAt)}</span></div>` : ""}
          <div class="row"><span>${isPaid ? "Giờ thanh toán:" : "Thời gian:"}</span><span>${escapeHtml(invoice.paidAt ?? new Date().toLocaleString("vi-VN"))}</span></div>
          ${invoice.cashierName ? `<div class="row"><span>Thu ngân:</span><span>${escapeHtml(invoice.cashierName)}</span></div>` : ""}
          ${invoice.paymentMethod ? `<div class="row"><span>PTTT:</span><span>${paymentMethodLabels[invoice.paymentMethod]}</span></div>` : ""}
          <div class="divider"></div>
          ${lines || "<div>Chưa có món.</div>"}
          <div class="divider"></div>
          <div class="row"><span>Tạm tính</span><span>${formatVnd(invoice.subtotal)}</span></div>
          ${invoice.taxAmount > 0 ? `<div class="row"><span>VAT ${invoice.taxRate}%</span><span>${formatVnd(invoice.taxAmount)}</span></div>` : ""}
          <div class="row total"><span>TỔNG</span><span>${formatVnd(invoice.grandTotal)}</span></div>
          ${showPaymentQr ? `
            <div class="divider"></div>
            <div class="center"><strong>QUÉT MÃ THANH TOÁN</strong></div>
            <img class="qr" src="${escapeHtml(paymentQr.imageUrl ?? "")}" alt="QR thanh toán" />
            ${paymentQr.bankName ? `<div>Ngân hàng: ${escapeHtml(paymentQr.bankName)}</div>` : ""}
            ${paymentQr.accountNumber ? `<div>STK: ${escapeHtml(paymentQr.accountNumber)}</div>` : ""}
            ${paymentQr.accountHolder ? `<div>Chủ TK: ${escapeHtml(paymentQr.accountHolder)}</div>` : ""}
            <div>Nội dung: ${escapeHtml(transferContent)}</div>
          ` : ""}
          <div class="divider"></div>
          <div class="center">Trạng thái: ${invoice.status === "PAID" ? "ĐÃ THANH TOÁN" : invoice.status === "PENDING" ? "CHỜ THANH TOÁN" : "CHƯA THANH TOÁN"}</div>
          <div class="center muted" style="margin-top: 8px">Cảm ơn quý khách!</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    popup.document.close();
  }

  return (
    <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={printInvoice}>
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
