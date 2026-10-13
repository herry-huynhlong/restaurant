import path from "node:path";
import { stat } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";

const UPLOAD_ROOT = path.resolve(process.cwd(), "public", "uploads");
const POLICY_KEY = "default";
const VIETNAM_UTC_OFFSET_HOURS = 7;

const ESTIMATED_ROW_BYTES = {
  restaurant: 2048,
  restaurantSetting: 3072,
  category: 512,
  product: 2048,
  productOptionGroup: 1024,
  productOptionItem: 768,
  area: 512,
  table: 768,
  diningSession: 1024,
  order: 1024,
  orderItem: 1536,
  payment: 2048,
  serviceRequest: 1024,
  notification: 1024,
  restaurantUser: 768,
  pushSubscription: 2048,
  staffDeviceSession: 1024,
  auditLog: 1536
} as const;

export async function ensurePlatformDataPolicy() {
  return prisma.platformDataPolicy.upsert({
    where: { singletonKey: POLICY_KEY },
    create: { singletonKey: POLICY_KEY },
    update: {}
  });
}

export async function getPlatformStorageDashboard() {
  const policy = await ensurePlatformDataPolicy();
  const usageCount = await prisma.restaurantStorageUsage.count();
  if (usageCount === 0) {
    await refreshRestaurantStorageUsage();
  }

  const [restaurantUsages, backupRuns, maintenanceRuns, successfulBackups, latestFailedBackup] = await Promise.all([
    prisma.restaurantStorageUsage.findMany({
      orderBy: { estimatedBytes: "desc" },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true
          }
        }
      }
    }),
    prisma.platformBackupRun.findMany({
      take: 12,
      orderBy: { createdAt: "desc" }
    }),
    prisma.platformMaintenanceRun.findMany({
      take: 8,
      orderBy: { createdAt: "desc" }
    }),
    prisma.platformBackupRun.findMany({
      where: { status: "SUCCESS" },
      take: policy.backupRetentionCount,
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }]
    }),
    prisma.platformBackupRun.findFirst({
      where: { status: "FAILED" },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }]
    })
  ]);

  const latestSuccessfulBackup = successfulBackups[0] ?? null;
  const failedAfterLastSuccess =
    latestFailedBackup &&
    (!latestSuccessfulBackup ||
      latestFailedBackup.updatedAt.getTime() > (latestSuccessfulBackup.completedAt ?? latestSuccessfulBackup.updatedAt).getTime());

  return {
    policy: {
      id: policy.id,
      backupEnabled: policy.backupEnabled,
      backupTime: policy.backupTime,
      backupRetentionCount: policy.backupRetentionCount,
      notificationRetentionDays: policy.notificationRetentionDays,
      temporaryDataRetentionDays: policy.temporaryDataRetentionDays,
      backupStorageKind: policy.backupStorageKind,
      lastCleanupAt: policy.lastCleanupAt,
      nextCleanupAt: policy.nextCleanupAt,
      lastTaskStatus: policy.lastTaskStatus
    },
    totals: {
      estimatedBytes: restaurantUsages.reduce((sum, usage) => sum + toSafeNumber(usage.estimatedBytes), 0),
      dataBytes: restaurantUsages.reduce((sum, usage) => sum + toSafeNumber(usage.dataBytes), 0),
      uploadBytes: restaurantUsages.reduce((sum, usage) => sum + toSafeNumber(usage.uploadBytes), 0),
      backupBytes: successfulBackups.reduce((sum, backup) => sum + toSafeNumber(backup.sizeBytes), 0),
      restaurantCount: restaurantUsages.length
    },
    nextBackupAt: getNextBackupDate(policy.backupTime),
    latestSuccessfulBackup,
    latestFailedBackup: failedAfterLastSuccess ? latestFailedBackup : null,
    restaurantUsages: restaurantUsages.map((usage) => ({
      id: usage.id,
      restaurantId: usage.restaurantId,
      restaurantName: usage.restaurant.name,
      restaurantSlug: usage.restaurant.slug,
      restaurantPlan: usage.restaurant.plan,
      restaurantStatus: usage.restaurant.status,
      estimatedBytes: toSafeNumber(usage.estimatedBytes),
      dataBytes: toSafeNumber(usage.dataBytes),
      uploadBytes: toSafeNumber(usage.uploadBytes),
      calculatedAt: usage.calculatedAt,
      note: usage.note
    })),
    backupRuns: backupRuns.map((run) => ({
      id: run.id,
      status: run.status,
      triggerType: run.triggerType,
      storageKind: run.storageKind,
      locationLabel: run.locationLabel,
      sizeBytes: toSafeNumber(run.sizeBytes),
      verifiedAt: run.verifiedAt,
      errorMessage: run.errorMessage,
      queuedAt: run.queuedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt
    })),
    maintenanceRuns
  };
}

