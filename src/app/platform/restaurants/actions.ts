"use server";

import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { platformRoutes } from "@/lib/routes";

const statusSchema = z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]);
const planSchema = z.enum(["FREE", "BASIC", "PRO"]);
const subscriptionStatusSchema = z.enum(["ACTIVE", "EXPIRED", "SUSPENDED"]);
const languageSchema = z.enum(["vi", "en"]);
const resetAdminPasswordSchema = z.object({
  restaurantId: z.string().min(1),
  ownerUserId: z.string().min(1).optional(),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự."),
  confirmPassword: z.string().min(1, "Vui lòng nhập xác nhận mật khẩu.")
}).refine((value) => value.password === value.confirmPassword, {
  message: "Xác nhận mật khẩu không khớp.",
  path: ["confirmPassword"]
});
const updateOwnerNameSchema = z.object({
  restaurantId: z.string().min(1),
  ownerUserId: z.string().min(1),
  name: z.string().trim().min(1, "Họ tên là bắt buộc.").max(120, "Họ tên quá dài.")
});
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  if (!value || String(value).trim() === "") {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeFormDataSummary(formData: FormData) {
  return Array.from(formData.entries()).map(([key, value]) => {
    if (value instanceof File) {
      return {
        key,
        file: value.size > 0,
        name: value.name,
        type: value.type,
        size: value.size
      };
    }

    if (key.toLowerCase().includes("password")) {
      return {
        key,
        provided: String(value).length > 0,
        length: String(value).length
      };
    }

    return { key, value: String(value) };
  });
}

function optionalString(formData: FormData, key: string) {
  return readString(formData, key) || undefined;
}

async function saveUploadedImage(formData: FormData, key: string, folder: "logos") {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) {
    return undefined;
  }

  if (!allowedImageTypes.includes(file.type)) {
    throw new Error("INVALID_IMAGE_TYPE");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("INVALID_IMAGE_SIZE");
  }

  const extension = path.extname(file.name).toLowerCase() || ".jpg";
  const safeExtension = [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
  const fileName = `${crypto.randomUUID()}${safeExtension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
  return `/api/uploads/${folder}/${fileName}`;
}

const createRestaurantSchema = z.object({
  name: z.string().min(1, "Tên nhà hàng là bắt buộc."),
  slug: z.string().min(1, "Slug là bắt buộc.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug chỉ được chứa chữ thường, số và dấu gạch ngang."),
  logoUrl: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  timezone: z.string().min(1, "Timezone là bắt buộc."),
  primaryLanguage: languageSchema,
  currency: z.string().min(1, "Currency là bắt buộc."),
  ownerName: z.string().min(1, "Tên chủ quán là bắt buộc."),
  ownerEmail: z.string().email("Email owner không hợp lệ.").transform((value) => value.toLowerCase()),
  ownerPassword: z.string().min(8, "Password phải có ít nhất 8 ký tự."),
  ownerPhone: z.string().optional(),
  plan: planSchema,
  subscriptionStatus: subscriptionStatusSchema,
  status: statusSchema
});

const updateRestaurantSchema = createRestaurantSchema
  .omit({
    ownerName: true,
    ownerEmail: true,
    ownerPassword: true,
    ownerPhone: true
  })
  .extend({
    restaurantId: z.string().min(1)
  });

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(path: string, message: string): never {
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}

function readPlatformReturnPath(formData: FormData) {
  const returnTo = readString(formData, "returnTo");
  return returnTo.startsWith("/platform") ? returnTo : platformRoutes.restaurants;
}

function validationMessage(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.values(fieldErrors).flat().filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}

function validateSubscriptionDates(start: Date | null, end: Date | null) {
  if (start && end && end <= start) {
    return "Ngày hết hạn phải sau ngày bắt đầu.";
  }
  return null;
}

function prismaCreateRestaurantMessage(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return "Không thể tạo nhà hàng. Vui lòng kiểm tra dữ liệu.";
  }

  if (error.code === "P2022") {
    return "Database production chưa đồng bộ migration. Vui lòng chạy prisma migrate deploy rồi thử lại.";
  }

  if (error.code !== "P2002") {
    return "Không thể tạo nhà hàng. Vui lòng kiểm tra dữ liệu.";
  }

  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
  if (target.includes("slug")) {
    return "Slug này đã được sử dụng. Vui lòng chọn slug khác.";
  }
  if (target.includes("email")) {
    return "Email owner đã tồn tại trong hệ thống.";
  }
  if (target.includes("restaurantId") && target.includes("username")) {
    return "Username owner đã tồn tại trong nhà hàng này.";
  }
  if (target.includes("restaurantId") && target.includes("userId")) {
    return "Owner này đã thuộc nhà hàng này.";
  }

  return "Dữ liệu bị trùng. Vui lòng kiểm tra slug hoặc email owner.";
}

export async function createRestaurantAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  console.info("CREATE RESTAURANT SUBMIT", safeFormDataSummary(formData));
  const normalizedSlug = slugify(readString(formData, "slug") || readString(formData, "name"));
  let uploadedLogoUrl: string | undefined;
  try {
    uploadedLogoUrl = await saveUploadedImage(formData, "logoFile", "logos");
  } catch (error) {
    console.error("CREATE RESTAURANT LOGO ERROR", {
      error,
      logoFile: safeFormDataSummary(formData).find((entry) => entry.key === "logoFile")
    });
    redirectWithError(platformRoutes.newRestaurant, "Logo chỉ hỗ trợ JPG, PNG, WEBP và tối đa 5MB.");
  }
  const logoUrl = uploadedLogoUrl ?? optionalString(formData, "existingLogoUrl");
  const parsed = createRestaurantSchema.safeParse({
    name: readString(formData, "name"),
    slug: normalizedSlug,
    logoUrl,
    phone: optionalString(formData, "phone"),
    address: optionalString(formData, "address"),
    timezone: readString(formData, "timezone") || "Asia/Ho_Chi_Minh",
    primaryLanguage: readString(formData, "primaryLanguage") || "vi",
    currency: readString(formData, "currency") || "VND",
    ownerName: readString(formData, "ownerName"),
    ownerEmail: readString(formData, "ownerEmail"),
    ownerPassword: readString(formData, "ownerPassword"),
    ownerPhone: optionalString(formData, "ownerPhone"),
    plan: readString(formData, "plan") || "FREE",
    subscriptionStatus: readString(formData, "subscriptionStatus") || "ACTIVE",
    status: readString(formData, "status") || "INACTIVE"
  });

  if (!parsed.success) {
    console.warn("CREATE RESTAURANT VALIDATION ERROR", {
      normalizedSlug,
      issues: parsed.error.flatten()
    });
    redirectWithError(platformRoutes.newRestaurant, validationMessage(parsed.error));
  }

  console.info("CREATE RESTAURANT PARSED PAYLOAD", {
    name: parsed.data.name,
    slug: parsed.data.slug,
    hasLogo: Boolean(parsed.data.logoUrl),
    timezone: parsed.data.timezone,
    primaryLanguage: parsed.data.primaryLanguage,
    currency: parsed.data.currency,
    ownerName: parsed.data.ownerName,
    ownerEmail: parsed.data.ownerEmail,
    ownerPhone: parsed.data.ownerPhone,
    plan: parsed.data.plan,
    subscriptionStatus: parsed.data.subscriptionStatus,
    status: parsed.data.status
  });

  const subscriptionStart = parseOptionalDate(formData.get("subscriptionStart"));
  const subscriptionEnd = parseOptionalDate(formData.get("subscriptionEnd"));
  const dateError = validateSubscriptionDates(subscriptionStart, subscriptionEnd);
  if (dateError) redirectWithError(platformRoutes.newRestaurant, dateError);

  const existingRestaurant = await prisma.restaurant.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true }
  });
  if (existingRestaurant) {
    console.warn("CREATE RESTAURANT DUPLICATE SLUG", {
      slug: parsed.data.slug,
      restaurantId: existingRestaurant.id
    });
    redirectWithError(platformRoutes.newRestaurant, "Slug này đã được sử dụng. Vui lòng chọn slug khác.");
  }

  const existingOwner = await prisma.user.findUnique({
    where: { email: parsed.data.ownerEmail },
    select: { id: true, platformRole: true, memberships: { select: { restaurantId: true, role: true, isActive: true } } }
  });
  if (existingOwner?.platformRole === "PLATFORM_ADMIN") {
    console.warn("CREATE RESTAURANT OWNER_EMAIL_IS_PLATFORM_ADMIN", {
      ownerEmail: parsed.data.ownerEmail,
      userId: existingOwner.id
    });
    redirectWithError(platformRoutes.newRestaurant, "Email owner đang là tài khoản Platform Admin. Vui lòng dùng email owner riêng cho nhà hàng.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.ownerPassword, 12);

  let createdRestaurantId: string;

  try {
    console.info("CREATE RESTAURANT TRANSACTION START", {
      slug: parsed.data.slug,
      ownerEmail: parsed.data.ownerEmail,
      ownerUserExists: Boolean(existingOwner)
    });
    const restaurant = await prisma.$transaction(async (tx) => {
      const createdRestaurant = await tx.restaurant.create({
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          logoUrl: parsed.data.logoUrl ?? null,
          status: parsed.data.status,
          plan: parsed.data.plan,
          subscriptionStatus: parsed.data.subscriptionStatus,
          subscriptionStart,
          subscriptionEnd
        }
      });

      const owner = await tx.user.upsert({
        where: { email: parsed.data.ownerEmail },
        update: {
          name: parsed.data.ownerName,
          phone: parsed.data.ownerPhone ?? null
        },
        create: {
          name: parsed.data.ownerName,
          email: parsed.data.ownerEmail,
          phone: parsed.data.ownerPhone ?? null,
          passwordHash
        }
      });

      await tx.restaurantUser.create({
        data: {
          restaurantId: createdRestaurant.id,
          userId: owner.id,
          username: "owner",
          role: "OWNER"
        }
      });

      await tx.restaurantSetting.create({
        data: {
          restaurantId: createdRestaurant.id,
          restaurantName: parsed.data.name,
          logoUrl: parsed.data.logoUrl ?? null,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          timezone: parsed.data.timezone,
          primaryLanguage: parsed.data.primaryLanguage,
          currency: parsed.data.currency
        }
      });

      await tx.area.create({
        data: {
          restaurantId: createdRestaurant.id,
          name: "Khu vực mặc định"
        }
      });

      await tx.auditLog.createMany({
        data: [
          {
            restaurantId: createdRestaurant.id,
            userId: actor.id,
            action: "RESTAURANT_CREATED",
            entityType: "Restaurant",
            entityId: createdRestaurant.id,
            metadataJson: { slug: createdRestaurant.slug, plan: createdRestaurant.plan }
          },
          {
            restaurantId: createdRestaurant.id,
            userId: actor.id,
            action: "OWNER_CREATED",
            entityType: "User",
            entityId: owner.id,
            metadataJson: { email: owner.email }
          }
        ]
      });

      return createdRestaurant;
    });

    createdRestaurantId = restaurant.id;
  } catch (error) {
    console.error("CREATE RESTAURANT DATABASE ERROR", {
      error,
      prismaCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
      prismaMeta: error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : undefined,
      slug: parsed.data.slug,
      ownerEmail: parsed.data.ownerEmail
    });
    redirectWithError(platformRoutes.newRestaurant, prismaCreateRestaurantMessage(error));
  }

  console.info("CREATE RESTAURANT SUCCESS", {
    restaurantId: createdRestaurantId,
    slug: parsed.data.slug,
    ownerEmail: parsed.data.ownerEmail
  });
  revalidatePath(platformRoutes.restaurants);
  redirect(platformRoutes.restaurantDetail(createdRestaurantId));
}

export async function updateRestaurantAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  let uploadedLogoUrl: string | undefined;
  try {
    uploadedLogoUrl = await saveUploadedImage(formData, "logoFile", "logos");
  } catch {
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), "Logo chỉ hỗ trợ JPG, PNG, WEBP và tối đa 5MB.");
  }
  const logoUrl = uploadedLogoUrl ?? optionalString(formData, "existingLogoUrl");
  const parsed = updateRestaurantSchema.safeParse({
    restaurantId,
    name: readString(formData, "name"),
    slug: slugify(readString(formData, "slug")),
    logoUrl,
    phone: optionalString(formData, "phone"),
    address: optionalString(formData, "address"),
    timezone: readString(formData, "timezone") || "Asia/Ho_Chi_Minh",
    primaryLanguage: readString(formData, "primaryLanguage") || "vi",
    currency: readString(formData, "currency") || "VND",
    plan: readString(formData, "plan") || "FREE",
    subscriptionStatus: readString(formData, "subscriptionStatus") || "ACTIVE",
    status: readString(formData, "status") || "INACTIVE"
  });

  if (!parsed.success) {
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), validationMessage(parsed.error));
  }

  const subscriptionStart = parseOptionalDate(formData.get("subscriptionStart"));
  const subscriptionEnd = parseOptionalDate(formData.get("subscriptionEnd"));
  const dateError = validateSubscriptionDates(subscriptionStart, subscriptionEnd);
  if (dateError) redirectWithError(platformRoutes.restaurantEdit(restaurantId), dateError);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: { id: parsed.data.restaurantId },
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          logoUrl: parsed.data.logoUrl ?? null,
          status: parsed.data.status,
          plan: parsed.data.plan,
          subscriptionStatus: parsed.data.subscriptionStatus,
          subscriptionStart,
          subscriptionEnd
        }
      });

      await tx.restaurantSetting.upsert({
        where: { restaurantId: parsed.data.restaurantId },
        update: {
          restaurantName: parsed.data.name,
          logoUrl: parsed.data.logoUrl ?? null,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          timezone: parsed.data.timezone,
          primaryLanguage: parsed.data.primaryLanguage,
          currency: parsed.data.currency
        },
        create: {
          restaurantId: parsed.data.restaurantId,
          restaurantName: parsed.data.name,
          logoUrl: parsed.data.logoUrl ?? null,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          timezone: parsed.data.timezone,
          primaryLanguage: parsed.data.primaryLanguage,
          currency: parsed.data.currency
        }
      });

      await tx.auditLog.create({
        data: {
          restaurantId: parsed.data.restaurantId,
          userId: actor.id,
          action: "RESTAURANT_UPDATED",
          entityType: "Restaurant",
          entityId: parsed.data.restaurantId,
          metadataJson: { slug: parsed.data.slug, plan: parsed.data.plan }
        }
      });
    });
  } catch (error) {
    console.error("UPDATE RESTAURANT DATABASE ERROR", error);
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "Slug đã tồn tại."
      : "Không thể cập nhật nhà hàng. Vui lòng kiểm tra dữ liệu.";
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), message);
  }

  revalidatePath(platformRoutes.restaurants);
  redirect(platformRoutes.restaurantDetail(parsed.data.restaurantId));
}

export async function setRestaurantStatusAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const status = statusSchema.parse(readString(formData, "status"));
  const action = status === "ACTIVE" ? "RESTAURANT_ACTIVATED" : "RESTAURANT_SUSPENDED";
  const returnTo = readPlatformReturnPath(formData);

  await prisma.$transaction([
    prisma.restaurant.update({ where: { id: restaurantId }, data: { status } }),
    prisma.auditLog.create({
      data: {
        restaurantId,
        userId: actor.id,
        action,
        entityType: "Restaurant",
        entityId: restaurantId,
        metadataJson: { status }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.restaurantDetail(restaurantId));
  redirectWithSuccess(returnTo, status === "ACTIVE" ? "Đã mở lại nhà hàng." : "Đã khóa nhà hàng.");
}

export async function extendSubscriptionAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const subscriptionEnd = parseOptionalDate(formData.get("subscriptionEnd"));
  const plan = planSchema.parse(readString(formData, "plan"));

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        plan,
        subscriptionEnd,
        subscriptionStatus: "ACTIVE"
      }
    }),
    prisma.auditLog.create({
      data: {
        restaurantId,
        userId: actor.id,
        action: "SUBSCRIPTION_EXTENDED",
        entityType: "Restaurant",
        entityId: restaurantId,
        metadataJson: { plan, subscriptionEnd }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurantDetail(restaurantId));
}

export async function changePlanAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const plan = planSchema.parse(readString(formData, "plan"));
  const returnTo = readPlatformReturnPath(formData);

  await prisma.$transaction([
    prisma.restaurant.update({ where: { id: restaurantId }, data: { plan } }),
    prisma.auditLog.create({
      data: {
        restaurantId,
        userId: actor.id,
        action: "PLAN_CHANGED",
        entityType: "Restaurant",
        entityId: restaurantId,
        metadataJson: { plan }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.restaurantDetail(restaurantId));
  redirectWithSuccess(returnTo, "Đã đổi gói nhà hàng.");
}

export async function resetOwnerPasswordAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = resetAdminPasswordSchema.safeParse({
    restaurantId: readString(formData, "restaurantId"),
    ownerUserId: optionalString(formData, "ownerUserId"),
    password: readString(formData, "password"),
    confirmPassword: readString(formData, "confirmPassword")
  });

  if (!parsed.success) {
    redirectWithError(returnTo, validationMessage(parsed.error));
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const owner = await prisma.restaurantUser.findFirst({
    where: {
      restaurantId: parsed.data.restaurantId,
      ...(parsed.data.ownerUserId ? { userId: parsed.data.ownerUserId } : {}),
      role: "OWNER",
      isActive: true
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true }
  });

  if (!owner) {
    redirectWithError(returnTo, "Không tìm thấy tài khoản admin của nhà hàng.");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: owner.userId }, data: { passwordHash } }),
    prisma.auditLog.create({
      data: {
        restaurantId: parsed.data.restaurantId,
        userId: actor.id,
        action: "ADMIN_PASSWORD_RESET",
        entityType: "User",
        entityId: owner.userId,
        metadataJson: { role: "OWNER" }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.restaurantDetail(parsed.data.restaurantId));
  revalidatePath(platformRoutes.owners);
  redirectWithSuccess(returnTo, parsed.data.ownerUserId ? "Đã reset mật khẩu chủ quán." : "Đã reset mật khẩu admin.");
}

export async function updateOwnerNameAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = updateOwnerNameSchema.safeParse({
    restaurantId: readString(formData, "restaurantId"),
    ownerUserId: readString(formData, "ownerUserId"),
    name: readString(formData, "name")
  });

  if (!parsed.success) {
    redirectWithError(returnTo, validationMessage(parsed.error));
  }

  const owner = await prisma.restaurantUser.findFirst({
    where: {
      restaurantId: parsed.data.restaurantId,
      userId: parsed.data.ownerUserId,
      role: "OWNER"
    },
    select: { id: true }
  });

  if (!owner) {
    redirectWithError(returnTo, "Không tìm thấy tài khoản chủ quán của nhà hàng.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: parsed.data.ownerUserId },
      data: { name: parsed.data.name }
    }),
    prisma.auditLog.create({
      data: {
        restaurantId: parsed.data.restaurantId,
        userId: actor.id,
        action: "OWNER_NAME_UPDATED",
        entityType: "User",
        entityId: parsed.data.ownerUserId,
        metadataJson: { role: "OWNER" }
      }
    })
  ]);

  revalidatePath(platformRoutes.owners);
  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.restaurantDetail(parsed.data.restaurantId));
  redirectWithSuccess(returnTo, "Đã cập nhật họ tên chủ quán.");
}
