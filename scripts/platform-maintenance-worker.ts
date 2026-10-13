import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();
const backupRoot = path.resolve(process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups"));
const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
const policyKey = "default";
const workerKey = "backup-worker";
const vietnamUtcOffsetHours = 7;
const loopIntervalMs = Number(process.env.MAINTENANCE_WORKER_INTERVAL_MS ?? 30000);
const taskHistoryRetentionDays = 7;

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

  await touchWorker("OK", "Đang kiểm tra tác vụ nền.");
  await queueAutomaticBackupIfNeeded(policy, false);
  await processNextBackup();
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

  while (process.exitCode === undefined) {
    try {
      const policy = await ensurePolicy();
      await touchWorker("OK", "Dịch vụ sao lưu đang sẵn sàng.");
      await queueAutomaticBackupIfNeeded(policy, false);
      await processNextBackup();
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
  const existing = await prisma.platformBackupRun.findFirst({
    where: { status: "QUEUED" },
    orderBy: { queuedAt: "asc" }
  });
  if (existing) return;

  await prisma.platformBackupRun.create({
    data: {
      status: "QUEUED",
      triggerType: "MANUAL",
      storageKind: policy.backupStorageKind,
      locationLabel: storageKindLabel(policy.backupStorageKind)
    }
  });
}

async function queueAutomaticBackupIfNeeded(policy: Awaited<ReturnType<typeof ensurePolicy>>, force: boolean) {
  if (!policy.backupEnabled) return;
  if (!force && !isPastBackupTime(policy.backupTime)) return;

  const todayStart = startOfVietnamDay(new Date());
  const existing = await prisma.platformBackupRun.findFirst({
    where: {
      triggerType: "AUTOMATIC",
      createdAt: { gte: todayStart }
    }
  });

  if (existing && !force) return;

  await prisma.platformBackupRun.create({
    data: {
      status: "QUEUED",
      triggerType: "AUTOMATIC",
      storageKind: policy.backupStorageKind,
      locationLabel: storageKindLabel(policy.backupStorageKind)
    }
  });
}

async function processNextBackup() {
  const run = await prisma.platformBackupRun.findFirst({
    where: { status: "QUEUED" },
    orderBy: { queuedAt: "asc" }
  });
  if (!run) return;

  const startedAt = new Date();
  await prisma.platformBackupRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", startedAt }
  });

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
    const hasUploads = await archiveUploads(uploadsArchivePath);

    const databaseInfo = await stat(databaseDumpPath);
    if (!databaseInfo.isFile() || databaseInfo.size <= 0) {
      throw new Error("BACKUP_DATABASE_FILE_EMPTY");
    }

    const uploadsInfo = hasUploads ? await stat(uploadsArchivePath) : null;
    const manifest = {
      backupId: run.id,
      createdAt: new Date().toISOString(),
      files: {
        database: databaseDumpName,
        uploads: hasUploads ? uploadsArchiveName : null
      }
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const checksum = await checksumFiles([databaseDumpPath, ...(hasUploads ? [uploadsArchivePath] : []), manifestPath]);
    const sizeBytes = databaseInfo.size + (uploadsInfo?.size ?? 0) + (await stat(manifestPath)).size;

    await prisma.platformBackupRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        locationLabel: storageKindLabel(run.storageKind),
        databaseDumpName,
        uploadsArchiveName: hasUploads ? uploadsArchiveName : null,
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
  try {
    const info = await stat(uploadRoot);
    if (!info.isDirectory()) return false;
  } catch {
    return false;
  }

  await execFileAsync("tar", ["-czf", outputPath, "-C", path.dirname(uploadRoot), path.basename(uploadRoot)], {
    maxBuffer: 1024 * 1024
  });
  return true;
}

async function expireOldSuccessfulBackups() {
  const policy = await ensurePolicy();
  const oldBackups = await prisma.platformBackupRun.findMany({
    where: { status: "SUCCESS" },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    skip: policy.backupRetentionCount
  });

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
  const restaurants = await prisma.restaurant.findMany({
    where: {
      status: { not: "DELETED" },
      subscriptionEnd: { not: null }
    },
    select: {
      id: true,
      plan: true,
      subscriptionEnd: true,
      subscriptionStatus: true
    }
  });

  for (const restaurant of restaurants) {
    if (!restaurant.subscriptionEnd) continue;
    const remainingDays = Math.ceil((restaurant.subscriptionEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const alertMilestone = [14, 7, 3, 1].includes(remainingDays) ? remainingDays : remainingDays <= 0 ? 0 : null;

    if (remainingDays <= 0 && restaurant.subscriptionStatus !== "EXPIRED") {
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
          remainingDays: alertMilestone
        }
      }
    });
  }
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
  if (error instanceof Error) return error.message.slice(0, 500);
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
