import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";

const UPLOAD_ROOT = path.resolve(process.cwd(), "public", "uploads");
const POLICY_KEY = "default";
const VIETNAM_UTC_OFFSET_HOURS = 7;
const BACKUP_WORKER_KEY = "backup-worker";
const WORKER_STALE_MS = 5 * 60 * 1000;
const QUEUED_TIMEOUT_MS = 30 * 60 * 1000;
const RUNNING_TIMEOUT_MS = 2 * 60 * 60 * 1000;

type RestoreCheckStatus = "PASS" | "WARN" | "FAIL";

export type BackupRestoreReadiness = {
  backupId: string;
  status: "READY" | "NEEDS_CHECK" | "NOT_READY";
  checkedAt: Date;
  canRestoreProduction: false;
  productionRestoreMessage: string;
  checks: Array<{
    key: string;
    title: string;
    status: RestoreCheckStatus;
    message: string;
  }>;
};

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
  await markTimedOutBackupRuns();
  const policy = await ensurePlatformDataPolicy();
  const usageCount = await prisma.restaurantStorageUsage.count();
  if (usageCount === 0) {
    await refreshRestaurantStorageUsage();
  }

  const [restaurantUsages, backupRuns, maintenanceRuns, successfulBackups, latestFailedBackup, workerHeartbeat] = await Promise.all([
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
    }),
    prisma.platformWorkerHeartbeat.findUnique({
      where: { singletonKey: BACKUP_WORKER_KEY }
    })
  ]);

  const latestSuccessfulBackup = successfulBackups[0] ?? null;
  const failedAfterLastSuccess =
    latestFailedBackup &&
    (!latestSuccessfulBackup ||
      latestFailedBackup.updatedAt.getTime() > (latestSuccessfulBackup.completedAt ?? latestSuccessfulBackup.updatedAt).getTime());
  const backupRunsWithRestore = await Promise.all(
    backupRuns.map(async (run) => ({
      run,
      restoreReadiness: await buildBackupRestoreReadiness(run, { verifyChecksum: false })
    }))
  );

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
    backupWorker: buildBackupWorkerStatus(workerHeartbeat, backupRuns),
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
    backupRuns: backupRunsWithRestore.map(({ run, restoreReadiness }) => ({
      id: run.id,
      status: run.status,
      triggerType: run.triggerType,
      storageKind: run.storageKind,
      locationLabel: run.locationLabel,
      sizeBytes: toSafeNumber(run.sizeBytes),
      verifiedAt: run.verifiedAt,
      errorMessage: publicBackupError(run.errorMessage),
      diagnosticMessage: diagnosticBackupError(run.errorMessage),
      queuedAt: run.queuedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      verifiedAtLabel: run.verifiedAt,
      restoreReadiness
    })),
    maintenanceRuns
  };
}

function publicBackupError(message: string | null) {
  if (!message) return null;
  return "Không thể hoàn tất sao lưu. Vui lòng kiểm tra dịch vụ sao lưu.";
}

function diagnosticBackupError(message: string | null) {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes("server version mismatch") || lower.includes("pg_dump version")) {
    return "Công cụ sao lưu chưa tương thích với hệ thống dữ liệu.";
  }
  if (lower.includes("database_url_missing")) {
    return "Dịch vụ sao lưu thiếu cấu hình cần thiết.";
  }
  if (lower.includes("backup_database_file_empty")) {
    return "Dữ liệu sao lưu không hợp lệ.";
  }
  if (lower.includes("pg_dump_major_mismatch")) {
    return "Công cụ sao lưu chưa tương thích với hệ thống dữ liệu.";
  }
  if (lower.includes("backup_tool_not_available")) {
    return "Dịch vụ sao lưu thiếu công cụ cần thiết.";
  }
  if (lower.includes("backup_failed")) {
    return "Lần sao lưu chưa hoàn tất.";
  }
  if (lower.includes("command failed")) {
    return "Lần sao lưu chưa hoàn tất. Hãy kiểm tra tình trạng hệ thống.";
  }
  return "Yêu cầu chưa hoàn tất. Hãy kiểm tra tình trạng hệ thống.";
}

export async function checkBackupRestoreReadiness(backupRunId: string) {
  const run = await prisma.platformBackupRun.findUnique({
    where: { id: backupRunId }
  });

  if (!run) {
    return {
      backupId: backupRunId,
      status: "NOT_READY" as const,
      checkedAt: new Date(),
      canRestoreProduction: false as const,
      productionRestoreMessage: productionRestoreLockedMessage(),
      checks: [
        {
          key: "backup_record",
          title: "Bản ghi sao lưu",
          status: "FAIL" as const,
          message: "Không tìm thấy bản sao lưu."
        }
      ]
    };
  }

  return buildBackupRestoreReadiness(run, { verifyChecksum: true });
}

