"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { safeErrorMessage } from "@/lib/safe-user-message";
import { createSubscriptionPaymentOrder } from "@/server/services/subscription-payment-service";
import { createSubscriptionRequest, subscriptionTerms } from "@/server/services/subscription-service";

const requestSchema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
  termMonths: z.coerce.number().refine((value) => subscriptionTerms.includes(value as never), "Thời hạn đăng ký không hợp lệ."),
  requestType: z.enum(["RENEWAL", "UPGRADE"]).optional()
});

export async function createRestaurantSubscriptionRequestAction(slug: string, formData: FormData) {
  const access = await requireRestaurantAccess(slug, ["OWNER"], { allowExpiredSubscription: true });
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
    redirectWithError(slug, safeErrorMessage(error, "Chưa thể gửi yêu cầu đăng ký."));
  }

  revalidatePath(restaurantRoutes.adminSubscription(slug));
  redirect(`${restaurantRoutes.adminSubscription(slug)}?success=${encodeURIComponent("Đã tạo yêu cầu thanh toán. Gói sẽ được kích hoạt tự động sau khi SePay xác minh giao dịch.")}`);
}

const paymentOrderSchema = z.object({
  subscriptionRequestId: z.string().cuid()
});

const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
  termMonths: z.number().refine((value) => subscriptionTerms.includes(value as never), "Thời hạn đăng ký không hợp lệ.")
});

export type SubscriptionCheckoutActionResult =
  | { ok: true; paymentOrderId: string }
  | { ok: false; message: string };

// The payment screen is introduced in a later phase. Keeping the owner-scoped
// action here establishes the server-side tenant boundary before that UI exists.
export async function createRestaurantSubscriptionPaymentOrderAction(slug: string, formData: FormData) {
  const access = await requireRestaurantAccess(slug, ["OWNER"], { allowExpiredSubscription: true });
  const parsed = paymentOrderSchema.safeParse({
    subscriptionRequestId: String(formData.get("subscriptionRequestId") ?? "")
  });

  if (!parsed.success) {
    redirectWithError(slug, validationMessage(parsed.error));
  }

  try {
    await createSubscriptionPaymentOrder({
      restaurantId: access.restaurant.id,
      requestedByUserId: access.user.id,
      subscriptionRequestId: parsed.data.subscriptionRequestId
    });
  } catch (error) {
    redirectWithError(slug, safeErrorMessage(error, "Chưa thể tạo lệnh thanh toán."));
  }

  revalidatePath(restaurantRoutes.adminSubscription(slug));
  redirect(`${restaurantRoutes.adminSubscription(slug)}?success=${encodeURIComponent("Đã tạo lệnh thanh toán.")}`);
}

export async function startSubscriptionCheckoutAction(
  slug: string,
  input: { plan: "BASIC" | "PRO"; termMonths: number }
): Promise<SubscriptionCheckoutActionResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: validationMessage(parsed.error) };

  const access = await requireRestaurantAccess(slug, ["OWNER"], { allowExpiredSubscription: true });
  const now = new Date();
  let request = await prisma.restaurantSubscriptionRequest.findFirst({
    where: {
      restaurantId: access.restaurant.id,
      status: "PENDING",
      quoteExpiresAt: { gt: now }
    },
    orderBy: { createdAt: "desc" }
  });

  if (request && (request.plan !== parsed.data.plan || request.termMonths !== parsed.data.termMonths || request.requestType === "UPGRADE")) {
    return { ok: false, message: "Bạn đang có một báo giá khác chờ thanh toán. Vui lòng hoàn tất hoặc chờ báo giá đó hết hạn." };
  }

  if (!request) {
    try {
      request = await createSubscriptionRequest({
        restaurantId: access.restaurant.id,
        requestedByUserId: access.user.id,
        plan: parsed.data.plan,
        termMonths: parsed.data.termMonths as 3 | 6 | 12,
        requestType: "RENEWAL"
      });
    } catch (error) {
      request = await prisma.restaurantSubscriptionRequest.findFirst({
        where: {
          restaurantId: access.restaurant.id,
          status: "PENDING",
          quoteExpiresAt: { gt: new Date() },
          plan: parsed.data.plan,
          termMonths: parsed.data.termMonths,
          requestType: "RENEWAL"
        },
        orderBy: { createdAt: "desc" }
      });
      if (!request) {
        return { ok: false, message: safeErrorMessage(error, "Chưa thể tạo báo giá thanh toán.") };
      }
    }
  }

  try {
    const paymentOrder = await createSubscriptionPaymentOrder({
      restaurantId: access.restaurant.id,
      requestedByUserId: access.user.id,
      subscriptionRequestId: request.id
    });
    revalidatePath(restaurantRoutes.adminSubscription(slug));
    return { ok: true, paymentOrderId: paymentOrder.id };
  } catch (error) {
    return { ok: false, message: safeErrorMessage(error, "Chưa thể tạo lệnh thanh toán.") };
  }
}

function validationMessage(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.values(fieldErrors).flat().filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}

function redirectWithError(slug: string, message: string): never {
  redirect(`${restaurantRoutes.adminSubscription(slug)}?error=${encodeURIComponent(message)}`);
}
