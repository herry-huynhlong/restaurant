import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma, type RestaurantRole } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { generateQrToken, getTableQrUrl } from "@/lib/qr";
import { canRoleAccessPlan } from "@/lib/plan/features";

type AccessResult =
  | {
      userId: string;
      restaurant: {
        id: string;
        slug: string;
        status: string;
        plan: string;
      };
      role: RestaurantRole;
    }
  | { error: NextResponse };

async function requireQrAccess(slug: string): Promise<AccessResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, message: "Bạn cần đăng nhập lại." }, { status: 401 }) };
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      status: true,
        plan: true,
        businessType: true
    }
  });

  if (!restaurant) {
    return { error: NextResponse.json({ success: false, message: "Không tìm thấy nhà hàng." }, { status: 404 }) };
  }

  if (restaurant.status !== "ACTIVE") {
    return { error: NextResponse.json({ success: false, message: "Nhà hàng hiện đang bị khóa." }, { status: 403 }) };
  }

  const membership = await prisma.restaurantUser.findUnique({
    where: {
      restaurantId_userId: {
        restaurantId: restaurant.id,
        userId: session.user.id
      }
    },
    select: {
      role: true,
      isActive: true
    }
  });

  if (!membership?.isActive || !["OWNER", "MANAGER"].includes(membership.role) || !canRoleAccessPlan(restaurant.plan, membership.role, restaurant.businessType)) {
    return { error: NextResponse.json({ success: false, message: "Bạn không có quyền đổi mã QR bàn." }, { status: 403 }) };
  }

  return {
    userId: session.user.id,
    restaurant,
    role: membership.role
  };
}

export async function POST(request: Request, { params }: { params: { rSlug: string; tableId: string } }) {
  const access = await requireQrAccess(params.rSlug);
  if ("error" in access) return access.error;

  const table = await prisma.restaurantTable.findFirst({
    where: {
      id: params.tableId,
      restaurantId: access.restaurant.id
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!table) {
    return NextResponse.json({ success: false, message: "Không tìm thấy bàn." }, { status: 404 });
  }

  let qrToken: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextToken = generateQrToken();

    try {
      await prisma.$transaction([
        prisma.restaurantTable.update({
          where: {
            id: table.id,
            restaurantId: access.restaurant.id
          },
          data: { qrToken: nextToken }
        }),
        prisma.auditLog.create({
          data: {
            restaurantId: access.restaurant.id,
            userId: access.userId,
            action: "TABLE_QR_REGENERATED",
            entityType: "RestaurantTable",
            entityId: table.id,
            metadataJson: {
              tableName: table.name
            }
          }
        })
      ]);
      qrToken = nextToken;
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  if (!qrToken) {
    return NextResponse.json({ success: false, message: "Không tạo được mã QR mới." }, { status: 500 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
  const qrUrl = getTableQrUrl(baseUrl, access.restaurant.slug, qrToken);

  return NextResponse.json(
    {
      success: true,
      qrToken,
      qrUrl
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
