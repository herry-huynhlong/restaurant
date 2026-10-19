"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { supportedVietQrBankCodes } from "@/server/services/platform-subscription-payment-config-service";

const platformPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại."),
  newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự."),
  confirmPassword: z.string().min(1, "Vui lòng nhập xác nhận mật khẩu.")
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp.",
  path: ["confirmPassword"]
});

const subscriptionPaymentConfigSchema = z.object({
  isEnabled: z.boolean(),
  bankCode: z.string().trim().toUpperCase().optional(),
  accountNumber: z.string().trim().optional(),
  accountName: z.string().trim().max(120, "Tên chủ tài khoản quá dài.").optional()
}).superRefine((value, context) => {
  if (!value.isEnabled) return;
  if (!value.bankCode || !supportedVietQrBankCodes.has(value.bankCode)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["bankCode"], message: "Vui lòng chọn ngân hàng hỗ trợ VietQR." });
  }
  const accountNumber = value.accountNumber?.replace(/\s+/g, "") ?? "";
  if (!/^\d{6,30}$/.test(accountNumber)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["accountNumber"], message: "Số tài khoản chỉ gồm 6-30 chữ số." });
  }
  if (!value.accountName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["accountName"], message: "Vui lòng nhập tên chủ tài khoản." });
  }
});

export async function changePlatformAdminPasswordAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const path = platformRoutes.settings;
  const parsed = platformPasswordSchema.safeParse({
    currentPassword: readString(formData, "currentPassword"),
    newPassword: readString(formData, "newPassword"),
    confirmPassword: readString(formData, "confirmPassword")
  });

  if (!parsed.success) {
    redirectWithError(path, validationMessage(parsed.error));
  }

  const user = await prisma.user.findFirst({
    where: {
      id: actor.id,
      platformRole: { in: ["PLATFORM_OWNER", "PLATFORM_ADMIN"] },
      isActive: true
    },
    select: {
      id: true,
      passwordHash: true
    }
  });

  if (!user) {
    redirectWithError(path, "Tài khoản quản trị nền tảng không hợp lệ.");
  }

  const passwordMatches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!passwordMatches) {
    redirectWithError(path, "Mật khẩu hiện tại không đúng.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PLATFORM_ADMIN_PASSWORD_CHANGED",
        entityType: "User",
        entityId: user.id,
        metadataJson: { selfService: true }
      }
    })
  ]);

  revalidatePath(path);
  redirectWithSuccess(path, "Đã đổi mật khẩu quản trị nền tảng.");
}

export async function updateSubscriptionPaymentConfigAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const path = platformRoutes.settings;
  const parsed = subscriptionPaymentConfigSchema.safeParse({
    isEnabled: formData.get("isEnabled") === "on",
    bankCode: readString(formData, "bankCode") || undefined,
    accountNumber: readString(formData, "accountNumber") || undefined,
    accountName: readString(formData, "accountName") || undefined
  });
  if (!parsed.success) redirectWithError(path, validationMessage(parsed.error));

  const bankCode = parsed.data.bankCode || null;
  const accountNumber = parsed.data.accountNumber?.replace(/\s+/g, "") || null;
  const accountName = parsed.data.accountName || null;

  await prisma.$transaction(async (tx) => {
    const previous = await tx.platformSubscriptionPaymentConfig.findUnique({
      where: { singletonKey: "default" }
    });
    const config = await tx.platformSubscriptionPaymentConfig.upsert({
      where: { singletonKey: "default" },
      create: {
        singletonKey: "default",
        isEnabled: parsed.data.isEnabled,
        bankCode,
        accountNumber,
        accountName,
        version: 1,
        lastChangedByUserId: actor.id
      },
      update: {
        isEnabled: parsed.data.isEnabled,
        bankCode,
        accountNumber,
        accountName,
        version: { increment: 1 },
        lastChangedByUserId: actor.id
      }
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: "PLATFORM_SUBSCRIPTION_PAYMENT_CONFIG_UPDATED",
        entityType: "PlatformSubscriptionPaymentConfig",
        entityId: config.id,
        metadataJson: {
          old: paymentConfigAuditValue(previous),
          next: paymentConfigAuditValue({ isEnabled: config.isEnabled, bankCode: config.bankCode, accountNumber: config.accountNumber, accountName: config.accountName, version: config.version }),
          actorUserId: actor.id
        }
      }
    });
  });

  revalidatePath(path);
  redirectWithSuccess(path, "Đã lưu cấu hình thanh toán subscription.");
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function paymentConfigAuditValue(config: { isEnabled: boolean; bankCode: string | null; accountNumber: string | null; accountName: string | null; version: number } | null) {
  if (!config) return null;
  return {
    isEnabled: config.isEnabled,
    bankCode: config.bankCode,
    accountNumberSuffix: config.accountNumber ? maskAccountNumber(config.accountNumber) : null,
    accountName: config.accountName,
    version: config.version
  };
}

function maskAccountNumber(value: string) {
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function validationMessage(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.values(fieldErrors).flat().filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(path: string, message: string): never {
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}
