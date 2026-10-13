import type { Prisma, RestaurantPlan } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const subscriptionTerms = [3, 6, 12] as const;
export type SubscriptionTerm = (typeof subscriptionTerms)[number];

const defaultPlanDescriptions: Record<"BASIC" | "PRO", string> = {
  BASIC: "Phù hợp quán nhỏ cần QR bàn, menu, gọi món, phục vụ, báo cáo cơ bản và top món.",
  PRO: "Phù hợp quán cần vận hành đầy đủ với quản lý, bếp, thu ngân, thanh toán, in bill và báo cáo nâng cao."
};

const defaultPrices: Array<{ plan: "BASIC" | "PRO"; termMonths: SubscriptionTerm; priceVnd: number; isRecommended?: boolean }> = [
  { plan: "BASIC", termMonths: 3, priceVnd: 657000 },
  { plan: "BASIC", termMonths: 6, priceVnd: 1194000 },
  { plan: "BASIC", termMonths: 12, priceVnd: 2148000, isRecommended: true },
  { plan: "PRO", termMonths: 3, priceVnd: 1197000 },
  { plan: "PRO", termMonths: 6, priceVnd: 2214000 },
  { plan: "PRO", termMonths: 12, priceVnd: 3948000, isRecommended: true }
];

export async function ensureDefaultPlanPrices() {
  const count = await prisma.platformPlanPrice.count();
  if (count > 0) return;

  await prisma.platformPlanPrice.createMany({
    data: defaultPrices.map((price, index) => ({
      plan: price.plan,
      termMonths: price.termMonths,
      priceVnd: price.priceVnd,
      monthlyPriceVnd: Math.round(price.priceVnd / price.termMonths),
      isActive: true,
      isRecommended: Boolean(price.isRecommended),
      description: defaultPlanDescriptions[price.plan],
      sortOrder: index
    })),
    skipDuplicates: true
  });
}

export async function ensureSubscriptionPolicy() {
  return prisma.platformSubscriptionPolicy.upsert({
    where: { singletonKey: "default" },
    create: { singletonKey: "default" },
    update: {}
  });
}

export async function getPlanPricingDashboard() {
  await ensureDefaultPlanPrices();
  const [prices, history, policy] = await Promise.all([
    prisma.platformPlanPrice.findMany({
      orderBy: [{ plan: "asc" }, { termMonths: "asc" }]
    }),
    prisma.platformPlanPriceHistory.findMany({
      take: 20,
      orderBy: { createdAt: "desc" }
    }),
    ensureSubscriptionPolicy()
  ]);

  return { prices, history, policy };
}

export async function getPublicPlanPrices() {
  await ensureDefaultPlanPrices();
  return prisma.platformPlanPrice.findMany({
    where: { isActive: true, plan: { in: ["BASIC", "PRO"] } },
    orderBy: [{ plan: "asc" }, { termMonths: "asc" }]
  });
}

export async function getRestaurantSubscriptionSummary(restaurantId: string) {
  const [restaurant, pendingRequests, currentRequest, recentRequests, events] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionStart: true,
        subscriptionEnd: true
      }
    }),
    prisma.restaurantSubscriptionRequest.findMany({
      where: { restaurantId, status: "PENDING" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.restaurantSubscriptionRequest.findFirst({
      where: { restaurantId, status: "CONFIRMED" },
      orderBy: { confirmedAt: "desc" }
    }),
    prisma.restaurantSubscriptionRequest.findMany({
      where: { restaurantId },
      take: 10,
      orderBy: { createdAt: "desc" }
    }),
    prisma.restaurantSubscriptionEvent.findMany({
      where: { restaurantId },
      take: 10,
      orderBy: { createdAt: "desc" }
    })
  ]);

  return { restaurant, pendingRequests, currentRequest, recentRequests, events };
}

export async function createSubscriptionRequest({
  restaurantId,
  requestedByUserId,
  plan,
  termMonths
}: {
  restaurantId: string;
  requestedByUserId: string;
  plan: "BASIC" | "PRO";
  termMonths: SubscriptionTerm;
}) {
  await ensureDefaultPlanPrices();
  const [price, existingPending] = await Promise.all([
    prisma.platformPlanPrice.findUnique({
      where: {
        plan_termMonths: {
          plan,
          termMonths
        }
      }
    }),
    prisma.restaurantSubscriptionRequest.findFirst({
      where: {
        restaurantId,
        plan,
        termMonths,
        status: "PENDING"
      },
      select: { id: true }
    })
  ]);

  if (!price?.isActive) {
    throw new Error("Kỳ đăng ký này hiện chưa mở bán.");
  }
  if (existingPending) {
    throw new Error("Đã có yêu cầu đăng ký tương tự đang chờ xác nhận.");
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.restaurantSubscriptionRequest.create({
      data: {
        restaurantId,
        requestedByUserId,
        plan,
        termMonths,
        priceVnd: price.priceVnd,
        monthlyPriceVnd: price.monthlyPriceVnd,
        status: "PENDING"
      }
    });

    await tx.restaurantSubscriptionEvent.create({
      data: {
        restaurantId,
        requestId: request.id,
        actorUserId: requestedByUserId,
        action: "REQUEST_CREATED",
        plan,
        termMonths,
        priceVnd: price.priceVnd
      }
    });

    await tx.auditLog.create({
      data: {
        restaurantId,
        userId: requestedByUserId,
        action: "SUBSCRIPTION_REQUEST_CREATED",
        entityType: "RestaurantSubscriptionRequest",
        entityId: request.id,
        metadataJson: {
          plan,
          termMonths,
          priceVnd: price.priceVnd
        }
      }
    });

    return request;
  });
}

