import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { basicPlanFeatures, proPlanFeatures, planFeatureLabels, type PlanFeature } from "@/lib/plan/features";
import { monthlyAverage, discountBasisPoints } from "@/lib/plan/pricing";

export const planPriceInput = z.object({
  priceId: z.string().min(1),
  priceVnd: z.coerce.number().int().min(0).max(999_999_999),
  originalPriceVnd: z.preprocess(v => v === "" || v == null ? null : v, z.coerce.number().int().positive().max(999_999_999).nullable()),
  isActive: z.boolean(), isPublished: z.boolean(), isRecommended: z.boolean(),
  description: z.string().trim().max(400).optional()
}).superRefine((v, ctx) => {
  if (v.originalPriceVnd !== null && (v.originalPriceVnd <= v.priceVnd || v.priceVnd <= 0))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Giá gốc phải lớn hơn giá bán dương; để trống nếu không có ưu đãi." });
  if (v.isPublished && (!v.isActive || v.priceVnd <= 0))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chỉ công bố kỳ đang bán với giá lớn hơn 0." });
});

export async function updatePlatformPlanPrice(actorUserId: string, input: unknown) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { platformRole: true, isActive: true } });
  if (!actor?.isActive || !["PLATFORM_OWNER", "PLATFORM_ADMIN"].includes(actor.platformRole)) throw new Error("Không có quyền chỉnh sửa giá.");
  const value = planPriceInput.parse(input);
  return prisma.$transaction(async tx => {
    // Serialize pricing edits, including cross-row recommendation changes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('PlatformPlanPrice'))`;
    await tx.$queryRaw`SELECT "id" FROM "PlatformPlanPrice" WHERE "id" = ${value.priceId} FOR UPDATE`;
    const current = await tx.platformPlanPrice.findUnique({ where: { id: value.priceId } });
    if (!current || !["BASIC", "PRO"].includes(current.plan) || ![3, 6, 12].includes(current.termMonths)) throw new Error("Không tìm thấy kỳ giá hợp lệ.");
    const description = value.description || null;
    if (value.isRecommended) await tx.platformPlanPrice.updateMany({ where: { plan: current.plan, id: { not: current.id } }, data: { isRecommended: false } });
    const updated = await tx.platformPlanPrice.update({ where: { id: current.id }, data: {
      priceVnd: value.priceVnd, monthlyPriceVnd: monthlyAverage(value.priceVnd, current.termMonths),
      originalPriceVnd: value.originalPriceVnd, isPublished: value.isPublished,
      isActive: value.isActive, isRecommended: value.isRecommended, description
    } });
    await tx.platformPlanPriceHistory.create({ data: {
      priceId: current.id, plan: current.plan, termMonths: current.termMonths,
      oldPriceVnd: current.priceVnd, newPriceVnd: updated.priceVnd,
      oldOriginalPriceVnd: current.originalPriceVnd, newOriginalPriceVnd: updated.originalPriceVnd,
      oldIsPublished: current.isPublished, newIsPublished: updated.isPublished,
      oldIsActive: current.isActive, newIsActive: updated.isActive,
      oldIsRecommended: current.isRecommended, newIsRecommended: updated.isRecommended,
      oldDescription: current.description, newDescription: description, actorUserId
    } });
    await tx.auditLog.create({ data: { userId: actorUserId, action: "PLAN_PRICE_UPDATED", entityType: "PlatformPlanPrice", entityId: current.id,
      metadataJson: { plan: current.plan, termMonths: current.termMonths, oldPriceVnd: current.priceVnd, newPriceVnd: updated.priceVnd,
        oldOriginalPriceVnd: current.originalPriceVnd, newOriginalPriceVnd: updated.originalPriceVnd,
        oldIsPublished: current.isPublished, newIsPublished: updated.isPublished, isActive: updated.isActive, isRecommended: updated.isRecommended } } });
    return updated;
  });
}

function features(plan: "BASIC" | "PRO") {
  const labels: Partial<Record<PlanFeature, string>> = { KITCHEN_FLOW: "Theo dõi tiến độ món tại bếp" };
  return ["Menu QR và gọi món", "Quản lý khu vực và bàn", ...(plan === "BASIC" ? basicPlanFeatures : proPlanFeatures).map(f => labels[f] ?? planFeatureLabels[f].title)];
}

/** Read-only: never seeds prices or exposes internal descriptions/payment data. */
export async function getPublishedPlanPricing() {
  const rows = await prisma.platformPlanPrice.findMany({
    where: { isActive: true, isPublished: true, priceVnd: { gt: 0 }, plan: { in: ["BASIC", "PRO"] }, termMonths: { in: [3, 6, 12] } },
    select: { plan: true, termMonths: true, priceVnd: true, monthlyPriceVnd: true, originalPriceVnd: true, updatedAt: true },
    orderBy: [{ plan: "asc" }, { termMonths: "asc" }]
  });
  const prices = rows.map(row => ({
    plan: row.plan as "BASIC" | "PRO", name: row.plan, termMonths: row.termMonths, currency: "VND" as const,
    priceVnd: row.priceVnd, monthlyPriceVnd: row.monthlyPriceVnd, originalPriceVnd: row.originalPriceVnd,
    discountBasisPoints: discountBasisPoints(row.originalPriceVnd, row.priceVnd),
    features: features(row.plan as "BASIC" | "PRO"), status: "PUBLISHED" as const, updatedAt: row.updatedAt.toISOString()
  }));
  const now = Date.now();
  return { version: createHash("sha256").update(JSON.stringify(prices)).digest("hex"), generatedAt: new Date(now).toISOString(), validUntil: new Date(now + 60_000).toISOString(), terms: [3, 6, 12], prices };
}
