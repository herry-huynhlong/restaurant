"use server";

import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { generateQrToken } from "@/lib/qr";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { parseVndInteger } from "@/lib/money";
import { servedUploadUrl } from "@/lib/upload-url";
import { getCategoryIdForSimpleMenuType, type SimpleMenuType } from "@/server/services/simple-menu-service";

const adminRoles = ["OWNER", "MANAGER"] as const;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

async function saveUploadedImage(formData: FormData, key: string) {
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
  const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
  return `/api/uploads/products/${fileName}`;
}

function actionError(code: string, error: string, fieldErrors?: Record<string, string[]>) {
  return { ok: false as const, code, error, fieldErrors };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function prismaErrorPayload(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta ? ` ${JSON.stringify(error.meta)}` : "";
    switch (error.code) {
      case "P2002":
        return actionError("UNIQUE_CONSTRAINT", `Dữ liệu bị trùng.${meta}`);
      case "P2003":
        return actionError("FOREIGN_KEY_CONSTRAINT", `Dữ liệu liên kết không tồn tại.${meta}`);
      case "P2011":
        return actionError("NULL_CONSTRAINT", `Thiếu dữ liệu bắt buộc.${meta}`);
      case "P2025":
        return actionError("RECORD_NOT_FOUND", `Không tìm thấy dữ liệu cần cập nhật.${meta}`);
      default:
        return actionError(`PRISMA_${error.code}`, `${fallback} (${error.code})${meta}`);
    }
  }

  if (error instanceof Error && error.message === "INVALID_IMAGE_TYPE") {
    return actionError("INVALID_IMAGE_TYPE", "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.");
  }
  if (error instanceof Error && error.message === "INVALID_IMAGE_SIZE") {
    return actionError("INVALID_IMAGE_SIZE", "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 5MB.");
  }

  if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
    return actionError("AUTH_REQUIRED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.");
  }

  return actionError("UNKNOWN_ERROR", `${fallback}: ${errorMessage(error)}`);
}

function redirectWithMessage(path: string, key: "error" | "success", message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

async function requireAdminContext(slug: string) {
  return requireRestaurantAccess(slug, [...adminRoles]);
}

async function audit(restaurantId: string, userId: string, action: string, entityType: string, entityId?: string, metadataJson?: unknown) {
  await prisma.auditLog.create({
    data: {
      restaurantId,
      userId,
      action,
      entityType,
      entityId,
      metadataJson: metadataJson === undefined ? undefined : (metadataJson as object)
    }
  });
}

const areaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).default(0)
});

export async function createAreaAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminTables(slug);
  const parsed = areaSchema.safeParse({
    name: readString(formData, "name"),
    sortOrder: readString(formData, "sortOrder") || 0
  });
  if (!parsed.success) redirectWithMessage(path, "error", "Tên khu vực không hợp lệ.");

  const area = await prisma.area.create({
    data: { restaurantId: access.restaurant.id, ...parsed.data }
  });
  await audit(access.restaurant.id, access.user.id, "AREA_CREATED", "Area", area.id, parsed.data);
  revalidatePath(path);
  redirectWithMessage(path, "success", `Tạo khu vực ${area.name} thành công.`);
}

export async function updateAreaAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminTables(slug);
  const areaId = readString(formData, "areaId");
  const parsed = areaSchema.safeParse({
    name: readString(formData, "name"),
    sortOrder: readString(formData, "sortOrder") || 0
  });
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu khu vực không hợp lệ.");

  const area = await prisma.area.update({
    where: { id: areaId, restaurantId: access.restaurant.id },
    data: parsed.data
  });
  await audit(access.restaurant.id, access.user.id, "AREA_UPDATED", "Area", area.id, parsed.data);
  revalidatePath(path);
  redirectWithMessage(path, "success", `Đã cập nhật khu vực ${area.name}.`);
}

