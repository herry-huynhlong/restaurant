import { createHash, timingSafeEqual } from "crypto";
import { Prisma, SubscriptionPaymentProvider, SubscriptionPaymentTransactionStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const provider: SubscriptionPaymentProvider = "SEPAY";
const inboundTransferType = "in";
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const sePayPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]),
  accountNumber: z.string().min(1),
  transferType: z.string().min(1),
  transferAmount: z.coerce.number().int().positive(),
  transactionDate: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  referenceCode: z.string().optional().nullable()
}).passthrough();

export type SePayWebhookPayload = z.infer<typeof sePayPayloadSchema>;

export type SePayWebhookResult = {
  duplicate: boolean;
  paymentOrderId: string | null;
  status: "PAID" | "NEEDS_REVIEW" | "IGNORED";
};

export function getSePaySubscriptionWebhookSecret() {
  return process.env.SEPAY_SUBSCRIPTION_WEBHOOK_API_KEY?.trim() || null;
}

export function isAuthorizedSePayWebhook(authorization: string | null, secret: string) {
  const token = authorization?.match(/^Apikey\s+(.+)$/i)?.[1]?.trim();
  if (!token) return false;

  const received = Buffer.from(token);
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function parseSePayWebhookPayload(payload: unknown): SePayWebhookPayload {
  return sePayPayloadSchema.parse(payload);
}

export function getSePayTransferCodeCandidates(payload: Pick<SePayWebhookPayload, "code" | "content">) {
  const candidates = new Set<string>();
  const directCode = normalizeTransferCode(payload.code);
  if (directCode) candidates.add(directCode);

  // The code field is available only when SePay recognizes the configured
  // prefix. Parsing exact QP tokens from content preserves compatibility with
  // older payment orders that used a longer suffix.
  const content = payload.content?.toUpperCase() ?? "";
  for (const match of content.matchAll(/(?:^|[^A-Z0-9])(QP[A-F0-9]{10,16})(?=$|[^A-Z0-9])/g)) {
    candidates.add(match[1]);
  }

  return [...candidates];
}

export async function processSePaySubscriptionWebhook({
  payload,
  rawPayload,
  receivedAt = new Date()
}: {
  payload: SePayWebhookPayload;
  rawPayload: Prisma.InputJsonValue;
  receivedAt?: Date;
}): Promise<SePayWebhookResult> {
  const providerEventId = String(payload.id);
  const payloadHash = createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
  const candidateCodes = getSePayTransferCodeCandidates(payload);

  try {
    return await prisma.$transaction(async (tx) => {
      const priorEvent = await tx.paymentWebhookEvent.findUnique({
        where: { provider_providerEventId: { provider, providerEventId } },
        select: { paymentOrderId: true, status: true, paymentOrder: { select: { status: true } } }
      });
      if (priorEvent) {
        return {
          duplicate: true,
          paymentOrderId: priorEvent.paymentOrderId,
          status: duplicateEventStatus(priorEvent)
        };
      }

      const order = await findLockedPaymentOrder(tx, candidateCodes);
      const event = await tx.paymentWebhookEvent.create({
        data: {
          restaurantId: order?.restaurantId ?? null,
          paymentOrderId: order?.id ?? null,
          provider,
          providerEventId,
          status: "PROCESSING",
          payloadHash,
          payloadJson: rawPayload,
          attemptCount: 1,
          receivedAt
        }
      });

      if (!order) {
        await tx.paymentWebhookEvent.update({
          where: { id: event.id },
          data: { status: "IGNORED", processedAt: receivedAt, lastError: "PAYMENT_CODE_NOT_FOUND" }
        });
        return { duplicate: false, paymentOrderId: null, status: "IGNORED" };
      }

      if (order.provider !== provider) {
        await completeIgnoredEvent(tx, event.id, order, "ORDER_NOT_SEPAY", receivedAt);
        return { duplicate: false, paymentOrderId: order.id, status: "IGNORED" };
      }

      const providerOccurredAt = parseSePayTransactionDate(payload.transactionDate);
      const reviewReason = getReviewReason({ order, payload, providerOccurredAt, receivedAt });
      if (reviewReason) {
        const transactionStatus: SubscriptionPaymentTransactionStatus = order.status === "PAID" ? "DUPLICATE" : "UNMATCHED";
        const transaction = await tx.subscriptionPaymentTransaction.create({
          data: {
            restaurantId: order.restaurantId,
            paymentOrderId: order.id,
            provider,
            providerTransactionId: providerEventId,
            status: transactionStatus,
            amountVnd: payload.transferAmount,
            transferContent: payload.content?.trim() || payload.code?.trim() || null,
            receivedAt,
            providerOccurredAt,
            payloadJson: rawPayload
          }
        });
        await tx.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            paymentTransactionId: transaction.id,
            status: "PROCESSED",
            processedAt: receivedAt,
            lastError: reviewReason
          }
        });
        if (order.status === "PENDING") {
          await tx.subscriptionPaymentOrder.update({
            where: { id: order.id },
            data: { status: "NEEDS_REVIEW" }
          });
        }
        await writePaymentAudit(tx, order, "SUBSCRIPTION_PAYMENT_NEEDS_REVIEW", {
          providerTransactionId: providerEventId,
          amountVnd: payload.transferAmount,
          reason: reviewReason
        });
        return { duplicate: false, paymentOrderId: order.id, status: "NEEDS_REVIEW" };
      }

      const transaction = await tx.subscriptionPaymentTransaction.create({
        data: {
          restaurantId: order.restaurantId,
          paymentOrderId: order.id,
          provider,
          providerTransactionId: providerEventId,
          status: "MATCHED",
          amountVnd: payload.transferAmount,
          transferContent: payload.content?.trim() || payload.code?.trim() || null,
          receivedAt,
          providerOccurredAt,
          payloadJson: rawPayload
        }
      });
      await tx.subscriptionPaymentOrder.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: providerOccurredAt ?? receivedAt }
      });
      await tx.paymentWebhookEvent.update({
        where: { id: event.id },
        data: {
          paymentTransactionId: transaction.id,
          status: "PROCESSED",
          processedAt: receivedAt,
          lastError: null
        }
      });
      await tx.restaurantSubscriptionEvent.create({
        data: {
          restaurantId: order.restaurantId,
          requestId: order.subscriptionRequestId,
          action: "SUBSCRIPTION_PAYMENT_VERIFIED",
          plan: order.plan,
          termMonths: order.termMonths,
          priceVnd: order.amountVnd,
          metadataJson: {
            paymentOrderId: order.id,
            provider,
            providerTransactionId: providerEventId
          }
        }
      });
      await writePaymentAudit(tx, order, "SUBSCRIPTION_PAYMENT_VERIFIED", {
        providerTransactionId: providerEventId,
        amountVnd: payload.transferAmount
      });
      return { duplicate: false, paymentOrderId: order.id, status: "PAID" };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const priorEvent = await prisma.paymentWebhookEvent.findUnique({
        where: { provider_providerEventId: { provider, providerEventId } },
        select: { paymentOrderId: true, status: true, paymentOrder: { select: { status: true } } }
      });
      if (priorEvent) {
        return {
          duplicate: true,
          paymentOrderId: priorEvent.paymentOrderId,
          status: duplicateEventStatus(priorEvent)
        };
      }
    }
    throw error;
  }
}

