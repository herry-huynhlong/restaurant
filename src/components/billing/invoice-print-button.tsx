"use client";

import { Printer } from "lucide-react";
import { formatVnd } from "@/lib/money";
import { paymentMethodLabels } from "@/lib/payment-method";
import type { PaymentMethod } from "@prisma/client";

export type InvoiceItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type InvoicePrintData = {
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
  discountAmount?: number;
  surchargeAmount?: number;
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

type InvoicePrintButtonProps = {
  label?: string;
  paperSize?: "58mm" | "80mm";
  invoice: InvoicePrintData;
};

export function InvoicePrintButton({ label = "In hóa đơn", paperSize = "80mm", invoice }: InvoicePrintButtonProps) {
  function printInvoice() {
    const is58mm = paperSize === "58mm";
    const popup = window.open("", "_blank", `width=${is58mm ? 300 : 380},height=720`);
    if (!popup) return;
    popup.document.write(buildInvoicePrintHtml(invoice, paperSize));
    popup.document.close();
  }

  return (
    <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={printInvoice}>
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}

export function buildInvoicePrintHtml(invoice: InvoicePrintData, paperSize: "58mm" | "80mm") {
  const is58mm = paperSize === "58mm";
  const pageWidth = is58mm ? "58mm" : "80mm";
  const bodyWidth = is58mm ? "52mm" : "72mm";
  const isPaid = invoice.status === "PAID";
  const title = isPaid ? "PHIẾU THANH TOÁN" : "PHIẾU TẠM TÍNH";
  const paymentQr = invoice.paymentQr;
  const showPaymentQr = !isPaid && paymentQr?.enabled && paymentQr.imageUrl;
  const transferContent = paymentQr?.transferContent || (invoice.invoiceNumber ? `HD ${invoice.invoiceNumber}` : `Bàn ${invoice.tableName}`);
  const address = invoice.address?.trim();
  const taxCode = invoice.taxCode?.trim();
  const phone = invoice.phone?.trim();
  const email = invoice.email?.trim();
  const cashierName = invoice.cashierName?.trim();
  const paidAt = invoice.paidAt ?? new Date().toLocaleString("vi-VN");
  const rows = invoice.items.map((item) => `
    <tr>
      <td class="item-name">${escapeHtml(item.name)}</td>
      <td class="qty">${item.quantity}</td>
      <td class="money">${formatPrintAmount(item.unitPrice)}</td>
      <td class="money line-total">${formatPrintAmount(item.subtotal)}</td>
    </tr>
  `).join("");

  return `
    <!doctype html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(invoice.invoiceNumber ?? "Phiếu tạm tính")}</title>
        <style>
          @page { size: ${pageWidth} auto; margin: ${is58mm ? "3mm" : "4mm"}; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          body {
            width: ${bodyWidth};
            margin: 0 auto;
            color: #111;
            background: #fff;
            font-family: Arial, "Helvetica Neue", sans-serif;
            font-size: ${is58mm ? "10px" : "11px"};
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .center { text-align: center; }
          .store-name { margin: 0; font-size: ${is58mm ? "15px" : "17px"}; font-weight: 800; overflow-wrap: anywhere; }
          .store-meta { margin-top: 2px; overflow-wrap: anywhere; }
          .receipt-title { margin: 8px 0 6px; padding: 5px 0; border-top: 1px dashed #111; border-bottom: 1px dashed #111; font-size: ${is58mm ? "13px" : "15px"}; font-weight: 800; }
          .meta { display: grid; grid-template-columns: auto 1fr; column-gap: 6px; row-gap: 2px; }
          .meta .value { min-width: 0; text-align: right; overflow-wrap: anywhere; }
          .currency-note { margin: 7px 0 2px; text-align: right; font-size: 9px; }
          .items-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .items-table col.name { width: ${is58mm ? "40%" : "44%"}; }
          .items-table col.quantity { width: ${is58mm ? "9%" : "8%"}; }
          .items-table col.price { width: ${is58mm ? "23%" : "22%"}; }
          .items-table col.amount { width: ${is58mm ? "28%" : "26%"}; }
          .items-table th { padding: 4px 1px; border-top: 1px solid #111; border-bottom: 1px solid #111; font-size: ${is58mm ? "8.5px" : "10px"}; line-height: 1.15; vertical-align: bottom; }
          .items-table td { padding: 5px 1px; border-bottom: 1px dotted #888; vertical-align: top; }
          .items-table th:first-child, .item-name { text-align: left; }
          .item-name { padding-right: 3px !important; font-weight: 600; overflow-wrap: anywhere; word-break: normal; }
          .qty { text-align: center; }
          .money { text-align: right; white-space: nowrap; font-size: ${is58mm ? "8.5px" : "10px"}; font-variant-numeric: tabular-nums; }
          .line-total { font-weight: 700; }
          .empty-row { padding: 8px 2px !important; text-align: center !important; color: #555; }
          .totals { margin-top: 7px; }
          .total-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; }
          .total-row span:last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .grand-total { margin-top: 5px; padding-top: 5px; border-top: 1px solid #111; font-size: ${is58mm ? "13px" : "15px"}; font-weight: 800; }
          .qr-section { margin-top: 8px; padding-top: 7px; border-top: 1px dashed #111; }
          .qr { display: block; width: ${is58mm ? "38mm" : "42mm"}; height: ${is58mm ? "38mm" : "42mm"}; margin: 5px auto; object-fit: contain; }
          .status { margin-top: 9px; padding-top: 7px; border-top: 1px dashed #111; font-size: ${is58mm ? "12px" : "13px"}; font-weight: 800; }
          .thanks { margin-top: 5px; }
          @media print {
            html, body { width: ${bodyWidth}; background: #fff; }
            body { margin: 0 auto; }
            button, .no-print { display: none !important; }
            .items-table tr, .totals, .qr-section { break-inside: avoid; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body class="paper-${is58mm ? "58" : "80"}">
        <header class="center">
          <h1 class="store-name">${escapeHtml(invoice.businessName || invoice.restaurantName)}</h1>
          ${address ? `<div class="store-meta">${escapeHtml(address)}</div>` : ""}
          ${taxCode ? `<div class="store-meta">MST: ${escapeHtml(taxCode)}</div>` : ""}
          ${phone ? `<div class="store-meta">SĐT: ${escapeHtml(phone)}</div>` : ""}
          ${email ? `<div class="store-meta">${escapeHtml(email)}</div>` : ""}
          <div class="receipt-title">${title}</div>
        </header>

        <section class="meta">
          <span>Mã bill:</span><span class="value">${escapeHtml(invoice.invoiceNumber ?? "Tạm tính")}</span>
          <span>Bàn:</span><span class="value">${escapeHtml(invoice.tableName)}</span>
          ${invoice.areaName ? `<span>Khu vực:</span><span class="value">${escapeHtml(invoice.areaName)}</span>` : ""}
          ${invoice.openedAt ? `<span>Giờ vào:</span><span class="value">${escapeHtml(invoice.openedAt)}</span>` : ""}
          <span>${isPaid ? "Thanh toán:" : "Thời gian:"}</span><span class="value">${escapeHtml(paidAt)}</span>
          ${cashierName ? `<span>Thu ngân:</span><span class="value">${escapeHtml(cashierName)}</span>` : ""}
          ${invoice.paymentMethod ? `<span>Phương thức:</span><span class="value">${paymentMethodLabels[invoice.paymentMethod]}</span>` : ""}
        </section>

        <div class="currency-note">Đơn vị: VNĐ</div>
        <table class="items-table">
          <colgroup>
            <col class="name" /><col class="quantity" /><col class="price" /><col class="amount" />
          </colgroup>
          <thead>
            <tr><th>Tên món</th><th class="qty">SL</th><th class="money">Đơn giá</th><th class="money">Thành tiền</th></tr>
          </thead>
          <tbody>
            ${rows || `<tr><td class="empty-row" colspan="4">Chưa có món.</td></tr>`}
          </tbody>
        </table>

        <section class="totals">
          <div class="total-row"><span>Tạm tính</span><span>${formatVnd(invoice.subtotal)}</span></div>
          ${(invoice.discountAmount ?? 0) > 0 ? `<div class="total-row"><span>Giảm giá</span><span>-${formatVnd(invoice.discountAmount ?? 0)}</span></div>` : ""}
          ${(invoice.surchargeAmount ?? 0) > 0 ? `<div class="total-row"><span>Phụ thu</span><span>${formatVnd(invoice.surchargeAmount ?? 0)}</span></div>` : ""}
          ${invoice.taxAmount > 0 ? `<div class="total-row"><span>Thuế/VAT ${invoice.taxRate}%</span><span>${formatVnd(invoice.taxAmount)}</span></div>` : ""}
          <div class="total-row grand-total"><span>TỔNG THANH TOÁN</span><span>${formatVnd(invoice.grandTotal)}</span></div>
        </section>

        ${showPaymentQr ? `
          <section class="qr-section">
            <div class="center"><strong>QUÉT MÃ THANH TOÁN</strong></div>
            <img class="qr" src="${escapeHtml(paymentQr.imageUrl ?? "")}" alt="QR thanh toán" />
            ${paymentQr.bankName ? `<div>Ngân hàng: ${escapeHtml(paymentQr.bankName)}</div>` : ""}
            ${paymentQr.accountNumber ? `<div>STK: ${escapeHtml(paymentQr.accountNumber)}</div>` : ""}
            ${paymentQr.accountHolder ? `<div>Chủ TK: ${escapeHtml(paymentQr.accountHolder)}</div>` : ""}
            <div>Nội dung: ${escapeHtml(transferContent)}</div>
          </section>
        ` : ""}

        <footer class="center">
          <div class="status">${isPaid ? "ĐÃ THANH TOÁN" : "CHƯA THANH TOÁN"}</div>
          <div class="thanks">Xin cảm ơn quý khách!</div>
        </footer>
        <script>window.print();</script>
      </body>
    </html>
  `;
}

function formatPrintAmount(amount: number) {
  return amount.toLocaleString("vi-VN");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