export async function deleteAreaAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminTables(slug);
  const areaId = readString(formData, "areaId");
  const tableCount = await prisma.restaurantTable.count({
    where: { restaurantId: access.restaurant.id, areaId }
  });
  if (tableCount > 0) {
    redirectWithMessage(path, "error", "Không thể xóa khu vực đang có bàn. Vui lòng chuyển hoặc xóa các bàn trước.");
  }

  await prisma.area.delete({ where: { id: areaId, restaurantId: access.restaurant.id } });
  await audit(access.restaurant.id, access.user.id, "AREA_DELETED", "Area", areaId);
  revalidatePath(path);
  redirectWithMessage(path, "success", "Đã xóa khu vực.");
}

const tableSchema = z.object({
  name: z.string().trim().min(1).max(80),
  areaId: z.string().min(1),
  isActive: z.boolean()
});

export async function createTableAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminTables(slug);
  const parsed = tableSchema.safeParse({
    name: readString(formData, "name"),
    areaId: readString(formData, "areaId"),
    isActive: readBoolean(formData, "isActive")
  });
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu bàn không hợp lệ.");

  const area = await prisma.area.findFirst({ where: { id: parsed.data.areaId, restaurantId: access.restaurant.id } });
  if (!area) redirectWithMessage(path, "error", "Khu vực không tồn tại.");

  try {
    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: access.restaurant.id,
        areaId: parsed.data.areaId,
        name: parsed.data.name,
        isActive: parsed.data.isActive,
        qrToken: generateQrToken()
      }
    });
    await audit(access.restaurant.id, access.user.id, "TABLE_CREATED", "RestaurantTable", table.id, { name: table.name });
    revalidatePath(path);
    redirectWithMessage(path, "success", `Tạo bàn ${table.name} thành công.`);
  } catch {
    redirectWithMessage(path, "error", "Tên bàn đã tồn tại trong nhà hàng.");
  }
}

export async function updateTableAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminTables(slug);
  const tableId = readString(formData, "tableId");
  const parsed = tableSchema.safeParse({
    name: readString(formData, "name"),
    areaId: readString(formData, "areaId"),
    isActive: readBoolean(formData, "isActive")
  });
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu bàn không hợp lệ.");

  try {
    const table = await prisma.restaurantTable.update({
      where: { id: tableId, restaurantId: access.restaurant.id },
      data: parsed.data
    });
    await audit(access.restaurant.id, access.user.id, "TABLE_UPDATED", "RestaurantTable", table.id, parsed.data);
    revalidatePath(path);
    redirectWithMessage(path, "success", `Đã cập nhật bàn ${table.name}.`);
  } catch {
    redirectWithMessage(path, "error", "Không thể cập nhật bàn. Có thể tên bàn đã tồn tại.");
  }
}

export async function deleteOrDeactivateTableAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminTables(slug);
  const tableId = readString(formData, "tableId");
  const historyCount = await prisma.diningSession.count({ where: { restaurantId: access.restaurant.id, tableId } });
  const orderCount = await prisma.order.count({ where: { restaurantId: access.restaurant.id, tableId } });

  if (historyCount === 0 && orderCount === 0) {
    await prisma.restaurantTable.delete({ where: { id: tableId, restaurantId: access.restaurant.id } });
    await audit(access.restaurant.id, access.user.id, "TABLE_DELETED", "RestaurantTable", tableId);
    revalidatePath(path);
    redirectWithMessage(path, "success", "Đã xóa bàn.");
  }

  await prisma.restaurantTable.update({
    where: { id: tableId, restaurantId: access.restaurant.id },
    data: { isActive: false }
  });
  await audit(access.restaurant.id, access.user.id, "TABLE_DEACTIVATED", "RestaurantTable", tableId);
  revalidatePath(path);
  redirectWithMessage(path, "success", "Bàn đã có lịch sử giao dịch nên đã được ngừng sử dụng thay vì xóa dữ liệu.");
}

export async function regenerateTableQrAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminTables(slug);
  const tableId = readString(formData, "tableId");
  await prisma.restaurantTable.update({
    where: { id: tableId, restaurantId: access.restaurant.id },
    data: { qrToken: generateQrToken() }
  });
  await audit(access.restaurant.id, access.user.id, "TABLE_QR_REGENERATED", "RestaurantTable", tableId);
  revalidatePath(path);
  redirectWithMessage(path, "success", "Đã tạo lại QR token cho bàn.");
}

