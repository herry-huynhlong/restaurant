import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { parseVndInteger } from "@/lib/money";
import { servedUploadUrl } from "@/lib/upload-url";
import { getCategoryIdForSimpleMenuType, type SimpleMenuType } from "@/server/services/simple-menu-service";

const menuItemSchema = z.object({
  productId: z.string().optional(),
  menuType: z.enum(["MAIN", "EXTRA", "DRINK"]),
  nameVi: z.string().trim().min(1, "Tên món là bắt buộc.").max(160),
  descriptionVi: z.string().trim().max(500).optional(),
  price: z.number().int().min(0, "Giá không hợp lệ."),
  isActive: z.boolean(),
  isSoldOut: z.boolean(),
  isFeatured: z.boolean()
});
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

async function requireMenuAccess(slug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ ok: false, code: "UNAUTHENTICATED", error: "Bạn cần đăng nhập lại." }, { status: 401 }) };
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, slug: true }
  });
  if (!restaurant) {
    return { error: NextResponse.json({ ok: false, code: "TENANT_NOT_FOUND", error: "Không tìm thấy nhà hàng." }, { status: 404 }) };
  }

  const membership = await prisma.restaurantUser.findUnique({
    where: {
      restaurantId_userId: {
        restaurantId: restaurant.id,
        userId: session.user.id
      }
    },
    select: { role: true, isActive: true }
  });

  if (!membership?.isActive || !["OWNER", "MANAGER"].includes(membership.role)) {
    return { error: NextResponse.json({ ok: false, code: "FORBIDDEN", error: "Bạn không có quyền sửa menu." }, { status: 403 }) };
  }

  return { restaurant, userId: session.user.id, role: membership.role };
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

