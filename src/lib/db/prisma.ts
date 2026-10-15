import { PrismaClient } from "@prisma/client";
import { isMaintenanceMode } from "@/lib/maintenance-mode";

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

type AppPrismaClient = ReturnType<typeof createPrismaClient>;
const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