async function buildBackupRestoreReadiness(
  run: {
    id: string;
    status: string;
    databaseDumpName: string | null;
    uploadsArchiveName: string | null;
    checksum: string | null;
    verifiedAt: Date | null;
  },
  options: { verifyChecksum: boolean }
): Promise<BackupRestoreReadiness> {
  const checks: BackupRestoreReadiness["checks"] = [];
  const checkedAt = new Date();

  if (run.status !== "SUCCESS") {
    checks.push({
      key: "backup_status",
      title: "Trạng thái sao lưu",
      status: "FAIL",
      message: "Chỉ bản sao lưu thành công mới được kiểm tra khôi phục."
    });
    return restoreReadiness(run.id, checkedAt, checks);
  }

  checks.push({
    key: "backup_status",
    title: "Trạng thái sao lưu",
    status: "PASS",
    message: "Bản sao lưu đã hoàn tất."
  });

  if (!run.verifiedAt) {
    checks.push({
      key: "backup_verified",
      title: "Xác minh khi tạo",
      status: "FAIL",
      message: "Bản sao lưu chưa có dấu xác minh khi tạo."
    });
  } else {
    checks.push({
      key: "backup_verified",
      title: "Xác minh khi tạo",
      status: "PASS",
      message: "Bản sao lưu đã được ghi nhận xác minh khi tạo."
    });
  }

  const databasePath = safeBackupPath(run.databaseDumpName);
  const uploadsPath = safeBackupPath(run.uploadsArchiveName);
  const manifestPath = run.databaseDumpName ? safeBackupPath(path.join(path.dirname(run.databaseDumpName), "manifest.json")) : null;

  if (!databasePath) {
    checks.push({
      key: "database_dump",
      title: "Dữ liệu hệ thống",
      status: "FAIL",
      message: "Không tìm thấy thông tin file dữ liệu trong bản sao lưu."
    });
  } else {
    await checkFile(databasePath, checks, "database_dump", "Dữ liệu hệ thống");
  }

  if (run.uploadsArchiveName) {
    if (!uploadsPath) {
      checks.push({
        key: "uploads_archive",
        title: "Ảnh tải lên",
        status: "FAIL",
        message: "Đường dẫn file ảnh trong bản sao lưu không hợp lệ."
      });
    } else {
      await checkFile(uploadsPath, checks, "uploads_archive", "Ảnh tải lên");
    }
  } else {
    checks.push({
      key: "uploads_archive",
      title: "Ảnh tải lên",
      status: "WARN",
      message: "Bản sao lưu này không có file ảnh tải lên."
    });
  }

  if (!manifestPath) {
    checks.push({
      key: "manifest",
      title: "Thông tin bản sao lưu",
      status: "FAIL",
      message: "Không tìm thấy thông tin manifest."
    });
  } else {
    await checkManifest(manifestPath, run, checks);
  }

  if (!run.checksum) {
    checks.push({
      key: "checksum",
      title: "Checksum",
      status: "FAIL",
      message: "Bản sao lưu chưa có checksum để đối chiếu."
    });
  } else if (!options.verifyChecksum) {
    checks.push({
      key: "checksum",
      title: "Checksum",
      status: "WARN",
      message: "Checksum sẽ được đối chiếu khi bấm kiểm tra khả năng khôi phục."
    });
  } else if (databasePath && manifestPath && !hasFailedRequiredChecks(checks)) {
    const filePaths = [databasePath, ...(uploadsPath ? [uploadsPath] : []), manifestPath];
    const checksum = await checksumFiles(filePaths);
    checks.push({
      key: "checksum",
      title: "Checksum",
      status: checksum === run.checksum ? "PASS" : "FAIL",
      message: checksum === run.checksum ? "Checksum khớp với bản ghi sao lưu." : "Checksum không khớp. Không được khôi phục bản sao lưu này."
    });
  }

  if (options.verifyChecksum && !hasFailedRequiredChecks(checks)) {
    checks.push({
      key: "staging_restore",
      title: "Restore staging",
      status: "WARN",
      message: "Chưa chạy restore vào môi trường cô lập từ giao diện này. Khôi phục production vẫn bị khóa."
    });
  }

  return restoreReadiness(run.id, checkedAt, checks);
}

async function checkFile(filePath: string, checks: BackupRestoreReadiness["checks"], key: string, title: string) {
  try {
    const info = await stat(filePath);
    checks.push({
      key,
      title,
      status: info.isFile() && info.size > 0 ? "PASS" : "FAIL",
      message: info.isFile() && info.size > 0 ? "File còn tồn tại và có dữ liệu." : "File không hợp lệ hoặc rỗng."
    });
  } catch {
    checks.push({
      key,
      title,
      status: "FAIL",
      message: "File không còn tồn tại hoặc không thể truy cập."
    });
  }
}

