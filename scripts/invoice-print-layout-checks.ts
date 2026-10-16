import assert from "node:assert/strict";
import { buildInvoicePrintHtml, type InvoicePrintData } from "../src/components/billing/invoice-print-button";

const paidInvoice: InvoicePrintData = {
  restaurantName: "Quán thử nghiệm",
  businessName: "Quán thử nghiệm",
  address: "12 Đường Trung Tâm, Quận 1",
  invoiceNumber: "INV-20261016-001",
  tableName: "A01",
  cashierName: "Thu ngân",
  paidAt: "10:30 16/10/2026",
  status: "PAID",
  paymentMethod: "CASH",
  subtotal: 270_000,
  taxRate: 0,
  taxAmount: 0,
  grandTotal: 270_000,
  items: [
    { id: "1", name: "Bào Ngư Hấp", quantity: 1, unitPrice: 150_000, subtotal: 150_000 },
    {
      id: "2",
      name: "Tên món rất dài cần tự động xuống dòng nhưng không được làm vỡ bảng",
      quantity: 1_250,
      unitPrice: 120_000_000,
      subtotal: 150_000_000_000,
      note: "Không hành, ít cay, đóng gói riêng"
    }
  ]
};

const html58 = buildInvoicePrintHtml(paidInvoice, "58mm");
const html80 = buildInvoicePrintHtml(paidInvoice, "80mm");

for (const label of ["Tên món", "SL", "Đơn giá", "Thành tiền"]) {
  assert.ok(html58.includes(label), `Missing item-table heading: ${label}`);
}
assert.ok(html58.includes("table-layout: fixed"), "Thermal item table must use a stable fixed layout.");
assert.ok(html58.includes("border: 1px solid #555; border-collapse: collapse"), "The product table must have a clear outer frame.");
assert.ok(html58.includes("border: 1px dotted #777"), "Every product cell must remain visually separated.");
assert.ok(html58.includes("overflow-wrap: anywhere"), "Long product names must wrap safely.");
assert.ok(html58.includes("@page { size: 58mm 297mm"), "58 mm print CSS must start with a valid thermal page size.");
assert.ok(html58.includes("width: 48mm"), "58 mm receipts must stay inside a conservative printable area.");
assert.ok(html80.includes("@page { size: 80mm 297mm"), "80 mm print CSS must start with a valid thermal page size.");
assert.ok(html58.includes("contentHeightMm"), "The page length must be derived from rendered receipt content.");
assert.ok(html58.includes("ĐÃ THANH TOÁN"), "A paid invoice must print the paid status.");
assert.ok(!html58.includes("Thuế/VAT 0%"), "Zero tax must not be printed as a charge.");
assert.ok(html58.includes("12 Đường Trung Tâm, Quận 1"), "Configured store address must be printed.");
assert.ok(html58.includes(paidInvoice.items[1].name), "Long product names must remain in the printed bill.");
assert.ok(html58.includes("Ghi chú: Không hành, ít cay, đóng gói riêng"), "Item notes must remain attached to their item.");
assert.ok(html58.includes("150.000.000.000"), "Large totals must remain available in the print document.");
assert.ok(!html58.includes("QUÉT MÃ THANH TOÁN"), "Paid receipts must never include a payment QR.");
assert.ok(buildInvoicePrintHtml(paidInvoice, "80mm", "REPRINT").includes("BẢN IN LẠI"), "Reprinted paid receipts must be identifiable.");
assert.ok(!html58.includes("undefined"), "Printed HTML must not expose undefined values.");

const unpaidHtml = buildInvoicePrintHtml({
  ...paidInvoice,
  address: null,
  invoiceNumber: null,
  status: "UNPAID",
  paymentMethod: null,
  taxRate: 8,
  taxAmount: 21_600,
  grandTotal: 291_600,
  paymentQr: {
    enabled: true,
    imageUrl: "/uploads/payment-qr.png",
    bankCode: "970436",
    accountNumber: "123456789",
    accountHolder: "QUAN THU NGHIEM",
    transferContent: "BAN A01"
  }
}, "58mm");

assert.ok(unpaidHtml.includes("PHIẾU TẠM TÍNH"), "An unpaid bill must keep the preliminary title.");
assert.ok(unpaidHtml.includes("CHƯA THANH TOÁN"), "An unpaid bill must never print a paid status.");
assert.ok(unpaidHtml.includes("Thuế/VAT 8%"), "Configured transaction tax must be printed.");
assert.ok(unpaidHtml.includes("QUÉT MÃ THANH TOÁN"), "Payment QR must remain available on preliminary bills.");
assert.ok(unpaidHtml.includes("img.vietqr.io/image/970436-123456789-compact2.png"), "Configured bank details must create a transaction QR.");
assert.ok(unpaidHtml.includes("amount=291600"), "The QR must encode the current grand total.");
assert.ok(unpaidHtml.includes("addInfo=BAN+A01"), "The QR must encode the configured transfer content.");
assert.ok(!unpaidHtml.includes("12 Đường Trung Tâm"), "Missing store addresses must be omitted.");

console.log("Invoice print layout checks passed for 58 mm and 80 mm.");
