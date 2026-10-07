import type { PaymentMethod, RestaurantSetting } from "@prisma/client";
import { paymentMethodLabels } from "@/lib/payment-method";

type OrderWithItems = {
  items: Array<{
    subtotal: number;
    unitPriceSnapshot: number;
    quantity: number;
    productNameViSnapshot: string;
  }>;
};

export type BillSummary = {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
};

export function calculateBillSummary(orders: OrderWithItems[], settings?: Pick<RestaurantSetting, "taxEnabled" | "taxRate"> | null): BillSummary {
  const subtotal = orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.subtotal, 0), 0);
  const taxRate = settings?.taxEnabled ? Number(settings.taxRate) : 0;
  const taxAmount = taxRate > 0 ? Math.round(subtotal * taxRate / 100) : 0;
  return {
    subtotal,
    taxRate,
    taxAmount,
    grandTotal: subtotal + taxAmount
  };
}

export function generateInvoiceNumber(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
  const suffix = `${date.getTime()}`.slice(-6);
  return `INV-${stamp}-${suffix}`;
}

export function readPaymentMethod(value: FormDataEntryValue | null): PaymentMethod {
  const method = String(value ?? "CASH");
  return method === "BANK_TRANSFER" || method === "CARD" || method === "QR" || method === "OTHER" ? method : "CASH";
}

export { paymentMethodLabels };