async function checkManifest(
  manifestPath: string,
  run: { id: string; databaseDumpName: string | null; uploadsArchiveName: string | null },
  checks: BackupRestoreReadiness["checks"]
) {
  try {
    const info = await stat(manifestPath);
    if (!info.isFile() || info.size <= 0) {
      checks.push({
        key: "manifest",
        title: "Thông tin bản sao lưu",
        status: "FAIL",
        message: "Manifest không hợp lệ hoặc rỗng."
      });
      return;
    }

    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as {
      backupId?: unknown;
      files?: { database?: unknown; uploads?: unknown };
    };
    const matches =
      parsed.backupId === run.id &&
      parsed.files?.database === run.databaseDumpName &&
      (parsed.files?.uploads ?? null) === (run.uploadsArchiveName ?? null);

    checks.push({
      key: "manifest",
      title: "Thông tin bản sao lưu",
      status: matches ? "PASS" : "FAIL",
      message: matches ? "Manifest khớp với bản ghi sao lưu." : "Manifest không khớp với bản ghi sao lưu."
    });
  } catch {
    checks.push({
      key: "manifest",
      title: "Thông tin bản sao lưu",
      status: "FAIL",
      message: "Không thể đọc manifest của bản sao lưu."
    });
  }
}

function restoreReadiness(backupId: string, checkedAt: Date, checks: BackupRestoreReadiness["checks"]): BackupRestoreReadiness {
  const failed = hasFailedRequiredChecks(checks);
  const needsManualStaging = checks.some((check) => check.key === "staging_restore" && check.status === "WARN");
  const pendingChecksum = checks.some((check) => check.key === "checksum" && check.status === "WARN");

  return {
    backupId,
    status: failed ? "NOT_READY" : needsManualStaging || pendingChecksum ? "NEEDS_CHECK" : "READY",
    checkedAt,
    canRestoreProduction: false,
    productionRestoreMessage: productionRestoreLockedMessage(),
    checks
  };
}

function hasFailedRequiredChecks(checks: BackupRestoreReadiness["checks"]) {
  return checks.some((check) => check.status === "FAIL");
}

function productionRestoreLockedMessage() {
  return "Khôi phục production đang khóa cho đến khi có restore worker cô lập, chế độ bảo trì và bản dự phòng trước khôi phục.";
}

function safeBackupPath(relativePath: string | null) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("..")) return null;
  const root = getBackupRoot();
  const filePath = path.resolve(root, relativePath);
  return filePath === root || filePath.startsWith(`${root}${path.sep}`) ? filePath : null;
}

function getBackupRoot() {
  return path.resolve(process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups"));
}

async function checksumFiles(filePaths: string[]) {
  const hash = createHash("sha256");
  for (const filePath of filePaths) {
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", resolve);
    });
  }
  return hash.digest("hex");
}

async function markTimedOutBackupRuns() {
  const now = new Date();
  await prisma.platformBackupRun.updateMany({
    where: {
      status: "QUEUED",
      queuedAt: { lt: new Date(now.getTime() - QUEUED_TIMEOUT_MS) }
    },
    data: {
      status: "FAILED",
      completedAt: now,
      errorMessage: "Dịch vụ sao lưu chưa xử lý yêu cầu trong thời gian cho phép."
    }
  });

  await prisma.platformBackupRun.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: new Date(now.getTime() - RUNNING_TIMEOUT_MS) }
    },
    data: {
      status: "FAILED",
      completedAt: now,
      errorMessage: "Tác vụ sao lưu chạy quá lâu và đã được đánh dấu chưa thành công."
    }
  });
}

function buildBackupWorkerStatus(
  heartbeat: { lastSeenAt: Date; status: string; message: string | null } | null,
  backupRuns: Array<{ status: string; queuedAt: Date }>
) {
  const now = Date.now();
  const hasPending = backupRuns.some((run) => run.status === "QUEUED" || run.status === "RUNNING");
  const lastSeenAt = heartbeat?.lastSeenAt ?? null;
  const ready = Boolean(heartbeat && now - heartbeat.lastSeenAt.getTime() <= WORKER_STALE_MS);

  return {
    ready,
    lastSeenAt,
    status: heartbeat?.status ?? "UNKNOWN",
    message: ready
      ? publicWorkerMessage(heartbeat?.message)
      : hasPending
        ? "Dịch vụ sao lưu chưa sẵn sàng. Yêu cầu có thể chưa được xử lý ngay."
        : "Dịch vụ sao lưu tạm thời chưa sẵn sàng."
  };
}

function publicWorkerMessage(message: string | null | undefined) {
  if (!message) return "Dịch vụ sao lưu đang sẵn sàng.";
  if (message.includes("sẵn sàng")) return "Dịch vụ sao lưu đang sẵn sàng.";
  if (message.includes("thủ công")) return "Đang xử lý yêu cầu sao lưu.";
  if (message.includes("dọn")) return "Đang dọn dữ liệu theo chính sách lưu trữ.";
  return "Dịch vụ sao lưu đang hoạt động.";
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
