import { PrismaClient } from "@prisma/client";
import { isMaintenanceMode } from "@/lib/maintenance-mode";
import { isRestaurantInMaintenance } from "@/lib/restaurant-maintenance";

const writeOperations = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (writeOperations.has(operation) && (await isMaintenanceMode())) {
            throw new Error("SYSTEM_MAINTENANCE");
          }
          if (writeOperations.has(operation)) {
            const restaurantId = findRestaurantId(args);
            if (restaurantId && (await isRestaurantInMaintenance(restaurantId))) {
              throw new Error("RESTAURANT_MAINTENANCE");
            }
          }
          return query(args);
        }
      },
      async $executeRaw({ args, query }) {
        if (await isMaintenanceMode()) throw new Error("SYSTEM_MAINTENANCE");
        return query(args);
      },
      async $executeRawUnsafe({ args, query }) {
        if (await isMaintenanceMode()) throw new Error("SYSTEM_MAINTENANCE");
        return query(args);
      },
      async $queryRaw({ args, query }) {
        if (await isMaintenanceMode()) throw new Error("SYSTEM_MAINTENANCE");
        return query(args);
      },
      async $queryRawUnsafe({ args, query }) {
        if (await isMaintenanceMode()) throw new Error("SYSTEM_MAINTENANCE");
        return query(args);
      }
    }
  });
}

function findRestaurantId(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== "object" || depth > 5) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRestaurantId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.restaurantId === "string" && record.restaurantId) return record.restaurantId;
  for (const nested of Object.values(record)) {
    const found = findRestaurantId(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;
const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
