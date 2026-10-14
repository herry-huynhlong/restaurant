"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { createSubscriptionRequest, subscriptionTerms } from "@/server/services/subscription-service";

const requestSchema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
  termMonths: z.coerce.number().refine((value) => subscriptionTerms.includes(value as never), "Thời hạn đăng ký không hợp lệ."),
  requestType: z.enum(["RENEWAL", "UPGRADE"]).optional()
});

export async function createRestaurantSubscriptionRequestAction(slug: string, formData: FormData) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER"]);
  const parsed = requestSchema.safeParse({
    plan: String(formData.get("plan") ?? ""),
    termMonths: String(formData.get("termMonths") ?? ""),
    requestType: String(formData.get("requestType") ?? "RENEWAL")
  });

  if (!parsed.success) {
    redirectWithError(slug, validationMessage(parsed.error));
  }

  try {
    await createSubscriptionRequest({
      restaurantId: access.restaurant.id,
      requestedByUserId: access.user.id,
      plan: parsed.data.plan,
      termMonths: parsed.data.termMonths as 3 | 6 | 12,
      requestType: parsed.data.requestType
    });
  } catch (error) {
    redirectWithError(slug, error instanceof Error ? error.message : "Chưa thể gửi yêu cầu đăng ký.");
  }

  revalidatePath(restaurantRoutes.adminSubscription(slug));
  redirect(`${restaurantRoutes.adminSubscription(slug)}?success=${encodeURIComponent("Đã gửi yêu cầu thành công. Chúng tôi sẽ xác nhận sau khi kiểm tra thanh toán.")}`);
}

function validationMessage(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.values(fieldErrors).flat().filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}

function redirectWithError(slug: string, message: string): never {
  redirect(`${restaurantRoutes.adminSubscription(slug)}?error=${encodeURIComponent(message)}`);
}
