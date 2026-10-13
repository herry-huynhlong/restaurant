"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import {
  basicPlanFeatures,
  planFeatureOrder,
  proPlanFeatures,
  type CommercialPlan,
  type PlanFeature
} from "@/lib/plan/features";
import { ensureDefaultPlanPrices, ensureSubscriptionPolicy } from "@/server/services/subscription-service";

const planFeatureMap: Record<CommercialPlan, PlanFeature[]> = {
  BASIC: basicPlanFeatures,
  PRO: proPlanFeatures
};

export async function confirmPlanPermissionsAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const submitted = readSubmittedMatrix(formData);
  const current = {
    BASIC: [...basicPlanFeatures],
    PRO: [...proPlanFeatures]
  };

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: "PLAN_PERMISSION_MATRIX_CONFIRMED",
      entityType: "PlatformPlan",
      metadataJson: {
        submitted,
        current
      }
    }
  });

  revalidatePath(platformRoutes.plans);
  redirect(`${platformRoutes.plans}?success=${encodeURIComponent("Đã ghi nhận xác nhận quyền lợi gói dịch vụ.")}`);
}

const planPriceSchema = z.object({
  priceId: z.string().min(1),
  priceVnd: z.coerce.number().int().min(0, "Giá bán không hợp lệ.").max(999_999_999, "Giá bán quá lớn."),
  isActive: z.boolean(),
  isRecommended: z.boolean(),
  description: z.string().trim().max(400, "Mô tả quá dài.").optional()
});

export async function updatePlanPriceAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  await ensureDefaultPlanPrices();
  const parsed = planPriceSchema.safeParse({
    priceId: String(formData.get("priceId") ?? ""),
    priceVnd: String(formData.get("priceVnd") ?? ""),
    isActive: formData.get("isActive") === "on",
    isRecommended: formData.get("isRecommended") === "on",
    description: String(formData.get("description") ?? "").trim()
  });

  if (!parsed.success) {
    redirect(`${platformRoutes.plans}?error=${encodeURIComponent(validationMessage(parsed.error))}`);
  }

  const current = await prisma.platformPlanPrice.findUnique({
    where: { id: parsed.data.priceId }
  });
  if (!current) {
    redirect(`${platformRoutes.plans}?error=${encodeURIComponent("Không tìm thấy kỳ giá.")}`);
  }

  const monthlyPriceVnd = parsed.data.priceVnd > 0 ? Math.round(parsed.data.priceVnd / current.termMonths) : 0;
  const description = parsed.data.description || null;

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isRecommended) {
      await tx.platformPlanPrice.updateMany({
        where: { plan: current.plan, id: { not: current.id } },
        data: { isRecommended: false }
      });
    }

    await tx.platformPlanPrice.update({
      where: { id: current.id },
      data: {
        priceVnd: parsed.data.priceVnd,
        monthlyPriceVnd,
        isActive: parsed.data.isActive,
        isRecommended: parsed.data.isRecommended,
        description
      }
    });

    await tx.platformPlanPriceHistory.create({
      data: {
        priceId: current.id,
        plan: current.plan,
        termMonths: current.termMonths,
        oldPriceVnd: current.priceVnd,
        newPriceVnd: parsed.data.priceVnd,
        oldIsActive: current.isActive,
        newIsActive: parsed.data.isActive,
        oldIsRecommended: current.isRecommended,
        newIsRecommended: parsed.data.isRecommended,
        oldDescription: current.description,
        newDescription: description,
        actorUserId: actor.id
      }
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: "PLAN_PRICE_UPDATED",
        entityType: "PlatformPlanPrice",
        entityId: current.id,
        metadataJson: {
          plan: current.plan,
          termMonths: current.termMonths,
          oldPriceVnd: current.priceVnd,
          newPriceVnd: parsed.data.priceVnd,
          isActive: parsed.data.isActive,
          isRecommended: parsed.data.isRecommended
        }
      }
    });
  });

  revalidatePath(platformRoutes.plans);
  redirect(`${platformRoutes.plans}?success=${encodeURIComponent("Đã lưu bảng giá dịch vụ.")}`);
}

const subscriptionPolicySchema = z.object({
  trialEnabled: z.boolean(),
  trialDays: z.coerce.number().int().min(0, "Số ngày dùng thử không hợp lệ.").max(365, "Số ngày dùng thử quá lớn."),
  trialRestaurantLimit: z.coerce.number().int().min(0, "Giới hạn cửa hàng không hợp lệ.").max(100000, "Giới hạn cửa hàng quá lớn."),
  gracePeriodDays: z.coerce.number().int().min(0, "Số ngày gia hạn không hợp lệ.").max(30, "Thời gian gia hạn quá dài.")
});

export async function updateSubscriptionPolicyAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const parsed = subscriptionPolicySchema.safeParse({
    trialEnabled: formData.get("trialEnabled") === "on",
    trialDays: String(formData.get("trialDays") ?? ""),
    trialRestaurantLimit: String(formData.get("trialRestaurantLimit") ?? ""),
    gracePeriodDays: String(formData.get("gracePeriodDays") ?? "")
  });

  if (!parsed.success) {
    redirect(`${platformRoutes.plans}?error=${encodeURIComponent(validationMessage(parsed.error))}`);
  }

  const policy = await ensureSubscriptionPolicy();
  await prisma.$transaction([
    prisma.platformSubscriptionPolicy.update({
      where: { id: policy.id },
      data: parsed.data
    }),
    prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: "SUBSCRIPTION_POLICY_UPDATED",
        entityType: "PlatformSubscriptionPolicy",
        entityId: policy.id,
        metadataJson: parsed.data
      }
    })
  ]);

  revalidatePath(platformRoutes.plans);
  redirect(`${platformRoutes.plans}?success=${encodeURIComponent("Đã lưu chính sách đăng ký.")}`);
}

function readSubmittedMatrix(formData: FormData) {
  return (["BASIC", "PRO"] as CommercialPlan[]).reduce<Record<CommercialPlan, PlanFeature[]>>((matrix, plan) => {
    matrix[plan] = planFeatureOrder.filter((feature) => formData.get(`${plan}:${feature}`) === "on" && planFeatureMap[plan].includes(feature));
    return matrix;
  }, { BASIC: [], PRO: [] });
}

function validationMessage(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.values(fieldErrors).flat().filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}
