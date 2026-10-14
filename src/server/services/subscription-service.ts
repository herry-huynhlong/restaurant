import type { Prisma, RestaurantPlan } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const subscriptionTerms = [3, 6, 12] as const;
export type SubscriptionTerm = (typeof subscriptionTerms)[number];

const defaultPlanDescriptions: Record<"BASIC" | "PRO", string> = {
  BASIC: "QR bàn, menu, gọi món, phục vụ, thanh toán cơ bản và báo cáo.",
  PRO: "Đầy đủ quyền quản lý, bếp, thu ngân, in bill và báo cáo nâng cao."
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
        planEntitlement: true,
        businessType: true,
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
  termMonths,
  requestType
}: {
  restaurantId: string;
  requestedByUserId: string;
  plan: "BASIC" | "PRO";
  termMonths: SubscriptionTerm;
  requestType?: "RENEWAL" | "UPGRADE";
}) {
  await ensureDefaultPlanPrices();
  const now = new Date();
  const quoteExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const [restaurant, price, currentRequest, existingPending] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        plan: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        subscriptionStatus: true,
        status: true
      }
    }),
    prisma.platformPlanPrice.findUnique({
      where: {
        plan_termMonths: {
          plan,
          termMonths
        }
      }
    }),
    prisma.restaurantSubscriptionRequest.findFirst({
      where: { restaurantId, status: "CONFIRMED" },
      orderBy: { confirmedAt: "desc" }
    }),
    prisma.restaurantSubscriptionRequest.findFirst({
      where: {
        restaurantId,
        status: "PENDING",
        OR: [
          { plan, termMonths },
          { requestType: "UPGRADE" }
        ]
      },
      select: { id: true }
    })
  ]);

  if (!restaurant || restaurant.status === "DELETED") {
    throw new Error("Nhà hàng không hợp lệ.");
  }
  if (!price?.isActive) {
    throw new Error("Kỳ đăng ký này hiện chưa mở bán.");
  }
  if (existingPending) {
    throw new Error("Đã có yêu cầu gói dịch vụ đang chờ xác nhận.");
  }

  const isUpgrade = requestType === "UPGRADE" || (restaurant.plan === "BASIC" && plan === "PRO" && restaurant.subscriptionEnd && restaurant.subscriptionEnd.getTime() > now.getTime());
  let finalTermMonths = termMonths;
  let finalPriceVnd = price.priceVnd;
  let finalMonthlyPriceVnd = price.monthlyPriceVnd;
  let currentSubscriptionStart = restaurant.subscriptionStart;
  let currentSubscriptionEnd = restaurant.subscriptionEnd;
  let pricingSnapshot: Prisma.InputJsonObject = {
    requestType: isUpgrade ? "UPGRADE" : "RENEWAL",
    targetPrice: {
      priceId: price.id,
      plan: price.plan,
      termMonths: price.termMonths,
      priceVnd: price.priceVnd,
      monthlyPriceVnd: price.monthlyPriceVnd
    }
  };

  if (isUpgrade) {
    if (restaurant.plan !== "BASIC" || plan !== "PRO") {
      throw new Error("Chỉ hỗ trợ nâng cấp từ BASIC lên PRO.");
    }
    if (!restaurant.subscriptionStart || !restaurant.subscriptionEnd || restaurant.subscriptionEnd.getTime() <= now.getTime()) {
      throw new Error("Gói hiện tại đã hết hạn hoặc chưa có thời hạn sử dụng.");
    }

    const activeTerm = subscriptionTerms.includes(currentRequest?.termMonths as SubscriptionTerm)
      ? currentRequest!.termMonths as SubscriptionTerm
      : termMonths;
    finalTermMonths = activeTerm;

    const [basicPrice, proPrice] = await Promise.all([
      prisma.platformPlanPrice.findUnique({ where: { plan_termMonths: { plan: "BASIC", termMonths: activeTerm } } }),
      prisma.platformPlanPrice.findUnique({ where: { plan_termMonths: { plan: "PRO", termMonths: activeTerm } } })
    ]);
    if (!basicPrice?.isActive || !proPrice?.isActive) {
      throw new Error("Chưa có bảng giá phù hợp để tính phí nâng cấp.");
    }

    const totalMs = Math.max(restaurant.subscriptionEnd.getTime() - restaurant.subscriptionStart.getTime(), 1);
    const remainingMs = Math.max(restaurant.subscriptionEnd.getTime() - now.getTime(), 0);
    const priceDiff = Math.max(proPrice.priceVnd - basicPrice.priceVnd, 0);
    finalPriceVnd = Math.max(Math.round(priceDiff * remainingMs / totalMs), 0);
    finalMonthlyPriceVnd = Math.round(finalPriceVnd / Math.max(monthsBetween(now, restaurant.subscriptionEnd), 1));
    currentSubscriptionStart = restaurant.subscriptionStart;
    currentSubscriptionEnd = restaurant.subscriptionEnd;
    pricingSnapshot = {
      requestType: "UPGRADE",
      currentPlan: restaurant.plan,
      targetPlan: plan,
      activeTermMonths: activeTerm,
      basicPrice: {
        priceId: basicPrice.id,
        priceVnd: basicPrice.priceVnd,
        monthlyPriceVnd: basicPrice.monthlyPriceVnd
      },
      proPrice: {
        priceId: proPrice.id,
        priceVnd: proPrice.priceVnd,
        monthlyPriceVnd: proPrice.monthlyPriceVnd
      },
      priceDiff,
      totalMs,
      remainingMs,
      calculatedAt: now.toISOString(),
      currentSubscriptionStart: restaurant.subscriptionStart.toISOString(),
      currentSubscriptionEnd: restaurant.subscriptionEnd.toISOString()
    };
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.restaurantSubscriptionRequest.create({
      data: {
        restaurantId,
        requestedByUserId,
        requestType: isUpgrade ? "UPGRADE" : "RENEWAL",
        currentPlan: restaurant.plan,
        plan,
        termMonths: finalTermMonths,
        priceVnd: finalPriceVnd,
        monthlyPriceVnd: finalMonthlyPriceVnd,
        status: "PENDING",
        currentSubscriptionStart,
        currentSubscriptionEnd,
        quoteExpiresAt,
        pricingSnapshotJson: pricingSnapshot
      }
    });

    await tx.restaurantSubscriptionEvent.create({
      data: {
        restaurantId,
        requestId: request.id,
        actorUserId: requestedByUserId,
        action: isUpgrade ? "UPGRADE_REQUEST_CREATED" : "REQUEST_CREATED",
        plan,
        termMonths: finalTermMonths,
        priceVnd: finalPriceVnd,
        startAt: currentSubscriptionStart,
        endAt: currentSubscriptionEnd,
        metadataJson: pricingSnapshot
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
          requestType: request.requestType,
          plan,
          termMonths: finalTermMonths,
          priceVnd: finalPriceVnd
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
        subscriptionStart: true,
        subscriptionEnd: true,
        status: true
      }
    });
    if (!restaurant || restaurant.status === "DELETED") throw new Error("Nhà hàng không hợp lệ.");

    const activatedStart = new Date();
    const isUpgrade = request.requestType === "UPGRADE";
    if (request.quoteExpiresAt && request.quoteExpiresAt.getTime() < activatedStart.getTime()) {
      throw new Error("Báo giá đã hết hạn. Vui lòng yêu cầu cửa hàng gửi lại.");
    }

    let activatedEnd: Date;
    if (isUpgrade) {
      if (restaurant.plan !== request.currentPlan || restaurant.plan !== "BASIC" || request.plan !== "PRO") {
        throw new Error("Gói hiện tại đã thay đổi. Vui lòng tạo báo giá nâng cấp mới.");
      }
      if (!restaurant.subscriptionEnd || !request.currentSubscriptionEnd || restaurant.subscriptionEnd.getTime() !== request.currentSubscriptionEnd.getTime()) {
        throw new Error("Ngày hết hạn đã thay đổi. Vui lòng tạo báo giá nâng cấp mới.");
      }
      if (restaurant.subscriptionEnd.getTime() <= activatedStart.getTime()) {
        throw new Error("Gói hiện tại đã hết hạn. Không thể nâng cấp giữa kỳ.");
      }
      activatedEnd = restaurant.subscriptionEnd;
    } else {
      const baseDate = restaurant.subscriptionEnd && restaurant.subscriptionEnd.getTime() > activatedStart.getTime()
        ? restaurant.subscriptionEnd
        : activatedStart;
      activatedEnd = addCalendarMonths(baseDate, request.termMonths);
    }

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
        action: isUpgrade ? "SUBSCRIPTION_UPGRADED" : restaurant.plan === request.plan ? "SUBSCRIPTION_RENEWED" : "SUBSCRIPTION_PLAN_CHANGED",
        plan: request.plan,
        termMonths: request.termMonths,
        priceVnd: request.priceVnd,
        startAt: activatedStart,
        endAt: activatedEnd,
        metadataJson: {
          requestType: request.requestType,
          previousPlan: restaurant.plan,
          previousSubscriptionStart: restaurant.subscriptionStart?.toISOString() ?? null,
          previousSubscriptionEnd: restaurant.subscriptionEnd?.toISOString() ?? null,
          pricingSnapshot: request.pricingSnapshotJson ?? null
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
          requestType: request.requestType,
          plan: request.plan,
          termMonths: request.termMonths,
          priceVnd: request.priceVnd,
          activatedEnd: activatedEnd.toISOString()
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

function monthsBetween(start: Date, end: Date) {
  const ms = Math.max(end.getTime() - start.getTime(), 1);
  return ms / (30 * 24 * 60 * 60 * 1000);
}

export function planPriceDescription(plan: RestaurantPlan | string, fallback?: string | null) {
  if (fallback?.trim()) return fallback;
  return plan === "PRO" ? defaultPlanDescriptions.PRO : defaultPlanDescriptions.BASIC;
}

export function daysRemaining(end: Date | null | undefined) {
  if (!end) return null;
  return Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
