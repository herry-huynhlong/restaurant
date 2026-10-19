import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { markInterruptedRestoreJobs, processNextRestoreJob, verifyRestoreCandidate } from "./platform-restore-worker";
import { isMaintenanceMode } from "@/lib/maintenance-mode";
import { disableRestaurantMaintenance } from "@/lib/restaurant-maintenance";
import { createRestaurantBackup, restoreRestaurantBackup } from "@/server/services/restaurant-backup-service";
import { expireStaleSubscriptionRequests } from "@/server/services/subscription-service";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();
const backupRoot = path.resolve(process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups"));
const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
const policyKey = "default";
const workerKey = "backup-worker";
const vietnamUtcOffsetHours = 7;
const loopIntervalMs = Number(process.env.MAINTENANCE_WORKER_INTERVAL_MS ?? 30000);
const taskHistoryRetentionDays = 7;
const manualBackupRetentionCount = 3;

async function main() {
  const mode = process.argv[2] ?? "worker";
  const policy = await ensurePolicy();

  if (mode === "loop") {
    await runLoop();
    return;
  }

  if (mode === "backup") {
    await touchWorker("OK", "Đang xử lý sao lưu thủ công.");
    await queueManualBackupIfNeeded(policy);
    await processNextBackup();
    await touchWorker("OK", "Đã xử lý xong lượt sao lưu thủ công.");
    return;
  }

  if (mode === "cleanup") {
    await touchWorker("OK", "Đang xử lý dọn dữ liệu tạm.");
    await queueCleanup();
    await processNextCleanup();
    await touchWorker("OK", "Đã xử lý xong lượt dọn dữ liệu tạm.");
    return;
  }

  if (mode === "restore-verify") {
    const backupId = process.argv[3];
    if (!backupId) throw new Error("BACKUP_ID_REQUIRED");
    await verifyRestoreCandidate(prisma, backupId);
    process.stdout.write("Restore staging verification passed.\n");
    return;
  }

  await touchWorker("OK", "Đang kiểm tra tác vụ nền.");
  await queueAutomaticBackupIfNeeded(policy, false);
  await queueAutomaticRestaurantBackupsIfNeeded(policy);
  await processNextBackup();
  await processNextRestaurantBackup();
  await processNextRestaurantRestore();
  await processNextCleanup();
  await processSubscriptionLifecycle();
  await cleanupOldTaskHistory();
  await touchWorker("OK", "Đã kiểm tra xong tác vụ nền.");
}

async function ensurePolicy() {
  return prisma.platformDataPolicy.upsert({
    where: { singletonKey: policyKey },
    create: { singletonKey: policyKey },
    update: {}
  });
}

async function runLoop() {
  process.on("SIGTERM", () => {
    process.exitCode = 0;
  });
  process.on("SIGINT", () => {
    process.exitCode = 0;
  });

  await markInterruptedRestoreJobs();
  await recoverInterruptedRestaurantJobs();

  while (process.exitCode === undefined) {
    try {
      if (await isMaintenanceMode()) {
        await sleep(loopIntervalMs);
        continue;
      }
      const handledRestore = await processNextRestoreJob(prisma);
      if (handledRestore) {
        if (!(await isMaintenanceMode())) {
          await touchWorker("OK", "Đã xử lý yêu cầu khôi phục dữ liệu.");
        }
        await sleep(loopIntervalMs);
        continue;
      }
      const handledRestaurantRestore = await processNextRestaurantRestore();
      if (handledRestaurantRestore) {
        await sleep(loopIntervalMs);
        continue;
      }
      const policy = await ensurePolicy();
      await touchWorker("OK", "Dịch vụ sao lưu đang sẵn sàng.");
      await queueAutomaticBackupIfNeeded(policy, false);
      await queueAutomaticRestaurantBackupsIfNeeded(policy);
      await processNextBackup();
      await processNextRestaurantBackup();
      await processNextCleanup();
      await processSubscriptionLifecycle();
      await cleanupOldTaskHistory();
      await touchWorker("OK", "Dịch vụ sao lưu đang sẵn sàng.");
    } catch (error) {
      await touchWorker("ERROR", safeError(error));
    }
    await sleep(loopIntervalMs);
  }
}

async function queueAutomaticRestaurantBackupsIfNeeded(policy: Awaited<ReturnType<typeof ensurePolicy>>) {
  if (!policy.backupEnabled || !isPastBackupTime(policy.backupTime)) return;
  const backupDate = vietnamDateKey(new Date());
  const restaurants = await prisma.restaurant.findMany({
    where: { status: { not: "DELETED" } },
    select: { id: true, name: true }
  });
  for (const restaurant of restaurants) {
    await prisma.restaurantBackupRun.upsert({
      where: {
        restaurantId_triggerType_backupDate: {
          restaurantId: restaurant.id,
          triggerType: "AUTOMATIC",
          backupDate
        }
      },
      create: {
        restaurantId: restaurant.id,
        restaurantNameSnapshot: restaurant.name,
        triggerType: "AUTOMATIC",
        backupDate
      },
      update: {}
    });
  }
}

async function processNextRestaurantBackup() {
  const run = await prisma.$transaction(async (tx) => {
    const queued = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "RestaurantBackupRun"
      WHERE status = 'QUEUED'
      ORDER BY "queuedAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (!queued[0]) return null;
    return tx.restaurantBackupRun.update({
      where: { id: queued[0].id },
      data: { status: "RUNNING", startedAt: new Date() },
      select: { id: true }
    });
  });
  if (!run) return false;
  await createRestaurantBackup(prisma, run.id).catch(() => undefined);
  return true;
}

async function processNextRestaurantRestore() {
  const run = await prisma.$transaction(async (tx) => {
    const queued = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "RestaurantRestoreRun"
      WHERE status = 'QUEUED'
      ORDER BY "queuedAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (!queued[0]) return null;
    return tx.restaurantRestoreRun.update({
      where: { id: queued[0].id },
      data: { status: "VERIFYING", startedAt: new Date(), publicMessage: "Đang kiểm tra bản sao lưu." },
      select: { id: true }
    });
  });
  if (!run) return false;
  await restoreRestaurantBackup(prisma, run.id).catch(() => undefined);
  return true;
}

async function recoverInterruptedRestaurantJobs() {
  await prisma.restaurantBackupRun.updateMany({
    where: { status: "RUNNING" },
    data: { status: "FAILED", completedAt: new Date(), errorMessage: "Dịch vụ sao lưu đã khởi động lại trước khi hoàn tất." }
  });
  const interruptedRestores = await prisma.restaurantRestoreRun.findMany({
    where: { status: { in: ["VERIFYING", "PREPARING", "RESTORING"] } },
    select: { id: true, restaurantId: true }
  });
  for (const run of interruptedRestores) {
    await disableRestaurantMaintenance(run.restaurantId, run.id).catch(() => undefined);
    await prisma.restaurantRestoreRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        publicMessage: "Khôi phục bị gián đoạn và đã dừng an toàn.",
        errorMessage: "Dịch vụ khôi phục đã khởi động lại. Dữ liệu database chưa hoàn tất sẽ tự rollback."
      }
    });
  }
}

