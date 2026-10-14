"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";

const createSubAdminSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập họ tên."),
  email: z.string().trim().email("Email đăng nhập không hợp lệ.").transform((value) => value.toLowerCase()),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự.")
});

const updateSubAdminSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1, "Vui lòng nhập họ tên."),
  email: z.string().trim().email("Email đăng nhập không hợp lệ.").transform((value) => value.toLowerCase()),
  phone: z.string().trim().optional(),
  isActive: z.boolean()
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự.")
});

export async function createPlatformSubAdminAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const parsed = createSubAdminSchema.safeParse({
    name: readString(formData, "name"),
    email: readString(formData, "email"),
    phone: optionalString(formData, "phone"),
    password: readString(formData, "password")
  });

  if (!parsed.success) {
    redirectWithError(validationMessage(parsed.error));
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) {
    redirectWithError("Email này đã tồn tại trong hệ thống.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      passwordHash,
      platformRole: "PLATFORM_SUB_ADMIN"
    },
    select: { id: true }
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: "PLATFORM_SUB_ADMIN_CREATED",
      entityType: "User",
      entityId: user.id,
      metadataJson: { email: parsed.data.email }
    }
  });

  revalidatePath(platformRoutes.admins);
  redirectWithSuccess("Đã tạo tài khoản quản trị phụ.");
}

export async function updatePlatformSubAdminAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const parsed = updateSubAdminSchema.safeParse({
    userId: readString(formData, "userId"),
    name: readString(formData, "name"),
    email: readString(formData, "email"),
    phone: optionalString(formData, "phone"),
    isActive: formData.get("isActive") === "on"
  });

  if (!parsed.success) {
    redirectWithError(validationMessage(parsed.error));
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, platformRole: true }
  });
  if (!target || target.platformRole !== "PLATFORM_SUB_ADMIN") {
    redirectWithError("Chỉ được cập nhật tài khoản quản trị phụ.");
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: parsed.data.userId },
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone || null,
          isActive: parsed.data.isActive
        }
      }),
      prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: "PLATFORM_SUB_ADMIN_UPDATED",
          entityType: "User",
          entityId: parsed.data.userId,
          metadataJson: { isActive: parsed.data.isActive }
        }
      })
    ]);
  } catch {
    redirectWithError("Không thể cập nhật tài khoản. Vui lòng kiểm tra email có bị trùng không.");
  }

  revalidatePath(platformRoutes.admins);
  redirectWithSuccess("Đã lưu tài khoản quản trị phụ.");
}

export async function resetPlatformSubAdminPasswordAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const parsed = resetPasswordSchema.safeParse({
    userId: readString(formData, "userId"),
    password: readString(formData, "password")
  });

  if (!parsed.success) {
    redirectWithError(validationMessage(parsed.error));
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, platformRole: true }
  });
  if (!target || target.platformRole !== "PLATFORM_SUB_ADMIN") {
    redirectWithError("Chỉ được đặt lại mật khẩu tài khoản quản trị phụ.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: parsed.data.userId },
      data: { passwordHash }
    }),
    prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: "PLATFORM_SUB_ADMIN_PASSWORD_RESET",
        entityType: "User",
        entityId: parsed.data.userId
      }
    })
  ]);

  revalidatePath(platformRoutes.admins);
  redirectWithSuccess("Đã đặt lại mật khẩu quản trị phụ.");
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value || undefined;
}

function validationMessage(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.values(fieldErrors).flat().filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}

function redirectWithError(message: string): never {
  redirect(`${platformRoutes.admins}?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string): never {
  redirect(`${platformRoutes.admins}?success=${encodeURIComponent(message)}`);
}
