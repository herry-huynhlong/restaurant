"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
        current,
        source: "src/lib/plan/features.ts"
      }
    }
  });

  revalidatePath(platformRoutes.plans);
  redirect(`${platformRoutes.plans}?success=${encodeURIComponent("Đã ghi nhận cấu hình quyền gói dịch vụ hiện tại.")}`);
}

function readSubmittedMatrix(formData: FormData) {
  return (["BASIC", "PRO"] as CommercialPlan[]).reduce<Record<CommercialPlan, PlanFeature[]>>((matrix, plan) => {
    matrix[plan] = planFeatureOrder.filter((feature) => formData.get(`${plan}:${feature}`) === "on" && planFeatureMap[plan].includes(feature));
    return matrix;
  }, { BASIC: [], PRO: [] });
}