const categorySchema = z.object({
  nameVi: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean()
});

export async function createCategoryAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminCategories(slug);
  const parsed = categorySchema.safeParse({
    nameVi: readString(formData, "nameVi"),
    nameEn: readString(formData, "nameEn") || undefined,
    sortOrder: readString(formData, "sortOrder") || 0,
    isActive: readBoolean(formData, "isActive")
  });
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu danh mục không hợp lệ.");
  try {
    const category = await prisma.category.create({
      data: { restaurantId: access.restaurant.id, ...parsed.data }
    });
    await audit(access.restaurant.id, access.user.id, "CATEGORY_CREATED", "Category", category.id, parsed.data);
    revalidatePath(path);
    redirectWithMessage(path, "success", `Tạo danh mục ${category.nameVi} thành công.`);
  } catch {
    redirectWithMessage(path, "error", "Tên danh mục đã tồn tại.");
  }
}

export async function updateCategoryAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminCategories(slug);
  const categoryId = readString(formData, "categoryId");
  const parsed = categorySchema.safeParse({
    nameVi: readString(formData, "nameVi"),
    nameEn: readString(formData, "nameEn") || undefined,
    sortOrder: readString(formData, "sortOrder") || 0,
    isActive: readBoolean(formData, "isActive")
  });
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu danh mục không hợp lệ.");
  try {
    const category = await prisma.category.update({
      where: { id: categoryId, restaurantId: access.restaurant.id },
      data: parsed.data
    });
    await audit(access.restaurant.id, access.user.id, "CATEGORY_UPDATED", "Category", category.id, parsed.data);
    revalidatePath(path);
    redirectWithMessage(path, "success", `Đã cập nhật danh mục ${category.nameVi}.`);
  } catch {
    redirectWithMessage(path, "error", "Không thể cập nhật danh mục.");
  }
}

export async function deleteOrDeactivateCategoryAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminCategories(slug);
  const categoryId = readString(formData, "categoryId");
  const productCount = await prisma.product.count({ where: { restaurantId: access.restaurant.id, categoryId } });
  if (productCount === 0) {
    await prisma.category.delete({ where: { id: categoryId, restaurantId: access.restaurant.id } });
    await audit(access.restaurant.id, access.user.id, "CATEGORY_DELETED", "Category", categoryId);
    revalidatePath(path);
    redirectWithMessage(path, "success", "Đã xóa danh mục.");
  }
  await prisma.category.update({ where: { id: categoryId, restaurantId: access.restaurant.id }, data: { isActive: false } });
  await audit(access.restaurant.id, access.user.id, "CATEGORY_DEACTIVATED", "Category", categoryId);
  revalidatePath(path);
  redirectWithMessage(path, "success", "Danh mục đang có món nên đã được tắt thay vì xóa.");
}

const productSchema = z.object({
  categoryId: z.string().min(1),
  nameVi: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().max(160).optional(),
  descriptionVi: z.string().trim().max(500).optional(),
  descriptionEn: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  price: z.number().int().min(0),
  isActive: z.boolean(),
  isSoldOut: z.boolean(),
  isFeatured: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).default(0)
});

async function productDataFromForm(formData: FormData) {
  const uploadedImageUrl = await saveUploadedImage(formData, "imageFile");
  return {
    categoryId: readString(formData, "categoryId"),
    nameVi: readString(formData, "nameVi"),
    nameEn: readString(formData, "nameEn") || undefined,
    descriptionVi: readString(formData, "descriptionVi") || undefined,
    descriptionEn: readString(formData, "descriptionEn") || undefined,
    imageUrl: uploadedImageUrl ?? (readString(formData, "imageUrl") || readString(formData, "existingImageUrl") || undefined),
    price: parseVndInteger(readString(formData, "price")),
    isActive: readBoolean(formData, "isActive"),
    isSoldOut: readBoolean(formData, "isSoldOut"),
    isFeatured: readBoolean(formData, "isFeatured"),
    sortOrder: readString(formData, "sortOrder") || 0
  };
}

