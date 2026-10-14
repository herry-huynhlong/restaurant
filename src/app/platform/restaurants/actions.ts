"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { platformRoutes } from "@/lib/routes";
import { safeErrorMessage } from "@/lib/safe-user-message";
import { enforceBusinessPlan } from "@/lib/business-type";
import { allowedUploadImageTypes, MAX_UPLOAD_IMAGE_SIZE, saveOptimizedUploadImage } from "@/server/services/image-upload-service";
import { addCalendarMonths, confirmSubscriptionRequest, rejectSubscriptionRequest } from "@/server/services/subscription-service";

const statusSchema = z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]);
const restaurantDeleteSchema = z.object({
  restaurantId: z.string().min(1),
  confirmSlug: z.string().trim().min(1)
});
const planSchema = z.enum(["BASIC", "PRO"]);
const restaurantPlanSchema = z.enum(["BASIC", "PRO", "TRAIN"]);
const planEntitlementSchema = z.enum(["BASIC", "PRO"]);
const businessTypeSchema = z.enum(["RESTAURANT", "DRINK_SHOP"]);
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
const subscriptionRequestActionSchema = z.object({
  requestId: z.string().min(1),
  adminNote: z.string().trim().max(500).optional()
});
const manualSubscriptionSchema = z.object({
  restaurantId: z.string().min(1),
  plan: restaurantPlanSchema,
  planEntitlement: planEntitlementSchema,
  termMonths: z.coerce.number().int().optional(),
  subscriptionStart: z.string().trim().optional(),
  subscriptionEnd: z.string().trim().optional(),
  grantType: z.enum(["PAID", "PROMOTION"]),
  paymentConfirmed: z.boolean(),
  note: z.string().trim().max(500, "Ghi chú quá dài.").optional(),
  confirmApply: z.boolean()
});
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

function parseVietnamDateInput(value: FormDataEntryValue | string | null | undefined, boundary: "start" | "end") {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return parseOptionalDate(text);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcHour = boundary === "start" ? -7 : 16;
  const utcMinute = boundary === "start" ? 0 : 59;
  const utcSecond = boundary === "start" ? 0 : 59;
  const utcMs = boundary === "start" ? 0 : 999;
  return new Date(Date.UTC(year, month - 1, day, utcHour, utcMinute, utcSecond, utcMs));
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

  if (!allowedUploadImageTypes.includes(file.type)) {
    throw new Error("INVALID_IMAGE_TYPE");
  }
  if (file.size > MAX_UPLOAD_IMAGE_SIZE) {
    throw new Error("INVALID_IMAGE_SIZE");
  }

  const optimized = await saveOptimizedUploadImage(file, folder);
  return optimized?.imageUrl;
}

