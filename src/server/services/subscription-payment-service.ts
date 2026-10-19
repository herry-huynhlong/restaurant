import { randomBytes } from "crypto";
import { Prisma, SubscriptionPaymentProvider } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { addCalendarMonths } from "@/server/services/subscription-service";
import { getPaymentReceiverSnapshot } from "@/server/services/platform-subscription-payment-config-service";

const paymentOrderIdempotencyPrefix = "subscription-payment-order:v1:";

type CreateSubscriptionPaymentOrderInput = {
  restaurantId: string;
  requestedByUserId: string;
  subscriptionRequestId: string;
};

export async function createSubscriptionPaymentOrder(input: CreateSubscriptionPaymentOrderInput) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const requestPreview = await tx.restaurantSubscriptionRequest.findUnique({
      where: { id: input.subscriptionRequestId },
      select: { restaurantId: true }
    });
    if (!requestPreview || requestPreview.restaurantId !== input.restaurantId) {
      throw new Error("Không tìm thấy yêu cầu đăng ký của cửa hàng này.");
    }

    const lockedRestaurant = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "Restaurant"
      WHERE id = ${input.restaurantId}
      FOR UPDATE
    `;
    if (lockedRestaurant.length === 0) throw new Error("Nhà hàng không hợp lệ.");

    const lockedRequest = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "RestaurantSubscriptionRequest"
      WHERE id = ${input.subscriptionRequestId}
      FOR UPDATE
    `;
    if (lockedRequest.length === 0) throw new Error("Không tìm thấy yêu cầu đăng ký.");

    const request = await tx.restaurantSubscriptionRequest.findUnique({
      where: { id: input.subscriptionRequestId }
    });
    if (!request || request.restaurantId !== input.restaurantId) {
      throw new Error("Không tìm thấy yêu cầu đăng ký của cửa hàng này.");
    }
    if (request.requestedByUserId !== input.requestedByUserId) {
      throw new Error("Bạn không có quyền thanh toán yêu cầu này.");
    }
    if (request.status !== "PENDING") {
      throw new Error("Yêu cầu này không còn chờ thanh toán.");
    }
    if (!request.quoteExpiresAt || request.quoteExpiresAt.getTime() <= now.getTime()) {
      throw new Error("Báo giá đã hết hạn. Vui lòng tạo yêu cầu mới.");
    }
    if (!Number.isSafeInteger(request.priceVnd) || request.priceVnd <= 0) {
      throw new Error("Số tiền báo giá không hợp lệ.");
    }

    // Upgrade quotes created before the entitlement ledger cannot prove the
    // value paid for every early BASIC renewal, so they must not be charged.
    if (request.requestType === "UPGRADE") {
      throw new Error("Chưa thể tạo thanh toán nâng cấp khi lịch sử quyền lợi chưa đủ để tính chính xác.");
    }

    await tx.subscriptionPaymentOrder.updateMany({
      where: {
        subscriptionRequestId: request.id,
        status: "PENDING",
        expiresAt: { lte: now }
      },
      data: { status: "EXPIRED" }
    });

    const idempotencyKey = `${paymentOrderIdempotencyPrefix}${request.id}`;
    const existing = await tx.subscriptionPaymentOrder.findFirst({
      where: {
        subscriptionRequestId: request.id,
        idempotencyKey,
        status: "PENDING",
        expiresAt: { gt: now }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return existing;

    const paymentConfig = await tx.platformSubscriptionPaymentConfig.findUnique({
      where: { singletonKey: "default" }
    });
    const receiver = paymentConfig ? getPaymentReceiverSnapshot(paymentConfig) : null;
    if (!receiver) {
      throw new Error("Thanh toán chuyển khoản hiện chưa sẵn sàng. Vui lòng liên hệ QuánPilot.");
    }

    const entitlementStart = request.currentSubscriptionEnd && request.currentSubscriptionEnd.getTime() > now.getTime()
      ? request.currentSubscriptionEnd
      : now;
    const entitlementEnd = addCalendarMonths(entitlementStart, request.termMonths);
    const priceSnapshot = {
      source: "RESTAURANT_SUBSCRIPTION_REQUEST",
      requestId: request.id,
      requestType: request.requestType,
      plan: request.plan,
      termMonths: request.termMonths,
      amountVnd: request.priceVnd,
      monthlyPriceVnd: request.monthlyPriceVnd,
      quotedAt: request.createdAt.toISOString(),
      quoteExpiresAt: request.quoteExpiresAt.toISOString(),
      requestPricingSnapshot: request.pricingSnapshotJson ?? { unavailable: true }
    } as Prisma.InputJsonObject;
    const entitlementSnapshot = {
      plan: request.plan,
      termMonths: request.termMonths,
      amountVnd: request.priceVnd,
      startsAt: entitlementStart.toISOString(),
      endsAt: entitlementEnd.toISOString(),
      source: "PAYMENT_ORDER_AFTER_CONFIRMED_PAYMENT"
    } satisfies Prisma.InputJsonObject;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const order = await tx.subscriptionPaymentOrder.create({
          data: {
            restaurantId: request.restaurantId,
            subscriptionRequestId: request.id,
            requestedByUserId: input.requestedByUserId,
            provider: getSubscriptionPaymentProvider(),
            status: "PENDING",
            idempotencyKey,
            transferCode: createTransferCode(),
            requestType: request.requestType,
            plan: request.plan,
            termMonths: request.termMonths,
            amountVnd: request.priceVnd,
            receiverBankCode: receiver.bankCode,
            receiverAccountNumber: receiver.accountNumber,
            receiverAccountName: receiver.accountName,
            paymentConfigVersion: receiver.configVersion,
            priceSnapshotJson: priceSnapshot,
            entitlementSnapshotJson: entitlementSnapshot,
            expiresAt: request.quoteExpiresAt
          }
        });

        await tx.restaurantSubscriptionEvent.create({
          data: {
            restaurantId: request.restaurantId,
            requestId: request.id,
            actorUserId: input.requestedByUserId,
            action: "SUBSCRIPTION_PAYMENT_ORDER_CREATED",
            plan: request.plan,
            termMonths: request.termMonths,
            priceVnd: request.priceVnd,
            metadataJson: {
              paymentOrderId: order.id,
              transferCode: order.transferCode,
              provider: order.provider,
              expiresAt: order.expiresAt.toISOString(),
              receiverBankCode: receiver.bankCode,
              receiverAccountSuffix: maskAccountNumber(receiver.accountNumber),
              paymentConfigVersion: receiver.configVersion
            }
          }
        });
        await tx.auditLog.create({
          data: {
            restaurantId: request.restaurantId,
            userId: input.requestedByUserId,
            action: "SUBSCRIPTION_PAYMENT_ORDER_CREATED",
            entityType: "SubscriptionPaymentOrder",
            entityId: order.id,
            metadataJson: {
              subscriptionRequestId: request.id,
              transferCode: order.transferCode,
              amountVnd: order.amountVnd,
              provider: order.provider,
              receiverBankCode: receiver.bankCode,
              receiverAccountSuffix: maskAccountNumber(receiver.accountNumber),
              paymentConfigVersion: receiver.configVersion
            }
          }
        });

        return order;
      } catch (error) {
        if (!isUniqueTransferCodeError(error) || attempt === 4) throw error;
      }
    }

    throw new Error("Không thể tạo mã chuyển khoản. Vui lòng thử lại.");
  });
}

function createTransferCode() {
  // SePay payment-code rules support a short alphabetic prefix and up to ten
  // alphanumeric suffix characters. Older, longer QP codes remain matchable.
  return `QP${randomBytes(5).toString("hex").toUpperCase()}`;
}

function getSubscriptionPaymentProvider(): SubscriptionPaymentProvider {
  return process.env.SEPAY_SUBSCRIPTION_WEBHOOK_API_KEY?.trim() ? "SEPAY" : "MOCK";
}

function maskAccountNumber(accountNumber: string) {
  return accountNumber.length <= 4 ? "****" : `****${accountNumber.slice(-4)}`;
}

function isUniqueTransferCodeError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2002"
    && Array.isArray(error.meta?.target)
    && error.meta.target.includes("transferCode");
}
