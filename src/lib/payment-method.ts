import type { PaymentMethod } from "@prisma/client";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  QR: "Chuyển khoản",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
  OTHER: "Khác"
};
