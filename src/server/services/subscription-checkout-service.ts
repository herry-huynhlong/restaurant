import { prisma } from "@/lib/db/prisma";
import {
  getSubscriptionPaymentOrderExpiresAt,
  getSubscriptionPaymentOrderExpiryCutoff
} from "@/server/services/subscription-payment-order-expiry";

export async function getSubscriptionCheckoutOrder({
  restaurantId,
  paymentOrderId
}: {
  restaurantId: string;
  paymentOrderId: string;
}) {
  const order = await prisma.subscriptionPaymentOrder.findFirst({
    where: { id: paymentOrderId, restaurantId },
    select: {
      id: true,
      status: true,
      plan: true,
      termMonths: true,
      amountVnd: true,
      currency: true,
      transferCode: true,
      createdAt: true,
      expiresAt: true,
      paidAt: true,
      receiverBankCode: true,
      receiverAccountNumber: true,
      receiverAccountName: true,
      paymentConfigVersion: true
    }
  });
  if (!order) return null;

  const effectiveExpiresAt = getSubscriptionPaymentOrderExpiresAt(order);
  const effectiveStatus = getEffectiveSubscriptionPaymentOrderStatus(order.status, effectiveExpiresAt);
  const bank = order.receiverBankCode && order.receiverAccountNumber
    ? {
        ready: true as const,
        bankCode: order.receiverBankCode,
        accountNumber: order.receiverAccountNumber,
        accountName: order.receiverAccountName,
        configVersion: order.paymentConfigVersion
      }
    : { ready: false as const };

  return {
    ...order,
    expiresAt: effectiveExpiresAt,
    status: effectiveStatus,
    bank,
    qrImageUrl: bank.ready && effectiveStatus === "PENDING"
      ? createSubscriptionVietQrImageUrl({
          bankCode: bank.bankCode,
          accountNumber: bank.accountNumber,
          accountName: bank.accountName,
          amountVnd: order.amountVnd,
          transferCode: order.transferCode
        })
      : null
  };
}

export async function getActiveSubscriptionPaymentOrders(restaurantId: string) {
  return prisma.subscriptionPaymentOrder.findMany({
    where: {
      restaurantId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
      createdAt: { gt: getSubscriptionPaymentOrderExpiryCutoff() }
    },
    select: {
      id: true,
      subscriptionRequestId: true,
      plan: true,
      termMonths: true,
      amountVnd: true,
      createdAt: true,
      expiresAt: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function expireStaleSubscriptionPaymentOrders(now = new Date()) {
  const result = await prisma.subscriptionPaymentOrder.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { expiresAt: { lte: now } },
        { createdAt: { lte: getSubscriptionPaymentOrderExpiryCutoff(now) } }
      ]
    },
    data: { status: "EXPIRED" }
  });
  return result.count;
}

export function getEffectiveSubscriptionPaymentOrderStatus(
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "NEEDS_REVIEW",
  expiresAt: Date,
  now = new Date()
) {
  return status === "PENDING" && expiresAt.getTime() <= now.getTime() ? "EXPIRED" : status;
}

export function createSubscriptionVietQrImageUrl({
  bankCode,
  accountNumber,
  accountName,
  amountVnd,
  transferCode
}: {
  bankCode: string;
  accountNumber: string;
  accountName: string | null;
  amountVnd: number;
  transferCode: string;
}) {
  const url = new URL(`https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNumber)}-compact2.png`);
  url.searchParams.set("amount", String(amountVnd));
  url.searchParams.set("addInfo", transferCode);
  if (accountName) url.searchParams.set("accountName", accountName);
  return url.toString();
}