const simpleProductSchema = z.object({
  productId: z.string().optional(),
  menuType: z.enum(["MAIN", "EXTRA", "DRINK"]),
  nameVi: z.string().trim().min(1).max(160),
  descriptionVi: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  price: z.number().int().min(0),
  isActive: z.boolean(),
  isSoldOut: z.boolean(),
  isFeatured: z.boolean()
});

async function simpleProductDataFromForm(restaurantId: string, formData: FormData) {
  const uploadedImageUrl = await saveUploadedImage(formData, "imageFile");
  const menuType = (readString(formData, "menuType") || "MAIN") as SimpleMenuType;
  return {
    productId: readString(formData, "productId") || undefined,
    menuType,
    categoryId: await getCategoryIdForSimpleMenuType(restaurantId, menuType),
    nameVi: readString(formData, "nameVi"),
    descriptionVi: readString(formData, "descriptionVi") || undefined,
    imageUrl: uploadedImageUrl ?? (readString(formData, "existingImageUrl") || undefined),
    price: parseVndInteger(readString(formData, "price")),
    isActive: readBoolean(formData, "isActive"),
    isSoldOut: readBoolean(formData, "isSoldOut"),
    isFeatured: readBoolean(formData, "isFeatured")
  };
}

function simpleProductPayload(product: {
  id: string;
  categoryId: string;
  nameVi: string;
  descriptionVi: string | null;
  imageUrl: string | null;
  price: number;
  isActive: boolean;
  isSoldOut: boolean;
  isFeatured: boolean;
  category: { nameVi: string };
}) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    menuType: (product.category.nameVi === "Nước" ? "DRINK" : product.category.nameVi === "Món thêm" ? "EXTRA" : "MAIN") as SimpleMenuType,
    nameVi: product.nameVi,
    descriptionVi: product.descriptionVi,
    imageUrl: servedUploadUrl(product.imageUrl),
    price: product.price,
    isActive: product.isActive,
    isSoldOut: product.isSoldOut,
    isFeatured: product.isFeatured
  };
}

export async function saveSimpleProductAction(slug: string, formData: FormData) {
  try {
    const access = await requireAdminContext(slug);
    const path = restaurantRoutes.adminMenu(slug);
    const data = await simpleProductDataFromForm(access.restaurant.id, formData);
    console.log("CREATE MENU PAYLOAD", {
      slug,
      restaurantId: access.restaurant.id,
      userId: access.user.id,
      role: access.membership.role,
      productId: data.productId,
      menuType: data.menuType,
      categoryId: data.categoryId,
      nameVi: data.nameVi,
      price: data.price,
      hasImage: Boolean(data.imageUrl),
      isActive: data.isActive,
      isSoldOut: data.isSoldOut,
      isFeatured: data.isFeatured
    });
    const parsed = simpleProductSchema.safeParse(data);
    if (!parsed.success) {
      console.error("CREATE MENU VALIDATION ERROR", JSON.stringify(parsed.error.flatten(), null, 2));
      return actionError("VALIDATION_ERROR", "Dữ liệu món ăn không hợp lệ.", parsed.error.flatten().fieldErrors);
    }

    const product = parsed.data.productId
      ? await prisma.product.update({
        where: { id: parsed.data.productId, restaurantId: access.restaurant.id },
        data: {
          categoryId: data.categoryId,
          nameVi: parsed.data.nameVi,
          nameEn: null,
          descriptionVi: parsed.data.descriptionVi,
          descriptionEn: null,
          imageUrl: parsed.data.imageUrl,
          price: parsed.data.price,
          isActive: parsed.data.isActive,
          isSoldOut: parsed.data.isSoldOut,
          isFeatured: parsed.data.isFeatured
        },
        include: { category: true }
      })
      : await prisma.product.create({
        data: {
          restaurantId: access.restaurant.id,
          categoryId: data.categoryId,
          nameVi: parsed.data.nameVi,
          descriptionVi: parsed.data.descriptionVi,
          imageUrl: parsed.data.imageUrl,
          price: parsed.data.price,
          isActive: parsed.data.isActive,
          isSoldOut: parsed.data.isSoldOut,
          isFeatured: parsed.data.isFeatured
        },
        include: { category: true }
      });

    if (parsed.data.productId) {
      await audit(access.restaurant.id, access.user.id, "PRODUCT_UPDATED", "Product", product.id, { nameVi: product.nameVi, price: product.price });
    } else {
      await audit(access.restaurant.id, access.user.id, "PRODUCT_CREATED", "Product", product.id, { nameVi: product.nameVi, price: product.price });
    }
    revalidatePath(path);
    return {
      ok: true,
      product: simpleProductPayload(product),
      message: parsed.data.productId ? `Đã cập nhật món ${product.nameVi}.` : `Đã tạo món ${product.nameVi}.`
    };
  } catch (error) {
    console.error("CREATE MENU ITEM SERVER ERROR", error);
    return prismaErrorPayload(error, "Không thể lưu món");
  }
}