async function touchWorker(status: string, message: string) {
  await prisma.platformWorkerHeartbeat.upsert({
    where: { singletonKey: workerKey },
    create: {
      singletonKey: workerKey,
      serviceName: "Sao lưu nền",
      status,
      message,
      lastSeenAt: new Date()
    },
    update: {
      status,
      message,
      lastSeenAt: new Date()
    }
  });
}

async function queueManualBackupIfNeeded(policy: Awaited<ReturnType<typeof ensurePolicy>>) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('platform_backup_queue'))`;
    const existing = await tx.platformBackupRun.findFirst({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true }
    });
    if (existing) return;

    await tx.platformBackupRun.create({
      data: {
        status: "QUEUED",
        triggerType: "MANUAL",
        storageKind: policy.backupStorageKind,
        locationLabel: storageKindLabel(policy.backupStorageKind)
      }
    });
  });
}

async function queueAutomaticBackupIfNeeded(policy: Awaited<ReturnType<typeof ensurePolicy>>, force: boolean) {
  if (!policy.backupEnabled) return;
  if (!force && !isPastBackupTime(policy.backupTime)) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('platform_backup_queue'))`;
    const todayStart = startOfVietnamDay(new Date());
    const existing = await tx.platformBackupRun.findFirst({
      where: {
        triggerType: "AUTOMATIC",
        createdAt: { gte: todayStart }
      },
      select: { id: true }
    });
    if (existing && !force) return;

    const activeRun = await tx.platformBackupRun.findFirst({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true }
    });
    if (activeRun) return;

    await tx.platformBackupRun.create({
      data: {
        status: "QUEUED",
        triggerType: "AUTOMATIC",
        storageKind: policy.backupStorageKind,
        locationLabel: storageKindLabel(policy.backupStorageKind)
      }
    });
  });
}

