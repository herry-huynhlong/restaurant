"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import {
  basicPlanFeatures,
  planFeatureOrder,
  proPlanFeatures,
  type CommercialPlan,
  type PlanFeature
} from "@/lib/plan/features";
import { updatePlatformPlanPrice } from "@/server/services/plan-pricing-service";

const planFeatureMap: Record<CommercialPlan, PlanFeature[]> = {
  BASIC: basicPlanFeatures,
  PRO: proPlanFeatures
};

export async function confirmPlanPermissionsAction(formData: FormData) {
  const actor = await requirePlatformOwner();
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

export async function updatePlanPriceAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  try {
    await updatePlatformPlanPrice(actor.id, {
      priceId: String(formData.get("priceId") ?? ""), priceVnd: String(formData.get("priceVnd") ?? ""),
      originalPriceVnd: String(formData.get("originalPriceVnd") ?? ""),
      isActive: formData.get("isActive") === "on", isPublished: formData.get("isPublished") === "on",
      isRecommended: formData.get("isRecommended") === "on", description: String(formData.get("description") ?? "")
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? validationMessage(error) : "Không thể lưu giá. Vui lòng kiểm tra kỳ giá và thử lại.";
    redirect(`${platformRoutes.plans}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(platformRoutes.plans);
  redirect(`${platformRoutes.plans}?success=${encodeURIComponent("Đã lưu bảng giá dịch vụ.")}`);
}

function readSubmittedMatrix(formData: FormData) {
  return (["BASIC", "PRO"] as CommercialPlan[]).reduce<Record<CommercialPlan, PlanFeature[]>>((matrix, plan) => {
    matrix[plan] = planFeatureOrder.filter((feature) => formData.get(`${plan}:${feature}`) === "on" && planFeatureMap[plan].includes(feature));
    return matrix;
  }, { BASIC: [], PRO: [] });
}

function validationMessage(error: z.ZodError) {
  const { fieldErrors, formErrors } = error.flatten();
  return [...formErrors, ...Object.values(fieldErrors).flat()].filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}