export async function updateSimpleProductFlagsAction(slug: string, productId: string, flags: { isActive?: boolean; isSoldOut?: boolean; isFeatured?: boolean }) {
  try {
    const access = await requireAdminContext(slug);
    const product = await prisma.product.update({
      where: { id: productId, restaurantId: access.restaurant.id },
      data: flags,
      include: { category: true }
    });
    await audit(access.restaurant.id, access.user.id, "PRODUCT_FLAGS_UPDATED", "Product", product.id, flags);
    revalidatePath(restaurantRoutes.adminMenu(slug));
    const message = flags.isSoldOut === true
      ? `${product.nameVi} đã hết món.`
      : flags.isSoldOut === false
        ? `${product.nameVi} đang bán trở lại.`
        : `Đã cập nhật trạng thái ${product.nameVi}.`;
    return { ok: true, product: simpleProductPayload(product), message };
  } catch (error) {
    console.error("UPDATE_SIMPLE_PRODUCT_FLAGS_ERROR", error);
    return { ok: false, error: "Không thể cập nhật trạng thái món." };
  }
}

export async function deleteSimpleProductAction(slug: string, productId: string) {
  try {
    const access = await requireAdminContext(slug);
    const orderCount = await prisma.orderItem.count({ where: { restaurantId: access.restaurant.id, productId } });
    const existing = await prisma.product.findFirst({ where: { id: productId, restaurantId: access.restaurant.id } });
    if (!existing) return { ok: false, error: "Món không tồn tại." };

    if (orderCount === 0) {
      await prisma.product.delete({ where: { id: productId, restaurantId: access.restaurant.id } });
      await audit(access.restaurant.id, access.user.id, "PRODUCT_DELETED", "Product", productId);
      revalidatePath(restaurantRoutes.adminMenu(slug));
      return { ok: true, deleted: true, productId, message: `Đã xóa món ${existing.nameVi}.` };
    }

    const product = await prisma.product.update({
      where: { id: productId, restaurantId: access.restaurant.id },
      data: { isActive: false },
      include: { category: true }
    });
    await audit(access.restaurant.id, access.user.id, "PRODUCT_DEACTIVATED", "Product", productId);
    revalidatePath(restaurantRoutes.adminMenu(slug));
    return {
      ok: true,
      deleted: false,
      product: simpleProductPayload(product),
      message: `${product.nameVi} đã có order nên được ngừng bán thay vì xóa.`
    };
  } catch (error) {
    console.error("DELETE_SIMPLE_PRODUCT_ERROR", error);
    return { ok: false, error: "Không thể xóa món." };
  }
}