export async function refreshRestaurantStorageUsage() {
  const restaurants = await prisma.restaurant.findMany({
    where: { status: { not: "DELETED" } },
    select: {
      id: true,
      logoUrl: true,
      settings: {
        select: {
          logoUrl: true,
          paymentQrImage: true
        }
      },
      products: {
        select: { imageUrl: true }
      }
    }
  });

  for (const restaurant of restaurants) {
    const [counts, uploadBytes] = await Promise.all([countRestaurantRecords(restaurant.id), getUploadBytes([
      restaurant.logoUrl,
      restaurant.settings?.logoUrl,
      restaurant.settings?.paymentQrImage,
      ...restaurant.products.map((product) => product.imageUrl)
    ])]);

    const dataBytes = Object.entries(counts).reduce((sum, [key, count]) => {
      return sum + count * ESTIMATED_ROW_BYTES[key as keyof typeof ESTIMATED_ROW_BYTES];
    }, 0);

    await prisma.restaurantStorageUsage.upsert({
      where: { restaurantId: restaurant.id },
      create: {
        restaurantId: restaurant.id,
        dataBytes,
        uploadBytes,
        estimatedBytes: dataBytes + uploadBytes,
        calculatedAt: new Date(),
        note: "Dung lượng ước tính từ dữ liệu thuộc cửa hàng và ảnh đã liên kết."
      },
      update: {
        dataBytes,
        uploadBytes,
        estimatedBytes: dataBytes + uploadBytes,
        calculatedAt: new Date(),
        note: "Dung lượng ước tính từ dữ liệu thuộc cửa hàng và ảnh đã liên kết."
      }
    });
  }
}

async function countRestaurantRecords(restaurantId: string) {
  const [
    restaurant,
    restaurantSetting,
    category,
    product,
    productOptionGroup,
    productOptionItem,
    area,
    table,
    diningSession,
    order,
    orderItem,
    payment,
    serviceRequest,
    notification,
    restaurantUser,
    pushSubscription,
    staffDeviceSession,
    auditLog
  ] = await Promise.all([
    prisma.restaurant.count({ where: { id: restaurantId } }),
    prisma.restaurantSetting.count({ where: { restaurantId } }),
    prisma.category.count({ where: { restaurantId } }),
    prisma.product.count({ where: { restaurantId } }),
    prisma.productOptionGroup.count({ where: { restaurantId } }),
    prisma.productOptionItem.count({ where: { restaurantId } }),
    prisma.area.count({ where: { restaurantId } }),
    prisma.restaurantTable.count({ where: { restaurantId } }),
    prisma.diningSession.count({ where: { restaurantId } }),
    prisma.order.count({ where: { restaurantId } }),
    prisma.orderItem.count({ where: { restaurantId } }),
    prisma.payment.count({ where: { restaurantId } }),
    prisma.serviceRequest.count({ where: { restaurantId } }),
    prisma.notification.count({ where: { restaurantId } }),
    prisma.restaurantUser.count({ where: { restaurantId } }),
    prisma.pushSubscription.count({ where: { restaurantId } }),
    prisma.staffDeviceSession.count({ where: { restaurantId } }),
    prisma.auditLog.count({ where: { restaurantId } })
  ]);

  return {
    restaurant,
    restaurantSetting,
    category,
    product,
    productOptionGroup,
    productOptionItem,
    area,
    table,
    diningSession,
    order,
    orderItem,
    payment,
    serviceRequest,
    notification,
    restaurantUser,
    pushSubscription,
    staffDeviceSession,
    auditLog
  };
}

async function getUploadBytes(urls: Array<string | null | undefined>) {
  const files = new Set<string>();

  for (const url of urls) {
    const filePath = uploadUrlToPath(url);
    if (filePath) files.add(filePath);
  }

  let total = 0;
  for (const filePath of files) {
    try {
      const info = await stat(filePath);
      if (info.isFile()) total += info.size;
    } catch {
      // The file may have been removed manually; keep the estimate resilient.
    }
  }
  return total;
}

function uploadUrlToPath(url: string | null | undefined) {
  if (!url) return null;
  const pathname = safePathname(url);
  const marker = "/uploads/";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex === -1) return null;

  const relative = pathname.slice(markerIndex + marker.length);
  if (!relative || relative.includes("..")) return null;

  const filePath = path.resolve(UPLOAD_ROOT, ...relative.split("/"));
  if (!filePath.startsWith(UPLOAD_ROOT)) return null;
  return filePath;
}

function safePathname(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return value.startsWith("/") ? value : `/${value}`;
  }
}

function getNextBackupDate(backupTime: string) {
  const [hourText, minuteText] = backupTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const now = new Date();
  const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const nextVietnam = new Date(Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate(), hour, minute, 0, 0));

  if (nextVietnam.getTime() <= vietnamNow.getTime()) {
    nextVietnam.setUTCDate(nextVietnam.getUTCDate() + 1);
  }

  return new Date(nextVietnam.getTime() - VIETNAM_UTC_OFFSET_HOURS * 60 * 60 * 1000);
}

function toSafeNumber(value: bigint | number) {
  return Number(value);
}