async function processNextBackup() {
  const startedAt = new Date();
  const run = await prisma.$transaction(async (tx) => {
    const queued = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "PlatformBackupRun"
      WHERE status = 'QUEUED'
      ORDER BY "queuedAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (!queued[0]) return null;
    return tx.platformBackupRun.update({
      where: { id: queued[0].id },
      data: { status: "RUNNING", startedAt }
    });
  });
  if (!run) return;

  try {
    await verifyPostgresBackupCompatibility();

    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const runDirName = `${stamp}-${run.id}`;
    const runDir = path.join(backupRoot, runDirName);
    await mkdir(runDir, { recursive: true });

    const databaseDumpName = `${runDirName}/database.dump`;
    const uploadsArchiveName = `${runDirName}/uploads.tar.gz`;
    const databaseDumpPath = path.join(backupRoot, databaseDumpName);
    const uploadsArchivePath = path.join(backupRoot, uploadsArchiveName);
    const manifestPath = path.join(runDir, "manifest.json");

    await prisma.platformBackupRun.update({
      where: { id: run.id },
      data: {
        databaseDumpName,
        uploadsArchiveName
      }
    });

    await dumpDatabase(databaseDumpPath);
    await archiveUploads(uploadsArchivePath);

    const databaseInfo = await stat(databaseDumpPath);
    if (!databaseInfo.isFile() || databaseInfo.size <= 0) {
      throw new Error("BACKUP_DATABASE_FILE_EMPTY");
    }

    const uploadsInfo = await stat(uploadsArchivePath);
    const manifest = {
      backupId: run.id,
      createdAt: new Date().toISOString(),
      files: {
        database: databaseDumpName,
        uploads: uploadsArchiveName
      }
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const checksum = await checksumFiles([databaseDumpPath, uploadsArchivePath, manifestPath]);
    const sizeBytes = databaseInfo.size + uploadsInfo.size + (await stat(manifestPath)).size;

    await prisma.platformBackupRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        locationLabel: storageKindLabel(run.storageKind),
        databaseDumpName,
        uploadsArchiveName,
        sizeBytes,
        checksum,
        verifiedAt: new Date(),
        completedAt: new Date(),
        errorMessage: null
      }
    });

    await expireOldSuccessfulBackups();
  } catch (error) {
    await prisma.platformBackupRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: backupFailureMessage(error)
      }
    });
  }
}

async function verifyPostgresBackupCompatibility() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

  const [{ stdout: dumpVersion }, { stdout: serverVersion }] = await Promise.all([
    execFileAsync("pg_dump", ["--version"], { maxBuffer: 1024 * 1024 }),
    execFileAsync("psql", ["-Atqc", "show server_version_num"], {
      env: {
        ...process.env,
        ...postgresEnv(databaseUrl)
      },
      maxBuffer: 1024 * 1024
    })
  ]);

  const clientMajor = Number(dumpVersion.match(/(\d+)(?:\.\d+)?/)?.[1]);
  const serverMajor = Math.floor(Number(serverVersion.trim()) / 10000);
  if (!Number.isFinite(clientMajor) || !Number.isFinite(serverMajor) || clientMajor !== serverMajor) {
    throw new Error(`PG_DUMP_MAJOR_MISMATCH server=${serverMajor || "unknown"} client=${clientMajor || "unknown"}`);
  }
}

