"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { restaurantRoutes } from "@/lib/routes";
import { setCustomerSessionCookie } from "@/lib/customer-session";
import { canRestaurantOperate } from "@/lib/tenant/restaurant";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

const startSessionSchema = z.object({
  customerName: z.string().trim().min(1).max(80),
  qrToken: z.string().trim().min(16)
});

export async function startCustomerSessionAction(slug: string, formData: FormData) {
  const parsed = startSessionSchema.safeParse({
    customerName: String(formData.get("customerName") ?? ""),
    qrToken: String(formData.get("qrToken") ?? "")
  });

  if (!parsed.success) {
    redirect(`${restaurantRoutes.welcome(slug)}?t=${encodeURIComponent(String(formData.get("qrToken") ?? ""))}&error=${encodeURIComponent("Vui lòng nhập tên của bạn.")}`);
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    include: { settings: true }
  });

  if (!restaurant || !canRestaurantOperate({
    restaurantStatus: restaurant.status,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionEnd: restaurant.subscriptionEnd
  })) {
    redirect(`${restaurantRoutes.welcome(slug)}?t=${encodeURIComponent(parsed.data.qrToken)}&error=${encodeURIComponent("Nhà hàng hiện tạm ngừng hoạt động.")}`);
  }

  const table = await prisma.restaurantTable.findFirst({
    where: {
      restaurantId: restaurant.id,
      qrToken: parsed.data.qrToken
    }
  });

  if (!table) {
    redirect(`${restaurantRoutes.welcome(slug)}?error=${encodeURIComponent("QR không hợp lệ.")}`);
  }

  if (!table.isActive) {
    redirect(`${restaurantRoutes.welcome(slug)}?t=${encodeURIComponent(parsed.data.qrToken)}&error=${encodeURIComponent("Bàn này hiện không hoạt động.")}`);
  }

  const diningSession = await prisma.$transaction(async (tx) => {
    const activeSession = await tx.diningSession.findFirst({
      where: {
        restaurantId: restaurant.id,
        tableId: table.id,
        ...activeDiningSessionWhere()
      },
      orderBy: { openedAt: "desc" }
    });

    if (activeSession) return activeSession;

    const createdSession = await tx.diningSession.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        status: "OPEN",
        paymentStatus: "UNPAID"
      }
    });

    await tx.restaurantTable.update({
      where: { id: table.id },
      data: { status: "OCCUPIED" }
    });

    return createdSession;
  });

  setCustomerSessionCookie({
    restaurantId: restaurant.id,
    restaurantSlug: restaurant.slug,
    tableId: table.id,
    tableName: table.name,
    qrToken: table.qrToken,
    diningSessionId: diningSession.id,
    customerName: parsed.data.customerName.trim(),
    createdAt: Date.now()
  });

  redirect(restaurantRoutes.menu(restaurant.slug));
}
