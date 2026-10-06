"use server";

import bcrypt from "bcryptjs";
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

  return new Date(String(value));
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const createRestaurantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  timezone: z.string().min(1),
  primaryLanguage: languageSchema,
  currency: z.string().min(1),
  ownerName: z.string().min(1),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
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

export async function createRestaurantAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const normalizedSlug = slugify(readString(formData, "slug") || readString(formData, "name"));
  const parsed = createRestaurantSchema.safeParse({
    name: readString(formData, "name"),
    slug: normalizedSlug,
    logoUrl: readString(formData, "logoUrl"),
    phone: readString(formData, "phone"),
    address: readString(formData, "address"),
    timezone: readString(formData, "timezone") || "Asia/Ho_Chi_Minh",
    primaryLanguage: readString(formData, "primaryLanguage") || "vi",
    currency: readString(formData, "currency") || "VND",
    ownerName: readString(formData, "ownerName"),
    ownerEmail: readString(formData, "ownerEmail"),
    ownerPassword: readString(formData, "ownerPassword"),
    ownerPhone: readString(formData, "ownerPhone"),
    plan: readString(formData, "plan") || "FREE",
    subscriptionStatus: readString(formData, "subscriptionStatus") || "ACTIVE",
    status: readString(formData, "status") || "INACTIVE"
  });

  if (!parsed.success) {
    redirectWithError(platformRoutes.newRestaurant, "Dữ liệu tạo nhà hàng không hợp lệ.");
  }

  const subscriptionStart = parseOptionalDate(formData.get("subscriptionStart"));
  const subscriptionEnd = parseOptionalDate(formData.get("subscriptionEnd"));
  const passwordHash = await bcrypt.hash(parsed.data.ownerPassword, 12);

  let createdRestaurantId: string;

  try {
    const restaurant = await prisma.$transaction(async (tx) => {
      const createdRestaurant = await tx.restaurant.create({
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          logoUrl: parsed.data.logoUrl || null,
          status: parsed.data.status,
          plan: parsed.data.plan,
          subscriptionStatus: parsed.data.subscriptionStatus,
          subscriptionStart,
          subscriptionEnd
        }
      });

      const owner = await tx.user.create({
        data: {
          name: parsed.data.ownerName,
          email: parsed.data.ownerEmail,
          phone: parsed.data.ownerPhone || null,
          passwordHash
        }
      });

      await tx.restaurantUser.create({
        data: {
          restaurantId: createdRestaurant.id,
          userId: owner.id,
          role: "OWNER"
        }
      });

      await tx.restaurantSetting.create({
        data: {
          restaurantId: createdRestaurant.id,
          restaurantName: parsed.data.name,
          logoUrl: parsed.data.logoUrl || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
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
    const message = error instanceof Error && error.message.includes("Unique constraint")
      ? "Slug hoặc email owner đã tồn tại."
      : "Không thể tạo nhà hàng. Vui lòng kiểm tra dữ liệu.";
    redirectWithError(platformRoutes.newRestaurant, message);
  }

  revalidatePath(platformRoutes.restaurants);
  redirect(platformRoutes.restaurantDetail(createdRestaurantId));
}

export async function updateRestaurantAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const parsed = updateRestaurantSchema.safeParse({
    restaurantId,
    name: readString(formData, "name"),
    slug: slugify(readString(formData, "slug")),
    logoUrl: readString(formData, "logoUrl"),
    phone: readString(formData, "phone"),
    address: readString(formData, "address"),
    timezone: readString(formData, "timezone") || "Asia/Ho_Chi_Minh",
    primaryLanguage: readString(formData, "primaryLanguage") || "vi",
    currency: readString(formData, "currency") || "VND",
    plan: readString(formData, "plan") || "FREE",
    subscriptionStatus: readString(formData, "subscriptionStatus") || "ACTIVE",
    status: readString(formData, "status") || "INACTIVE"
  });

  if (!parsed.success) {
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), "Dữ liệu cập nhật không hợp lệ.");
  }

  const subscriptionStart = parseOptionalDate(formData.get("subscriptionStart"));
  const subscriptionEnd = parseOptionalDate(formData.get("subscriptionEnd"));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: { id: parsed.data.restaurantId },
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          logoUrl: parsed.data.logoUrl || null,
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
          logoUrl: parsed.data.logoUrl || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
          timezone: parsed.data.timezone,
          primaryLanguage: parsed.data.primaryLanguage,
          currency: parsed.data.currency
        },
        create: {
          restaurantId: parsed.data.restaurantId,
          restaurantName: parsed.data.name,
          logoUrl: parsed.data.logoUrl || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
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
  } catch {
    redirectWithError(platformRoutes.restaurantEdit(restaurantId), "Slug đã tồn tại hoặc dữ liệu không hợp lệ.");
  }

  revalidatePath(platformRoutes.restaurants);
  redirect(platformRoutes.restaurantDetail(parsed.data.restaurantId));
}

export async function setRestaurantStatusAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const status = statusSchema.parse(readString(formData, "status"));
  const action = status === "ACTIVE" ? "RESTAURANT_ACTIVATED" : "RESTAURANT_SUSPENDED";

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
}

export async function resetOwnerPasswordAction(formData: FormData) {
  const actor = await requirePlatformAdmin();
  const restaurantId = readString(formData, "restaurantId");
  const password = readString(formData, "password") || "Password123!";
  const passwordHash = await bcrypt.hash(password, 12);

  const owner = await prisma.restaurantUser.findFirst({
    where: { restaurantId, role: "OWNER", isActive: true },
    select: { userId: true }
  });

  if (!owner) {
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: owner.userId }, data: { passwordHash } }),
    prisma.auditLog.create({
      data: {
        restaurantId,
        userId: actor.id,
        action: "OWNER_PASSWORD_RESET",
        entityType: "User",
        entityId: owner.userId,
        metadataJson: { resetToDemoPassword: password === "Password123!" }
      }
    })
  ]);

  revalidatePath(platformRoutes.restaurantDetail(restaurantId));
}