async function findLockedPaymentOrder(tx: TransactionClient, transferCodes: string[]) {
  if (transferCodes.length === 0) return null;
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM "SubscriptionPaymentOrder"
    WHERE "transferCode" IN (${Prisma.join(transferCodes)})
    ORDER BY "createdAt" DESC
    LIMIT 1
    FOR UPDATE
  `);
  return locked[0]
    ? tx.subscriptionPaymentOrder.findUnique({ where: { id: locked[0].id } })
    : null;
}

function getReviewReason({
  order,
  payload,
  providerOccurredAt,
  receivedAt
}: {
  order: { status: string; amountVnd: number; receiverAccountNumber: string | null; expiresAt: Date };
  payload: SePayWebhookPayload;
  providerOccurredAt: Date | null;
  receivedAt: Date;
}) {
  if (order.status === "PAID") return "ORDER_ALREADY_PAID";
  if (order.status !== "PENDING") return "ORDER_NOT_PENDING";
  if (payload.transferType.trim().toLowerCase() !== inboundTransferType) return "TRANSFER_NOT_INBOUND";
  if (payload.transferAmount !== order.amountVnd) return "AMOUNT_MISMATCH";
  if (!order.receiverAccountNumber || normalizeAccountNumber(payload.accountNumber) !== normalizeAccountNumber(order.receiverAccountNumber)) {
    return "RECEIVER_ACCOUNT_MISMATCH";
  }
  if ((providerOccurredAt ?? receivedAt).getTime() > order.expiresAt.getTime()) return "PAYMENT_AFTER_EXPIRY";
  return null;
}

async function completeIgnoredEvent(
  tx: TransactionClient,
  eventId: string,
  order: { id: string; restaurantId: string; subscriptionRequestId: string; plan: string; termMonths: number; amountVnd: number },
  reason: string,
  processedAt: Date
) {
  await tx.paymentWebhookEvent.update({
    where: { id: eventId },
    data: { status: "IGNORED", processedAt, lastError: reason }
  });
  await writePaymentAudit(tx, order, "SUBSCRIPTION_PAYMENT_WEBHOOK_IGNORED", { reason });
}

async function writePaymentAudit(
  tx: TransactionClient,
  order: { id: string; restaurantId: string; subscriptionRequestId: string },
  action: string,
  metadataJson: Prisma.InputJsonObject
) {
  await tx.auditLog.create({
    data: {
      restaurantId: order.restaurantId,
      action,
      entityType: "SubscriptionPaymentOrder",
      entityId: order.id,
      metadataJson: { subscriptionRequestId: order.subscriptionRequestId, ...metadataJson }
    }
  });
}

function parseSePayTransactionDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTransferCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^QP[A-F0-9]{10,16}$/.test(normalized) ? normalized : null;
}

function normalizeAccountNumber(value: string) {
  return value.replace(/\s+/g, "");
}

function duplicateEventStatus(event: {
  status: string;
  paymentOrder: { status: string } | null;
}): SePayWebhookResult["status"] {
  if (event.status === "IGNORED") return "IGNORED";
  return event.paymentOrder?.status === "PAID" ? "PAID" : "NEEDS_REVIEW";
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