const createRestaurantSchema = z.object({
  name: z.string().min(1, "Tên nhà hàng là bắt buộc."),
  slug: z.string().min(1, "Mã đường dẫn là bắt buộc.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Mã đường dẫn chỉ được chứa chữ thường, số và dấu gạch ngang."),
  logoUrl: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  timezone: z.string().min(1, "Múi giờ là bắt buộc."),
  primaryLanguage: languageSchema,
  currency: z.string().min(1, "Đơn vị tiền tệ là bắt buộc."),
  ownerName: z.string().min(1, "Tên chủ quán là bắt buộc."),
  ownerEmail: z.string().email("Email chủ quán không hợp lệ.").transform((value) => value.toLowerCase()),
  ownerPassword: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự."),
  ownerPhone: z.string().optional(),
  businessType: businessTypeSchema,
  plan: restaurantPlanSchema,
  planEntitlement: planEntitlementSchema,
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
    return "Hệ thống lưu trữ chưa được cập nhật cấu trúc mới. Vui lòng cập nhật hệ thống rồi thử lại.";
  }

  if (error.code !== "P2002") {
    return "Không thể tạo nhà hàng. Vui lòng kiểm tra dữ liệu.";
  }

  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
  if (target.includes("slug")) {
    return "Mã đường dẫn này đã được sử dụng. Vui lòng chọn mã khác.";
  }
  if (target.includes("email")) {
    return "Email chủ quán đã tồn tại trong hệ thống.";
  }
  if (target.includes("restaurantId") && target.includes("username")) {
    return "Tên đăng nhập chủ quán đã tồn tại trong nhà hàng này.";
  }
  if (target.includes("restaurantId") && target.includes("userId")) {
    return "Chủ quán này đã thuộc nhà hàng này.";
  }

  return "Dữ liệu bị trùng. Vui lòng kiểm tra mã đường dẫn hoặc email chủ quán.";
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
    redirectWithError(platformRoutes.newRestaurant, "Logo chỉ hỗ trợ JPG, PNG, WEBP. Ảnh tối đa 5MB.");
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
    businessType: readString(formData, "businessType") || "RESTAURANT",
    plan: enforceBusinessPlan(readString(formData, "businessType") || "RESTAURANT", readString(formData, "plan") || "BASIC"),
    planEntitlement: readString(formData, "planEntitlement") || (readString(formData, "plan") === "PRO" ? "PRO" : "BASIC"),
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
    businessType: parsed.data.businessType,
    plan: parsed.data.plan,
    planEntitlement: parsed.data.planEntitlement,
    subscriptionStatus: parsed.data.subscriptionStatus,
    status: parsed.data.status
  });

  const subscriptionStart = parseVietnamDateInput(formData.get("subscriptionStart"), "start");
  const subscriptionEnd = parseVietnamDateInput(formData.get("subscriptionEnd"), "end");
  const dateError = validateSubscriptionDates(subscriptionStart, subscriptionEnd);
  if (dateError) redirectWithError(platformRoutes.newRestaurant, dateError);
  if (parsed.data.plan === "TRAIN" && !subscriptionEnd) {
    redirectWithError(platformRoutes.newRestaurant, "TRAIN cần có ngày hết hạn do QuánPilot Admin chọn.");
  }

  const existingRestaurant = await prisma.restaurant.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true }
  });
  if (existingRestaurant) {
    console.warn("CREATE RESTAURANT DUPLICATE SLUG", {
      slug: parsed.data.slug,
      restaurantId: existingRestaurant.id
    });
    redirectWithError(platformRoutes.newRestaurant, "Mã đường dẫn này đã được sử dụng. Vui lòng chọn mã khác.");
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
    redirectWithError(platformRoutes.newRestaurant, "Email chủ quán đang là tài khoản quản trị nền tảng. Vui lòng dùng email riêng cho nhà hàng.");
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
          businessType: parsed.data.businessType,
          plan: parsed.data.plan,
          planEntitlement: parsed.data.plan === "TRAIN" ? parsed.data.planEntitlement : parsed.data.plan === "PRO" ? "PRO" : "BASIC",
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
          username: parsed.data.ownerEmail,
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
            metadataJson: { slug: createdRestaurant.slug, plan: createdRestaurant.plan, planEntitlement: createdRestaurant.planEntitlement, businessType: createdRestaurant.businessType }
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
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), "Logo chỉ hỗ trợ JPG, PNG, WEBP. Ảnh tối đa 5MB.");
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
    businessType: readString(formData, "businessType") || "RESTAURANT",
    plan: enforceBusinessPlan(readString(formData, "businessType") || "RESTAURANT", readString(formData, "plan") || "BASIC"),
    planEntitlement: readString(formData, "planEntitlement") || (readString(formData, "plan") === "PRO" ? "PRO" : "BASIC"),
    subscriptionStatus: readString(formData, "subscriptionStatus") || "ACTIVE",
    status: readString(formData, "status") || "INACTIVE"
  });

  if (!parsed.success) {
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), validationMessage(parsed.error));
  }

  const subscriptionStart = parseVietnamDateInput(formData.get("subscriptionStart"), "start");
  const subscriptionEnd = parseVietnamDateInput(formData.get("subscriptionEnd"), "end");
  const dateError = validateSubscriptionDates(subscriptionStart, subscriptionEnd);
  if (dateError) redirectWithError(platformRoutes.restaurantEdit(restaurantId), dateError);
  if (parsed.data.plan === "TRAIN" && !subscriptionEnd) {
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), "TRAIN cần có ngày hết hạn do QuánPilot Admin chọn.");
  }
  const currentRestaurant = await prisma.restaurant.findUnique({
    where: { id: parsed.data.restaurantId },
    select: { status: true }
  });
  if (currentRestaurant?.status === "DELETED") {
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), "Nhà hàng đã xóa. Hãy khôi phục trước khi chỉnh sửa.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: { id: parsed.data.restaurantId },
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          logoUrl: parsed.data.logoUrl ?? null,
          status: parsed.data.status,
          businessType: parsed.data.businessType,
          plan: parsed.data.plan,
          planEntitlement: parsed.data.plan === "TRAIN" ? parsed.data.planEntitlement : parsed.data.plan === "PRO" ? "PRO" : "BASIC",
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
          metadataJson: { slug: parsed.data.slug, plan: parsed.data.plan, businessType: parsed.data.businessType }
        }
      });
    });
  } catch (error) {
    console.error("UPDATE RESTAURANT DATABASE ERROR", error);
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "Mã đường dẫn đã tồn tại."
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
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { status: true }
  });

  if (restaurant?.status === "DELETED") {
    redirectWithError(returnTo, "Nhà hàng đã xóa. Hãy khôi phục trước khi đổi trạng thái.");
  }

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