export async function confirmSubscriptionRequest(requestId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.restaurantSubscriptionRequest.findUnique({
      where: { id: requestId }
    });
    if (!request) throw new Error("Không tìm thấy yêu cầu đăng ký.");
    if (request.status !== "PENDING") throw new Error("Yêu cầu này đã được xử lý trước đó.");

    const restaurant = await tx.restaurant.findUnique({
      where: { id: request.restaurantId },
      select: {
        id: true,
        plan: true,
        subscriptionEnd: true,
        status: true
      }
    });
    if (!restaurant || restaurant.status === "DELETED") throw new Error("Nhà hàng không hợp lệ.");

    const activatedStart = new Date();
    const baseDate = restaurant.subscriptionEnd && restaurant.subscriptionEnd.getTime() > activatedStart.getTime()
      ? restaurant.subscriptionEnd
      : activatedStart;
    const activatedEnd = addCalendarMonths(baseDate, request.termMonths);

    const updatedRequest = await tx.restaurantSubscriptionRequest.update({
      where: { id: request.id },
      data: {
        status: "CONFIRMED",
        confirmedByUserId: actorUserId,
        confirmedAt: activatedStart,
        activatedStart,
        activatedEnd
      }
    });

    await tx.restaurant.update({
      where: { id: request.restaurantId },
      data: {
        plan: request.plan,
        subscriptionStatus: "ACTIVE",
        subscriptionStart: activatedStart,
        subscriptionEnd: activatedEnd
      }
    });

    await tx.restaurantSubscriptionEvent.create({
      data: {
        restaurantId: request.restaurantId,
        requestId: request.id,
        actorUserId,
        action: restaurant.plan === request.plan ? "SUBSCRIPTION_RENEWED" : "SUBSCRIPTION_PLAN_CHANGED",
        plan: request.plan,
        termMonths: request.termMonths,
        priceVnd: request.priceVnd,
        startAt: activatedStart,
        endAt: activatedEnd,
        metadataJson: {
          previousPlan: restaurant.plan
        } satisfies Prisma.InputJsonObject
      }
    });

    await tx.auditLog.create({
      data: {
        restaurantId: request.restaurantId,
        userId: actorUserId,
        action: "SUBSCRIPTION_REQUEST_CONFIRMED",
        entityType: "RestaurantSubscriptionRequest",
        entityId: request.id,
        metadataJson: {
          plan: request.plan,
          termMonths: request.termMonths,
          priceVnd: request.priceVnd,
          activatedEnd
        }
      }
    });

    return updatedRequest;
  });
}

export async function rejectSubscriptionRequest(requestId: string, actorUserId: string, adminNote?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.restaurantSubscriptionRequest.findUnique({
      where: { id: requestId }
    });
    if (!request) throw new Error("Không tìm thấy yêu cầu đăng ký.");
    if (request.status !== "PENDING") throw new Error("Yêu cầu này đã được xử lý trước đó.");

    const rejected = await tx.restaurantSubscriptionRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        rejectedByUserId: actorUserId,
        rejectedAt: new Date(),
        adminNote: adminNote?.trim() || null
      }
    });

    await tx.restaurantSubscriptionEvent.create({
      data: {
        restaurantId: request.restaurantId,
        requestId: request.id,
        actorUserId,
        action: "REQUEST_REJECTED",
        plan: request.plan,
        termMonths: request.termMonths,
        priceVnd: request.priceVnd
      }
    });

    await tx.auditLog.create({
      data: {
        restaurantId: request.restaurantId,
        userId: actorUserId,
        action: "SUBSCRIPTION_REQUEST_REJECTED",
        entityType: "RestaurantSubscriptionRequest",
        entityId: request.id,
        metadataJson: { adminNote: adminNote ?? null }
      }
    });

    return rejected;
  });
}

export function addCalendarMonths(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

export function planPriceDescription(plan: RestaurantPlan | string, fallback?: string | null) {
  if (fallback?.trim()) return fallback;
  return plan === "PRO" ? defaultPlanDescriptions.PRO : defaultPlanDescriptions.BASIC;
}

export function daysRemaining(end: Date | null | undefined) {
  if (!end) return null;
  return Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