async function saveUploadedImage(formData: FormData) {
  const file = formData.get("imageFile");
  if (!(file instanceof File) || file.size === 0) return undefined;

  console.log("MENU IMAGE FILE", { name: file.name, type: file.type, size: file.size });

  if (!allowedImageTypes.includes(file.type)) {
    return { error: NextResponse.json({ ok: false, code: "INVALID_IMAGE_TYPE", error: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP." }, { status: 400 }) };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { error: NextResponse.json({ ok: false, code: "INVALID_IMAGE_SIZE", error: "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 5MB." }, { status: 413 }) };
  }

  const extension = path.extname(file.name).toLowerCase() || ".jpg";
  const safeExtension = [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
  const fileName = `${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
  const imageUrl = `/api/uploads/products/${fileName}`;
  console.log("SAVED MENU IMAGE PATH", imageUrl);
  return { imageUrl };
}

function productPayload(product: {
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
  const menuType = (product.category.nameVi === "Nước" ? "DRINK" : product.category.nameVi === "Món thêm" ? "EXTRA" : "MAIN") as SimpleMenuType;
  return {
    id: product.id,
    categoryId: product.categoryId,
    menuType,
    nameVi: product.nameVi,
    descriptionVi: product.descriptionVi,
    imageUrl: servedUploadUrl(product.imageUrl),
    price: product.price,
    isActive: product.isActive,
    isSoldOut: product.isSoldOut,
    isFeatured: product.isFeatured
  };
}

function prismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("PRISMA CREATE/UPDATE MENU ERROR", { code: error.code, meta: error.meta });
    return NextResponse.json({ ok: false, code: `PRISMA_${error.code}`, error: error.message, meta: error.meta }, { status: 500 });
  }
  console.error("CREATE/UPDATE MENU ERROR", error);
  return NextResponse.json({ ok: false, code: "UNKNOWN_ERROR", error: error instanceof Error ? error.message : "Không thể lưu món." }, { status: 500 });
}

async function parseRequest(request: NextRequest, slug: string) {
  const access = await requireMenuAccess(slug);
  if ("error" in access) return { error: access.error };

  const formData = await request.formData();
  for (const [key, value] of formData.entries()) {
    console.log("MENU FORMDATA", key, value instanceof File ? { name: value.name, type: value.type, size: value.size } : value);
  }

  const imageResult = await saveUploadedImage(formData);
  if (imageResult?.error) return { error: imageResult.error };

  const rawPrice = readString(formData, "price");
  const payload = {
    productId: readString(formData, "productId") || undefined,
    menuType: readString(formData, "menuType") || "MAIN",
    nameVi: readString(formData, "nameVi"),
    descriptionVi: readString(formData, "descriptionVi") || undefined,
    price: parseVndInteger(rawPrice),
    isActive: readBoolean(formData, "isActive"),
    isSoldOut: readBoolean(formData, "isSoldOut"),
    isFeatured: readBoolean(formData, "isFeatured")
  };

  console.log("MENU PAYLOAD", {
    method: request.method,
    slug,
    restaurantId: access.restaurant.id,
    userId: access.userId,
    role: access.role,
    rawPrice,
    normalizedPrice: payload.price,
    hasImage: Boolean(imageResult?.imageUrl),
    ...payload
  });

  const parsed = menuItemSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("MENU VALIDATION ERROR", JSON.stringify(parsed.error.flatten(), null, 2));
    return {
      error: NextResponse.json({
        ok: false,
        code: "VALIDATION_ERROR",
        error: "Dữ liệu món không hợp lệ.",
        fieldErrors: parsed.error.flatten().fieldErrors
      }, { status: 400 })
    };
  }

  const categoryId = await getCategoryIdForSimpleMenuType(access.restaurant.id, parsed.data.menuType);
  return { access, formData, parsed: parsed.data, categoryId, imageUrl: imageResult?.imageUrl };
}

export async function POST(request: NextRequest, { params }: { params: { rSlug: string } }) {
  try {
    const input = await parseRequest(request, params.rSlug);
    if ("error" in input) return input.error;

    const product = await prisma.product.create({
      data: {
        restaurantId: input.access.restaurant.id,
        categoryId: input.categoryId,
        nameVi: input.parsed.nameVi,
        descriptionVi: input.parsed.descriptionVi,
        imageUrl: input.imageUrl,
        price: input.parsed.price,
        isActive: input.parsed.isActive,
        isSoldOut: input.parsed.isSoldOut,
        isFeatured: input.parsed.isFeatured
      },
      include: { category: true }
    });

    await prisma.auditLog.create({
      data: {
        restaurantId: input.access.restaurant.id,
        userId: input.access.userId,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: product.id,
        metadataJson: { nameVi: product.nameVi, price: product.price }
      }
    });

    return NextResponse.json({ ok: true, product: productPayload(product), message: `Đã tạo món ${product.nameVi}.` }, { status: 201 });
  } catch (error) {
    return prismaError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { rSlug: string } }) {
  try {
    const input = await parseRequest(request, params.rSlug);
    if ("error" in input) return input.error;

    if (!input.parsed.productId) {
      return NextResponse.json({ ok: false, code: "MISSING_PRODUCT_ID", error: "Thiếu productId khi cập nhật món." }, { status: 400 });
    }

    const existing = await prisma.product.findFirst({
      where: {
        id: input.parsed.productId,
        restaurantId: input.access.restaurant.id
      },
      select: { imageUrl: true }
    });
    if (!existing) {
      return NextResponse.json({ ok: false, code: "PRODUCT_NOT_FOUND", error: "Món không tồn tại." }, { status: 404 });
    }

    const product = await prisma.product.update({
      where: {
        id: input.parsed.productId,
        restaurantId: input.access.restaurant.id
      },
      data: {
        categoryId: input.categoryId,
        nameVi: input.parsed.nameVi,
        nameEn: null,
        descriptionVi: input.parsed.descriptionVi,
        descriptionEn: null,
        imageUrl: input.imageUrl ?? existing.imageUrl,
        price: input.parsed.price,
        isActive: input.parsed.isActive,
        isSoldOut: input.parsed.isSoldOut,
        isFeatured: input.parsed.isFeatured
      },
      include: { category: true }
    });

    await prisma.auditLog.create({
      data: {
        restaurantId: input.access.restaurant.id,
        userId: input.access.userId,
        action: "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: product.id,
        metadataJson: { nameVi: product.nameVi, price: product.price, imageUpdated: Boolean(input.imageUrl) }
      }
    });

    return NextResponse.json({ ok: true, product: productPayload(product), message: `Đã cập nhật món ${product.nameVi}.` });
  } catch (error) {
    return prismaError(error);
  }
}