async function replaceProductOptions(restaurantId: string, productId: string, formData: FormData) {
  const groupName = readString(formData, "optionGroupNameVi");
  if (!groupName) return;

  await prisma.productOptionGroup.deleteMany({ where: { restaurantId, productId } });
  const group = await prisma.productOptionGroup.create({
    data: {
      restaurantId,
      productId,
      nameVi: groupName,
      nameEn: readString(formData, "optionGroupNameEn") || null,
      selectionType: readString(formData, "optionSelectionType") === "MULTI" ? "MULTI" : "SINGLE",
      isRequired: readBoolean(formData, "optionIsRequired"),
      minSelect: Number.parseInt(readString(formData, "optionMinSelect") || "0", 10),
      maxSelect: Number.parseInt(readString(formData, "optionMaxSelect") || "1", 10)
    }
  });

  const itemNames = [readString(formData, "optionItem1NameVi"), readString(formData, "optionItem2NameVi"), readString(formData, "optionItem3NameVi")];
  const itemPrices = [readString(formData, "optionItem1Price"), readString(formData, "optionItem2Price"), readString(formData, "optionItem3Price")];
  for (const [index, nameVi] of itemNames.entries()) {
    if (!nameVi) continue;
    await prisma.productOptionItem.create({
      data: {
        restaurantId,
        optionGroupId: group.id,
        nameVi,
        priceDelta: parseVndInteger(itemPrices[index] ?? "0"),
        sortOrder: index
      }
    });
  }
}

export async function createProductAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminMenu(slug);
  const parsed = productSchema.safeParse(await productDataFromForm(formData));
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu món ăn không hợp lệ.");

  const category = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, restaurantId: access.restaurant.id } });
  if (!category) redirectWithMessage(path, "error", "Danh mục không tồn tại.");

  const product = await prisma.product.create({ data: { restaurantId: access.restaurant.id, ...parsed.data } });
  await replaceProductOptions(access.restaurant.id, product.id, formData);
  await audit(access.restaurant.id, access.user.id, "PRODUCT_CREATED", "Product", product.id, { nameVi: product.nameVi, price: product.price });
  revalidatePath(path);
  redirectWithMessage(path, "success", `Tạo món ${product.nameVi} thành công.`);
}

export async function updateProductAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminMenu(slug);
  const productId = readString(formData, "productId");
  const parsed = productSchema.safeParse(await productDataFromForm(formData));
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu món ăn không hợp lệ.");

  const product = await prisma.product.update({
    where: { id: productId, restaurantId: access.restaurant.id },
    data: parsed.data
  });
  await replaceProductOptions(access.restaurant.id, product.id, formData);
  await audit(access.restaurant.id, access.user.id, "PRODUCT_UPDATED", "Product", product.id, { nameVi: product.nameVi, price: product.price });
  revalidatePath(path);
  redirectWithMessage(path, "success", `Đã cập nhật món ${product.nameVi}.`);
}

export async function deleteOrDeactivateProductAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminMenu(slug);
  const productId = readString(formData, "productId");
  const orderCount = await prisma.orderItem.count({ where: { restaurantId: access.restaurant.id, productId } });
  if (orderCount === 0) {
    await prisma.product.delete({ where: { id: productId, restaurantId: access.restaurant.id } });
    await audit(access.restaurant.id, access.user.id, "PRODUCT_DELETED", "Product", productId);
    revalidatePath(path);
    redirectWithMessage(path, "success", "Đã xóa món.");
  }
  await prisma.product.update({ where: { id: productId, restaurantId: access.restaurant.id }, data: { isActive: false } });
  await audit(access.restaurant.id, access.user.id, "PRODUCT_DEACTIVATED", "Product", productId);
  revalidatePath(path);
  redirectWithMessage(path, "success", "Món đã có lịch sử order nên đã được ngừng bán thay vì xóa.");
}

export async function toggleSoldOutAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminMenu(slug);
  const productId = readString(formData, "productId");
  const isSoldOut = readBoolean(formData, "isSoldOut");
  await prisma.product.update({ where: { id: productId, restaurantId: access.restaurant.id }, data: { isSoldOut } });
  await audit(access.restaurant.id, access.user.id, "PRODUCT_SOLD_OUT_CHANGED", "Product", productId, { isSoldOut });
  revalidatePath(path);
}