export async function softDeleteRestaurantAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = restaurantDeleteSchema.safeParse({
    restaurantId: readString(formData, "restaurantId"),
    confirmSlug: readString(formData, "confirmSlug")
  });

  if (!parsed.success) {
    redirectWithError(returnTo, "Vui lòng nhập mã đường dẫn để xác nhận xóa.");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: parsed.data.restaurantId },
    select: { id: true, name: true, slug: true, status: true }
  });

  if (!restaurant) {
    redirectWithError(returnTo, "Không tìm thấy nhà hàng.");
  }

  if (parsed.data.confirmSlug !== restaurant.slug) {
    redirectWithError(returnTo, "Mã đường dẫn xác nhận không đúng.");
  }

  if (restaurant.status === "DELETED") {
    redirectWithError(returnTo, "Nhà hàng đã được xóa trước đó.");
  }

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        deletedByUserId: actor.id,
        subscriptionStatus: "SUSPENDED"
      }
    }),
    prisma.pushSubscription.updateMany({
      where: { restaurantId: restaurant.id },
      data: { isActive: false, onShift: false }
    }),
    prisma.staffDeviceSession.updateMany({
      where: { restaurantId: restaurant.id, isActive: true },
      data: { isActive: false, onShift: false, revokedAt: new Date(), revokedByUserId: actor.id }
    }),
    prisma.auditLog.create({
      data: {
        restaurantId: restaurant.id,
        userId: actor.id,
        action: "RESTAURANT_SOFT_DELETED",
        entityType: "Restaurant",
        entityId: restaurant.id,
        metadataJson: { slug: restaurant.slug, name: restaurant.name }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.owners);
  revalidatePath(platformRoutes.restaurantDetail(restaurant.id));
  redirectWithSuccess(platformRoutes.restaurants, "Đã xóa mềm nhà hàng. Dữ liệu lịch sử vẫn được giữ.");
}

export async function restoreRestaurantAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = restaurantDeleteSchema.safeParse({
    restaurantId: readString(formData, "restaurantId"),
    confirmSlug: readString(formData, "confirmSlug")
  });

  if (!parsed.success) {
    redirectWithError(returnTo, "Vui lòng nhập mã đường dẫn để xác nhận khôi phục.");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: parsed.data.restaurantId },
    select: { id: true, name: true, slug: true, status: true }
  });

  if (!restaurant) {
    redirectWithError(returnTo, "Không tìm thấy nhà hàng.");
  }

  if (parsed.data.confirmSlug !== restaurant.slug) {
    redirectWithError(returnTo, "Mã đường dẫn xác nhận không đúng.");
  }

  if (restaurant.status !== "DELETED") {
    redirectWithError(returnTo, "Chỉ nhà hàng đã xóa mới có thể khôi phục.");
  }

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        status: "INACTIVE",
        deletedAt: null,
        deletedByUserId: null,
        subscriptionStatus: "SUSPENDED"
      }
    }),
    prisma.auditLog.create({
      data: {
        restaurantId: restaurant.id,
        userId: actor.id,
        action: "RESTAURANT_RESTORED",
        entityType: "Restaurant",
        entityId: restaurant.id,
        metadataJson: { slug: restaurant.slug, name: restaurant.name, restoredStatus: "INACTIVE" }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.owners);
  revalidatePath(platformRoutes.restaurantDetail(restaurant.id));
  redirectWithSuccess(returnTo, "Đã khôi phục nhà hàng. Trạng thái hiện là Chưa hoạt động.");
}

export async function permanentlyDeleteRestaurantAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = restaurantDeleteSchema.safeParse({
    restaurantId: readString(formData, "restaurantId"),
    confirmSlug: readString(formData, "confirmSlug")
  });

  if (!parsed.success) {
    redirectWithError(returnTo, "Vui lòng nhập mã đường dẫn để xác nhận xóa vĩnh viễn.");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: parsed.data.restaurantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      _count: {
        select: {
          orders: true,
          payments: true,
          diningSessions: true,
          serviceRequests: true
        }
      }
    }
  });

  if (!restaurant) {
    redirectWithError(returnTo, "Không tìm thấy nhà hàng.");
  }

  if (parsed.data.confirmSlug !== restaurant.slug) {
    redirectWithError(returnTo, "Mã đường dẫn xác nhận không đúng.");
  }

  if (restaurant.status !== "DELETED") {
    redirectWithError(returnTo, "Phải xóa mềm nhà hàng trước khi xóa vĩnh viễn.");
  }

  const hasBusinessHistory = restaurant._count.orders > 0
    || restaurant._count.payments > 0
    || restaurant._count.diningSessions > 0
    || restaurant._count.serviceRequests > 0;
  if (hasBusinessHistory) {
    redirectWithError(returnTo, "Không thể xóa vĩnh viễn vì nhà hàng có lịch sử gọi món, thanh toán hoặc yêu cầu khách. Hãy giữ bản ghi đã xóa để bảo toàn chứng từ.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        restaurantId: null,
        userId: actor.id,
        action: "RESTAURANT_PERMANENT_DELETE_REQUESTED",
        entityType: "Restaurant",
        entityId: restaurant.id,
        metadataJson: { slug: restaurant.slug, name: restaurant.name }
      }
    });
    await tx.staffDeviceSession.deleteMany({ where: { restaurantId: restaurant.id } });
    await tx.restaurant.delete({ where: { id: restaurant.id } });
  });

  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.owners);
  redirectWithSuccess(platformRoutes.restaurants + "?view=deleted", "Đã xóa vĩnh viễn nhà hàng không có lịch sử nghiệp vụ.");
}

