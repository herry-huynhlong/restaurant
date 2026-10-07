import { prisma } from "@/lib/db/prisma";

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
      prisma.restaurant.count(),
      prisma.restaurant.count({ where: { status: "ACTIVE" } }),
      prisma.restaurant.count({ where: { status: "INACTIVE" } }),
      prisma.restaurant.count({ where: { status: "SUSPENDED" } }),
      prisma.restaurant.count({ where: { subscriptionStatus: "EXPIRED" } }),
      prisma.restaurant.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.restaurant.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              tables: true,
              users: true
            }
          }
        }
      }),
      prisma.restaurant.findMany({
        where: {
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

export async function getPlatformRestaurants() {
  return prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        where: { role: "OWNER" },
        include: { user: true },
        take: 1
      },
      _count: {
        select: {
          tables: true,
          users: true
        }
      }
    }
  });
}

export async function getPlatformRestaurantDetail(restaurantId: string) {
  return prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      settings: true,
      users: {
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
          users: true,
          orders: true,
          payments: true
        }
      }
    }
  });
}

export async function getPlatformOwners() {
  return prisma.restaurantUser.findMany({
    where: { role: "OWNER" },
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
