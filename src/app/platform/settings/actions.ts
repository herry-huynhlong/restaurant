"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";

const platformPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại."),
  newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự."),
  confirmPassword: z.string().min(1, "Vui lòng nhập xác nhận mật khẩu.")
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp.",
  path: ["confirmPassword"]
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

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
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