async function dumpDatabase(outputPath: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");

  await execFileAsync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", outputPath], {
    env: {
      ...process.env,
      ...postgresEnv(databaseUrl)
    },
    maxBuffer: 1024 * 1024
  });
}

async function archiveUploads(outputPath: string) {
  await mkdir(uploadRoot, { recursive: true });

  await execFileAsync("tar", ["-czf", outputPath, "-C", path.dirname(uploadRoot), path.basename(uploadRoot)], {
    maxBuffer: 1024 * 1024
  });
}

async function expireOldSuccessfulBackups() {
  const policy = await ensurePolicy();
  const [oldAutomaticBackups, oldManualBackups] = await Promise.all([
    prisma.platformBackupRun.findMany({
      where: { status: "SUCCESS", triggerType: "AUTOMATIC" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      skip: policy.backupRetentionCount
    }),
    prisma.platformBackupRun.findMany({
      where: { status: "SUCCESS", triggerType: "MANUAL" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      skip: manualBackupRetentionCount
    })
  ]);
  const oldBackups = [...oldAutomaticBackups, ...oldManualBackups];

  for (const backup of oldBackups) {
    await removeBackupFiles(backup.databaseDumpName, backup.uploadsArchiveName);
    await prisma.platformBackupRun.update({
      where: { id: backup.id },
      data: { status: "EXPIRED" }
    });
  }
}

async function removeBackupFiles(databaseDumpName: string | null, uploadsArchiveName: string | null) {
  const candidates = [databaseDumpName, uploadsArchiveName].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const filePath = path.resolve(backupRoot, candidate);
    if (!filePath.startsWith(backupRoot)) continue;
    await rm(filePath, { force: true });
  }
  const first = candidates[0];
  if (first) {
    const runDir = path.resolve(backupRoot, path.dirname(first));
    if (runDir.startsWith(backupRoot) && runDir !== backupRoot) {
      await rm(runDir, { recursive: true, force: true });
    }
  }
}

async function queueCleanup() {
  const existing = await prisma.platformMaintenanceRun.findFirst({
    where: {
      taskType: "CLEANUP_TEMPORARY_DATA",
      status: { in: ["QUEUED", "RUNNING"] }
    }
  });
  if (existing) return;

  await prisma.platformMaintenanceRun.create({
    data: {
      taskType: "CLEANUP_TEMPORARY_DATA",
      status: "QUEUED"
    }
  });
}

async function processNextCleanup() {
  const run = await prisma.platformMaintenanceRun.findFirst({
    where: { status: "QUEUED" },
    orderBy: { queuedAt: "asc" }
  });
  if (!run) return;

  await prisma.platformMaintenanceRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", startedAt: new Date() }
  });

  try {
    const policy = await ensurePolicy();
    const now = new Date();
    const notificationCutoff = daysAgo(policy.notificationRetentionDays);
    const temporaryCutoff = daysAgo(policy.temporaryDataRetentionDays);

    const deletedNotifications = await prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: notificationCutoff }
      }
    });

    const deletedDeviceSessions = await prisma.staffDeviceSession.deleteMany({
      where: {
        isActive: false,
        onShift: false,
        updatedAt: { lt: temporaryCutoff }
      }
    });

    await prisma.$transaction([
      prisma.platformMaintenanceRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          deletedNotifications: deletedNotifications.count,
          deletedDeviceSessions: deletedDeviceSessions.count,
          completedAt: now,
          errorMessage: null
        }
      }),
      prisma.platformDataPolicy.update({
        where: { id: policy.id },
        data: {
          lastCleanupAt: now,
          nextCleanupAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          lastTaskStatus: "SUCCESS"
        }
      })
    ]);
  } catch (error) {
    const policy = await ensurePolicy();
    await prisma.$transaction([
      prisma.platformMaintenanceRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: safeError(error)
        }
      }),
      prisma.platformDataPolicy.update({
        where: { id: policy.id },
        data: { lastTaskStatus: "FAILED" }
      })
    ]);
  }
}