const settingsSchema = z.object({
  restaurantName: z.string().trim().min(1).max(160),
  logoUrl: z.string().trim().max(500).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(50).optional(),
  timezone: z.string().trim().min(1).max(80),
  currency: z.string().trim().min(1).max(10),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  primaryLanguage: z.enum(["vi", "en"]),
  bankName: z.string().trim().max(120).optional(),
  bankCode: z.string().trim().max(50).optional(),
  accountNumber: z.string().trim().max(80).optional(),
  accountHolder: z.string().trim().max(160).optional(),
  paymentQrImage: z.string().trim().max(500).optional(),
  cashEnabled: z.boolean(),
  qrPaymentEnabled: z.boolean(),
  notificationSoundEnabled: z.boolean(),
  notifyNewOrder: z.boolean(),
  notifyServiceRequest: z.boolean(),
  notifyPaymentRequest: z.boolean()
});

export async function updateRestaurantSettingsAction(slug: string, formData: FormData) {
  const access = await requireAdminContext(slug);
  const path = restaurantRoutes.adminSettings(slug);
  const parsed = settingsSchema.safeParse({
    restaurantName: readString(formData, "restaurantName"),
    logoUrl: readString(formData, "logoUrl") || undefined,
    address: readString(formData, "address") || undefined,
    phone: readString(formData, "phone") || undefined,
    timezone: readString(formData, "timezone") || "Asia/Ho_Chi_Minh",
    currency: readString(formData, "currency") || "VND",
    primaryColor: readString(formData, "primaryColor") || "#0f766e",
    primaryLanguage: readString(formData, "primaryLanguage") || "vi",
    bankName: readString(formData, "bankName") || undefined,
    bankCode: readString(formData, "bankCode") || undefined,
    accountNumber: readString(formData, "accountNumber") || undefined,
    accountHolder: readString(formData, "accountHolder") || undefined,
    paymentQrImage: readString(formData, "paymentQrImage") || undefined,
    cashEnabled: readBoolean(formData, "cashEnabled"),
    qrPaymentEnabled: readBoolean(formData, "qrPaymentEnabled"),
    notificationSoundEnabled: readBoolean(formData, "notificationSoundEnabled"),
    notifyNewOrder: readBoolean(formData, "notifyNewOrder"),
    notifyServiceRequest: readBoolean(formData, "notifyServiceRequest"),
    notifyPaymentRequest: readBoolean(formData, "notifyPaymentRequest")
  });
  if (!parsed.success) redirectWithMessage(path, "error", "Dữ liệu cài đặt không hợp lệ.");

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: access.restaurant.id },
      data: { name: parsed.data.restaurantName, logoUrl: parsed.data.logoUrl || null }
    }),
    prisma.restaurantSetting.upsert({
      where: { restaurantId: access.restaurant.id },
      update: parsed.data,
      create: { restaurantId: access.restaurant.id, ...parsed.data }
    }),
    prisma.auditLog.create({
      data: {
        restaurantId: access.restaurant.id,
        userId: access.user.id,
        action: "SETTINGS_UPDATED",
        entityType: "RestaurantSetting",
        entityId: access.restaurant.id,
        metadataJson: { sections: ["info", "appearance", "language", "payment", "notification"] }
      }
    })
  ]);
  revalidatePath(path);
  redirectWithMessage(path, "success", "Đã lưu cài đặt nhà hàng.");
}

export async function markNotificationReadAction(slug: string, formData: FormData) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "WAITER", "CASHIER", "KITCHEN"]);
  const notificationId = readString(formData, "notificationId");
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      restaurantId: access.restaurant.id,
      OR: [{ recipientUserId: null }, { recipientUserId: access.user.id }]
    },
    data: { isRead: true }
  });
  revalidatePath("/");
}

export async function markAllNotificationsReadAction(slug: string) {
  const access = await requireRestaurantAccess(slug, ["OWNER", "MANAGER", "WAITER", "CASHIER", "KITCHEN"]);
  await prisma.notification.updateMany({
    where: {
      restaurantId: access.restaurant.id,
      isRead: false,
      OR: [{ recipientUserId: null }, { recipientUserId: access.user.id }]
    },
    data: { isRead: true }
  });
  revalidatePath("/");
}
