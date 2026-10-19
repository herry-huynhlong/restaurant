import { prisma } from "@/lib/db/prisma";

function activeSubscriptionRequestWhere(restaurantIds?: string[]) {
  return {
    status: "PENDING",
    ...(restaurantIds ? { restaurantId: { in: restaurantIds } } : {}),
    OR: [
      { quoteExpiresAt: null },
      { quoteExpiresAt: { gt: new Date() } }
    ]
  };
}

export async function getPendingSubscriptionRequestCount() {
  const restaurants = await prisma.restaurant.findMany({
    where: { status: { not: "DELETED" } },
    select: { id: true }
  });

  if (restaurants.length === 0) return 0;

  return prisma.restaurantSubscriptionRequest.count({
    where: activeSubscriptionRequestWhere(restaurants.map((restaurant) => restaurant.id))
  });
}

export async function getPlatformOverview() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalRestaurants,
    activeRestaurants,
    inactiveRestaurants,
    suspendedRestaurants,
    expiredRestaurants,
    newRestaurantsThisMonth,
    restaurants,
    expiringSoon,
    expired
  ] =
    await Promise.all([
      prisma.restaurant.count({ where: { status: { not: "DELETED" } } }),
      prisma.restaurant.count({ where: { status: "ACTIVE" } }),
      prisma.restaurant.count({ where: { status: "INACTIVE" } }),
      prisma.restaurant.count({ where: { status: "SUSPENDED" } }),
      prisma.restaurant.count({ where: { subscriptionStatus: "EXPIRED" } }),
      prisma.restaurant.count({ where: { status: { not: "DELETED" }, createdAt: { gte: startOfMonth } } }),
      prisma.restaurant.findMany({
        where: { status: { not: "DELETED" } },
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              tables: true,
              users: { where: { deletedAt: null } }
            }
          }
        }
      }),
      prisma.restaurant.findMany({
        where: {
          status: { not: "DELETED" },
          subscriptionEnd: {
            gte: new Date(),
            lte: inThirtyDays
          }
        },
        take: 8,
        orderBy: { subscriptionEnd: "asc" }
      }),
      prisma.restaurant.findMany({
        where: {
          status: { not: "DELETED" },
          OR: [{ subscriptionStatus: "EXPIRED" }, { subscriptionEnd: { lt: new Date() } }]
        },
        take: 8,
        orderBy: { subscriptionEnd: "asc" }
      })
    ]);

  return {
    totalRestaurants,
    activeRestaurants,
    inactiveRestaurants,
    suspendedRestaurants,
    expiredRestaurants,
    newRestaurantsThisMonth,
    restaurants,
    expiringSoon,
    expired
  };
}

export async function getPlatformRestaurants({ includeDeleted = false }: { includeDeleted?: boolean } = {}) {
  const restaurants = await prisma.restaurant.findMany({
    where: includeDeleted ? { status: "DELETED" } : { status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        where: { role: "OWNER", deletedAt: null },
        include: { user: true },
        take: 1
      },
      _count: {
        select: {
          tables: true,
          users: { where: { deletedAt: null } }
        }
      }
    }
  });

  const pendingRequests = await prisma.restaurantSubscriptionRequest.findMany({
    where: {
      ...activeSubscriptionRequestWhere(restaurants.map((restaurant) => restaurant.id))
    },
    orderBy: { createdAt: "desc" },
    include: {
      paymentOrders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          provider: true,
          status: true,
          amountVnd: true,
          paidAt: true
        }
      }
    }
  });
  const pendingByRestaurant = new Map<string, typeof pendingRequests>();
  for (const request of pendingRequests) {
    pendingByRestaurant.set(request.restaurantId, [...(pendingByRestaurant.get(request.restaurantId) ?? []), request]);
  }

  return restaurants.map((restaurant) => ({
    ...restaurant,
    subscriptionRequests: pendingByRestaurant.get(restaurant.id) ?? []
  })).sort((a, b) => {
    const pendingDelta = b.subscriptionRequests.length - a.subscriptionRequests.length;
    if (pendingDelta !== 0) return pendingDelta;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function getPlatformRestaurantDetail(restaurantId: string) {
  return prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      settings: true,
      users: {
        where: { deletedAt: null },
        include: { user: true },
        orderBy: { createdAt: "asc" }
      },
      tables: {
        include: { area: true },
        orderBy: { name: "asc" }
      },
      orders: {
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { table: true }
      },
      payments: {
        take: 50,
        orderBy: { createdAt: "desc" }
      },
      auditLogs: {
        take: 30,
        orderBy: { createdAt: "desc" },
        include: { user: true }
      },
      _count: {
        select: {
          tables: true,
          users: { where: { deletedAt: null } },
          orders: true,
          payments: true
        }
      }
    }
  });
}

export async function getPlatformOwners() {
  return prisma.restaurantUser.findMany({
    where: { role: "OWNER", deletedAt: null, restaurant: { status: { not: "DELETED" } } },
    include: {
      user: true,
      restaurant: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getPlatformAuditLogs() {
  return prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      user: true,
      restaurant: true
    }
  });
}