async function cleanupOldTaskHistory() {
  const cutoff = daysAgo(taskHistoryRetentionDays);
  const failedBackups = await prisma.platformBackupRun.findMany({
    where: {
      status: "FAILED",
      completedAt: { lt: cutoff }
    },
    select: {
      databaseDumpName: true,
      uploadsArchiveName: true
    }
  });

  for (const backup of failedBackups) {
    await removeBackupFiles(backup.databaseDumpName, backup.uploadsArchiveName);
  }

  await prisma.$transaction([
    prisma.platformBackupRun.deleteMany({
      where: {
        status: "FAILED",
        completedAt: { lt: cutoff }
      }
    }),
    prisma.platformMaintenanceRun.deleteMany({
      where: {
        status: { in: ["SUCCESS", "FAILED"] },
        completedAt: { lt: cutoff }
      }
    })
  ]);
}

async function processSubscriptionLifecycle() {
  const now = new Date();
  await expireStaleSubscriptionRequests(now);
  const subscriptionPolicy = await prisma.platformSubscriptionPolicy.upsert({
    where: { singletonKey: "default" },
    create: { singletonKey: "default" },
    update: {}
  });
  const restaurants = await prisma.restaurant.findMany({
    where: {
      status: { not: "DELETED" },
      subscriptionEnd: { not: null }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      planEntitlement: true,
      subscriptionEnd: true,
      subscriptionStatus: true
    }
  });

  for (const restaurant of restaurants) {
    if (!restaurant.subscriptionEnd) continue;
    const remainingDays = Math.ceil((restaurant.subscriptionEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const trainMilestones = [10, 7, 3, 1];
    const standardMilestones = [14, 7, 3, 1];
    const alertMilestone = (restaurant.plan === "TRAIN" ? trainMilestones : standardMilestones).includes(remainingDays) ? remainingDays : remainingDays <= 0 ? 0 : null;

    if (remainingDays < -subscriptionPolicy.gracePeriodDays && restaurant.subscriptionStatus !== "EXPIRED") {
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { subscriptionStatus: "EXPIRED" }
      });
    }

    if (alertMilestone === null) continue;
    const action = alertMilestone === 0 ? "SUBSCRIPTION_EXPIRED_ALERT" : `SUBSCRIPTION_EXPIRING_${alertMilestone}_DAYS`;
    const existing = await prisma.restaurantSubscriptionEvent.findFirst({
      where: {
        restaurantId: restaurant.id,
        action,
        endAt: restaurant.subscriptionEnd
      },
      select: { id: true }
    });
    if (existing) continue;

    await prisma.restaurantSubscriptionEvent.create({
      data: {
        restaurantId: restaurant.id,
        action,
        plan: restaurant.plan,
        endAt: restaurant.subscriptionEnd,
        metadataJson: {
          remainingDays: alertMilestone,
          planEntitlement: restaurant.planEntitlement
        }
      }
    });
    if (restaurant.plan === "TRAIN") {
      await createTrainExpiryNotifications({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        entitlement: restaurant.planEntitlement,
        endAt: restaurant.subscriptionEnd,
        remainingDays: alertMilestone
      });
    }
  }
}