export async function extendSubscriptionAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const subscriptionEnd = parseVietnamDateInput(formData.get("subscriptionEnd"), "end");
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { businessType: true }
  });
  const plan = planSchema.parse(enforceBusinessPlan(restaurant?.businessType, readString(formData, "plan")));
  const planEntitlement = plan === "PRO" ? "PRO" : "BASIC";

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        plan,
        planEntitlement: plan === "PRO" ? "PRO" : "BASIC",
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

export async function activateRestaurantSubscriptionAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = manualSubscriptionSchema.safeParse({
    restaurantId: readString(formData, "restaurantId"),
    plan: readString(formData, "plan"),
    planEntitlement: readString(formData, "planEntitlement") || (readString(formData, "plan") === "PRO" ? "PRO" : "BASIC"),
    termMonths: readString(formData, "termMonths") || undefined,
    subscriptionStart: readString(formData, "subscriptionStart"),
    subscriptionEnd: readString(formData, "subscriptionEnd"),
    grantType: readString(formData, "grantType") || "PAID",
    paymentConfirmed: formData.get("paymentConfirmed") === "on",
    note: optionalString(formData, "note"),
    confirmApply: formData.get("confirmApply") === "on"
  });

  if (!parsed.success) {
    redirectWithError(returnTo, validationMessage(parsed.error));
  }
  if (!parsed.data.confirmApply) {
    redirectWithError(returnTo, "Vui lòng xác nhận trước khi lưu thay đổi gói.");
  }
  if (parsed.data.grantType === "PAID" && !parsed.data.paymentConfirmed) {
    redirectWithError(returnTo, "Vui lòng xác nhận đã kiểm tra thanh toán trước khi kích hoạt hợp đồng trả phí.");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: parsed.data.restaurantId },
    select: {
      id: true,
      name: true,
      status: true,
      businessType: true,
      plan: true,
      planEntitlement: true,
      subscriptionStatus: true,
      subscriptionStart: true,
      subscriptionEnd: true
    }
  });
  if (!restaurant || restaurant.status === "DELETED") {
    redirectWithError(returnTo, "Nhà hàng không hợp lệ.");
  }

  const plan = restaurantPlanSchema.parse(enforceBusinessPlan(restaurant.businessType, parsed.data.plan));
  const planEntitlement = plan === "TRAIN" ? parsed.data.planEntitlement : plan === "PRO" ? "PRO" : "BASIC";
  const startAt = parseVietnamDateInput(parsed.data.subscriptionStart, "start") ?? new Date();
  const customEndAt = parseVietnamDateInput(parsed.data.subscriptionEnd, "end");
  if (plan === "TRAIN" && !customEndAt) {
    redirectWithError(returnTo, "TRAIN cần có ngày hết hạn do QuánPilot Admin chọn.");
  }
  const termMonths = parsed.data.termMonths && [3, 6, 12].includes(parsed.data.termMonths) ? parsed.data.termMonths : 12;
  const endAt = customEndAt ?? addCalendarMonths(startAt, termMonths);
  const dateError = validateSubscriptionDates(startAt, endAt);
  if (dateError) redirectWithError(returnTo, dateError);

  const price = plan === "TRAIN" ? null : await prisma.platformPlanPrice.findUnique({
    where: { plan_termMonths: { plan: planSchema.parse(plan), termMonths } }
  });
  if (plan !== "TRAIN" && !price?.isActive && parsed.data.grantType === "PAID") {
    redirectWithError(returnTo, "Kỳ giá này hiện chưa mở bán.");
  }
  if (plan === "TRAIN" && parsed.data.grantType !== "PROMOTION") {
    redirectWithError(returnTo, "TRAIN là gói miễn phí, vui lòng chọn loại kích hoạt ưu đãi quản trị.");
  }

  const unchanged = restaurant.plan === plan
    && restaurant.planEntitlement === planEntitlement
    && restaurant.subscriptionStatus === "ACTIVE"
    && restaurant.subscriptionStart?.getTime() === startAt.getTime()
    && restaurant.subscriptionEnd?.getTime() === endAt.getTime();
  if (unchanged) {
    redirectWithError(returnTo, "Gói dịch vụ hiện tại đã trùng với thông tin vừa nhập.");
  }

  const action = plan === "TRAIN"
    ? "TRAIN_MANUAL_UPDATED"
    : restaurant.plan === plan ? "SUBSCRIPTION_MANUAL_RENEWED" : "SUBSCRIPTION_MANUAL_ACTIVATED";
  const priceVnd = parsed.data.grantType === "PAID" ? price?.priceVnd ?? null : null;

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        plan,
        planEntitlement,
        subscriptionStatus: "ACTIVE",
        subscriptionStart: startAt,
        subscriptionEnd: endAt
      }
    }),
    prisma.restaurantSubscriptionEvent.create({
      data: {
        restaurantId: restaurant.id,
        actorUserId: actor.id,
        action,
        plan,
        termMonths: plan === "TRAIN" ? null : termMonths,
        priceVnd,
        startAt,
        endAt,
        metadataJson: {
          grantType: parsed.data.grantType,
          note: parsed.data.note || null,
          previousPlan: restaurant.plan,
          previousPlanEntitlement: restaurant.planEntitlement,
          previousSubscriptionStatus: restaurant.subscriptionStatus,
          previousSubscriptionStart: restaurant.subscriptionStart?.toISOString() ?? null,
          previousSubscriptionEnd: restaurant.subscriptionEnd?.toISOString() ?? null,
          priceSnapshot: price ? {
            priceId: price.id,
            priceVnd: price.priceVnd,
            monthlyPriceVnd: price.monthlyPriceVnd
          } : null
        }
      }
    }),
    prisma.auditLog.create({
      data: {
        restaurantId: restaurant.id,
        userId: actor.id,
        action,
        entityType: "Restaurant",
        entityId: restaurant.id,
        metadataJson: {
          plan,
          planEntitlement,
          termMonths: plan === "TRAIN" ? null : termMonths,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          grantType: parsed.data.grantType,
          priceVnd,
          note: parsed.data.note || null
        }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurants);
  revalidatePath(platformRoutes.restaurantDetail(restaurant.id));
  redirectWithSuccess(returnTo, plan === "TRAIN" ? "Đã cập nhật TRAIN cho nhà hàng." : parsed.data.grantType === "PAID" ? "Đã kích hoạt gói dịch vụ." : "Đã cấp ưu đãi sử dụng.");
}

export async function changePlanAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { businessType: true }
  });
  const plan = planSchema.parse(enforceBusinessPlan(restaurant?.businessType, readString(formData, "plan")));
  const planEntitlement = plan === "PRO" ? "PRO" : "BASIC";
  const returnTo = readPlatformReturnPath(formData);

  await prisma.$transaction([
    prisma.restaurant.update({ where: { id: restaurantId }, data: { plan, planEntitlement } }),
    prisma.auditLog.create({
      data: {
        restaurantId,
        userId: actor.id,
        action: "PLAN_CHANGED",
        entityType: "Restaurant",
        entityId: restaurantId,
        metadataJson: { plan, planEntitlement }
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
    redirectWithError(returnTo, "Không tìm thấy tài khoản chủ quán của nhà hàng.");
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
  redirectWithSuccess(returnTo, parsed.data.ownerUserId ? "Đã đặt lại mật khẩu chủ quán." : "Đã đặt lại mật khẩu chủ quán.");
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

export async function confirmSubscriptionRequestAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = subscriptionRequestActionSchema.safeParse({
    requestId: readString(formData, "requestId")
  });
  if (!parsed.success) {
    redirectWithError(returnTo, "Yêu cầu đăng ký không hợp lệ.");
  }

  try {
    const request = await confirmSubscriptionRequest(parsed.data.requestId, actor.id);
    revalidatePath(platformRoutes.restaurants);
    revalidatePath(platformRoutes.restaurantDetail(request.restaurantId));
  } catch (error) {
    redirectWithError(returnTo, safeErrorMessage(error, "Chưa thể xác nhận yêu cầu đăng ký."));
  }

  redirectWithSuccess(returnTo, "Đã xác nhận thanh toán và kích hoạt gói dịch vụ.");
}

export async function rejectSubscriptionRequestAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const returnTo = readPlatformReturnPath(formData);
  const parsed = subscriptionRequestActionSchema.safeParse({
    requestId: readString(formData, "requestId"),
    adminNote: optionalString(formData, "adminNote")
  });
  if (!parsed.success) {
    redirectWithError(returnTo, "Yêu cầu đăng ký không hợp lệ.");
  }

  try {
    const request = await rejectSubscriptionRequest(parsed.data.requestId, actor.id, parsed.data.adminNote);
    revalidatePath(platformRoutes.restaurants);
    revalidatePath(platformRoutes.restaurantDetail(request.restaurantId));
  } catch (error) {
    redirectWithError(returnTo, safeErrorMessage(error, "Chưa thể từ chối yêu cầu đăng ký."));
  }

  redirectWithSuccess(returnTo, "Đã từ chối yêu cầu đăng ký.");
}