async function createTrainExpiryNotifications({
  restaurantId,
  restaurantName,
  restaurantSlug,
  entitlement,
  endAt,
  remainingDays
}: {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  entitlement: string;
  endAt: Date;
  remainingDays: number;
}) {
  const owners = await prisma.restaurantUser.findMany({
    where: {
      restaurantId,
      role: "OWNER",
      isActive: true,
      user: { isActive: true }
    },
    select: { userId: true }
  });
  if (!owners.length) return;

  const endLabel = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(endAt);
  const title = remainingDays <= 0 ? "Gói TRAIN đã hết hạn" : `Gói TRAIN còn ${remainingDays} ngày`;
  const message = remainingDays <= 0
    ? `Gói TRAIN · Quyền ${entitlement} của ${restaurantName} đã hết hạn ngày ${endLabel}. Vào trang gói dịch vụ để đăng ký gói trả phí.`
    : `Gói TRAIN · Quyền ${entitlement} của ${restaurantName} sẽ hết hạn ngày ${endLabel}. Vào trang gói dịch vụ để xem chi tiết.`;

  await prisma.notification.createMany({
    data: owners.map((owner) => ({
      restaurantId,
      recipientUserId: owner.userId,
      type: "SUBSCRIPTION_EXPIRING",
      title,
      message,
      tableId: null
    })),
    skipDuplicates: false
  });

  await prisma.auditLog.create({
    data: {
      restaurantId,
      action: remainingDays <= 0 ? "TRAIN_EXPIRED_NOTIFICATION_SENT" : `TRAIN_EXPIRING_${remainingDays}_DAYS_NOTIFICATION_SENT`,
      entityType: "Restaurant",
      entityId: restaurantId,
      metadataJson: {
        slug: restaurantSlug,
        plan: "TRAIN",
        planEntitlement: entitlement,
        subscriptionEnd: endAt.toISOString(),
        remainingDays
      }
    }
  });
}

function postgresEnv(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.replace(/^\//, ""),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password)
  };
}

function storageKindLabel(value: string) {
  return value === "S3_COMPATIBLE" ? "Kho lưu trữ ngoài máy chủ" : "Máy chủ hiện tại";
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function startOfVietnamDay(value: Date) {
  const vietnamNow = new Date(value.getTime() + vietnamUtcOffsetHours * 60 * 60 * 1000);
  const vietnamDay = new Date(Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate(), 0, 0, 0, 0));
  return new Date(vietnamDay.getTime() - vietnamUtcOffsetHours * 60 * 60 * 1000);
}

function vietnamDateKey(value: Date) {
  const vietnamNow = new Date(value.getTime() + vietnamUtcOffsetHours * 60 * 60 * 1000);
  return [
    vietnamNow.getUTCFullYear(),
    String(vietnamNow.getUTCMonth() + 1).padStart(2, "0"),
    String(vietnamNow.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function isPastBackupTime(backupTime: string) {
  const [hourText, minuteText] = backupTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const now = new Date();
  const vietnamNow = new Date(now.getTime() + vietnamUtcOffsetHours * 60 * 60 * 1000);
  const scheduled = new Date(Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate(), hour, minute, 0, 0));
  return vietnamNow.getTime() >= scheduled.getTime();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checksumFiles(files: string[]) {
  const hash = createHash("sha256");
  for (const file of files) {
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(file);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", resolve);
    });
  }
  return hash.digest("hex");
}

function safeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
      .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1[redacted]@")
      .replace(/(password=)[^\s]+/gi, "$1[redacted]")
      .slice(0, 500);
  }
  return "Tác vụ chưa thành công.";
}

function backupFailureMessage(error: unknown) {
  const message = safeError(error);
  if (message.includes("PG_DUMP_MAJOR_MISMATCH")) {
    return "PG_DUMP_MAJOR_MISMATCH";
  }
  if (message.includes("server version mismatch") || message.includes("pg_dump version")) {
    return "PG_DUMP_MAJOR_MISMATCH";
  }
  if (message.includes("DATABASE_URL_MISSING")) {
    return "DATABASE_URL_MISSING";
  }
  if (message.includes("BACKUP_DATABASE_FILE_EMPTY")) {
    return "BACKUP_DATABASE_FILE_EMPTY";
  }
  if (message.includes("ENOENT")) {
    return "BACKUP_TOOL_NOT_AVAILABLE";
  }
  return "BACKUP_FAILED";
}

main()
  .catch(async (error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
