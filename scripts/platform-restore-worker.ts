import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrismaClient } from "@prisma/client";
import { disableMaintenanceMode, enableMaintenanceMode, getMaintenanceState, getPlatformRuntimeRoot } from "@/lib/maintenance-mode";
import {
  isActiveRestoreStatus,
  listRestoreJobs,
  updateRestoreJob,
  type RestoreJob
} from "@/server/services/platform-restore-runtime";

const execFileAsync = promisify(execFile);
const backupRoot = path.resolve(process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups"));
const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
const restoreRoot = path.join(getPlatformRuntimeRoot(), "restore-work");
const restoreLock = path.join(getPlatformRuntimeRoot(), "restore-worker.lock");
const requiredTables = ["User", "Restaurant", "RestaurantUser", "Order", "OrderItem", "Payment", "PlatformDataPolicy"];

export async function markInterruptedRestoreJobs() {
  const jobs = await listRestoreJobs();
  const maintenance = await getMaintenanceState();
  for (const job of jobs) {
    if ((job.status !== "QUEUED" && isActiveRestoreStatus(job.status)) || maintenance?.restoreJobId === job.id) {
      await updateRestoreJob(job.id, {
        status: "NEEDS_INTERVENTION",
        completedAt: new Date().toISOString(),
        publicMessage: "Quá trình khôi phục bị gián đoạn. Hệ thống vẫn được giữ ở trạng thái an toàn và cần kiểm tra thủ công."
      });
    }
  }
  await rm(restoreLock, { recursive: true, force: true });
}

export async function processNextRestoreJob(prisma: PrismaClient) {
  const job = (await listRestoreJobs()).reverse().find((candidate) => candidate.status === "QUEUED");
  if (!job) return false;

  await mkdir(getPlatformRuntimeRoot(), { recursive: true });
  try {
    await mkdir(restoreLock);
  } catch {
    return true;
  }

  try {
    await runRestoreJob(prisma, job);
  } finally {
    await rm(restoreLock, { recursive: true, force: true });
  }
  return true;
}

export async function verifyRestoreCandidate(prisma: PrismaClient, backupId: string) {
  const backup = await prisma.platformBackupRun.findUnique({ where: { id: backupId } });
  if (!backup || backup.status !== "SUCCESS") throw new Error("RESTORE_BACKUP_NOT_AVAILABLE");
  const files = await verifyBackupFiles(backup);
  await ensureEnoughDisk(files.totalBytes * 2);

  const database = parseDatabaseUrl();
  const token = backupId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || Date.now().toString();
  const stagingDatabaseName = `restore_verify_${token}`;
  const stagingUrl = databaseUrlFor(database.url, stagingDatabaseName);
  const stagingFilesRoot = path.join(restoreRoot, `verify-${token}`);
  await rm(stagingFilesRoot, { recursive: true, force: true });
  await mkdir(stagingFilesRoot, { recursive: true });

  try {
    await dropDatabase(database.adminUrl, stagingDatabaseName);
    await createDatabase(database.adminUrl, stagingDatabaseName);
    await restoreDump(files.databasePath, stagingUrl);
    await validateDatabase(stagingUrl);
    await extractUploads(files.uploadsPath, stagingFilesRoot);
    await validateUploads(path.join(stagingFilesRoot, "uploads"));
  } finally {
    await dropDatabase(database.adminUrl, stagingDatabaseName).catch(() => undefined);
    await rm(stagingFilesRoot, { recursive: true, force: true });
  }
}

async function runRestoreJob(prisma: PrismaClient, job: RestoreJob) {
  let maintenanceEnabled = false;
  let databaseSwitched = false;
  let uploadsChanged = false;
  let rollbackDatabaseName: string | null = null;
  const jobRoot = path.join(restoreRoot, job.id);
  const stagingFilesRoot = path.join(jobRoot, "staging-files");
  const preRestoreRoot = path.join(getPlatformRuntimeRoot(), "pre-restore", job.id);

  try {
    await updateRestoreJob(job.id, { status: "VERIFYING", publicMessage: "Đang kiểm tra bản sao lưu." });
    const backup = await prisma.platformBackupRun.findUnique({ where: { id: job.backupId } });
    if (!backup || backup.status !== "SUCCESS") throw new Error("RESTORE_BACKUP_NOT_AVAILABLE");

    const files = await verifyBackupFiles(backup);
    await ensureEnoughDisk(files.totalBytes * 4);
    await rm(jobRoot, { recursive: true, force: true });
    await mkdir(stagingFilesRoot, { recursive: true });

    const database = parseDatabaseUrl();
    const stagingDatabaseName = databaseName("restore_stage", job.id);
    rollbackDatabaseName = databaseName("restore_rollback", job.id);
    const stagingUrl = databaseUrlFor(database.url, stagingDatabaseName);

    await dropDatabase(database.adminUrl, stagingDatabaseName);
    await createDatabase(database.adminUrl, stagingDatabaseName);
    try {
      await restoreDump(files.databasePath, stagingUrl);
      await validateDatabase(stagingUrl);
      await extractUploads(files.uploadsPath, stagingFilesRoot);
      await validateUploads(path.join(stagingFilesRoot, "uploads"));
    } catch (error) {
      await dropDatabase(database.adminUrl, stagingDatabaseName);
      throw error;
    }

    await updateRestoreJob(job.id, { status: "PREPARING", publicMessage: "Đang tạo điểm an toàn trước khi khôi phục." });
    await enableMaintenanceMode(job.id);
    maintenanceEnabled = true;
    await sleep(3000);
    await createPreRestoreSnapshot(job.id, preRestoreRoot);

    await updateRestoreJob(job.id, { status: "RESTORING", publicMessage: "Đang khôi phục dữ liệu hệ thống." });
    await prisma.$disconnect();
    await switchDatabase(database.adminUrl, database.name, stagingDatabaseName, rollbackDatabaseName);
    databaseSwitched = true;

    uploadsChanged = true;
    await replaceUploads(path.join(stagingFilesRoot, "uploads"));
    await execFileAsync("pnpm", ["prisma", "migrate", "deploy"], {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024
    });

    await updateRestoreJob(job.id, { status: "VALIDATING", publicMessage: "Đang kiểm tra dữ liệu sau khôi phục." });
    await validateDatabase(database.url);
    await validateUploads(uploadRoot);
    await updateRestoreJob(job.id, {
      status: "SUCCESS",
      completedAt: new Date().toISOString(),
      rollbackCompleted: false,
      publicMessage: "Đã khôi phục dữ liệu thành công."
    });
    await writeRestoreAudit(prisma, job, "PLATFORM_RESTORE_COMPLETED");
    await disableMaintenanceMode(job.id);
    maintenanceEnabled = false;
    await dropDatabase(database.adminUrl, rollbackDatabaseName).catch(() => undefined);
    rollbackDatabaseName = null;
  } catch (error) {
    const rollback = await rollbackRestore({
      job,
      databaseSwitched,
      uploadsChanged,
      rollbackDatabaseName,
      preRestoreRoot
    });

    if (maintenanceEnabled && rollback.completed) {
      await disableMaintenanceMode(job.id).catch(() => undefined);
      maintenanceEnabled = false;
    }

    await updateRestoreJob(job.id, {
      status: rollback.completed ? "FAILED" : "NEEDS_INTERVENTION",
      completedAt: new Date().toISOString(),
      rollbackCompleted: rollback.completed,
      publicMessage: rollback.completed
        ? "Khôi phục chưa thành công. Dữ liệu trước thao tác đã được phục hồi."
        : "Khôi phục bị gián đoạn. Hệ thống đang được giữ an toàn và cần kiểm tra thủ công."
    });
    await writeRestoreAudit(prisma, job, rollback.completed ? "PLATFORM_RESTORE_ROLLED_BACK" : "PLATFORM_RESTORE_NEEDS_INTERVENTION").catch(
      () => undefined
    );
    if (!rollback.completed) throw error;
  } finally {
    await rm(jobRoot, { recursive: true, force: true });
  }
}

async function verifyBackupFiles(backup: {
  id: string;
  databaseDumpName: string | null;
  uploadsArchiveName: string | null;
  checksum: string | null;
  verifiedAt: Date | null;
}) {
  if (!backup.verifiedAt || !backup.checksum || !backup.databaseDumpName || !backup.uploadsArchiveName) {
    throw new Error("RESTORE_BACKUP_INCOMPLETE");
  }
  const databasePath = safeBackupPath(backup.databaseDumpName);
  const uploadsPath = safeBackupPath(backup.uploadsArchiveName);
  const manifestPath = safeBackupPath(path.join(path.dirname(backup.databaseDumpName), "manifest.json"));
  if (!databasePath || !uploadsPath || !manifestPath) throw new Error("RESTORE_BACKUP_PATH_INVALID");

  const [databaseInfo, uploadsInfo, manifestInfo] = await Promise.all([stat(databasePath), stat(uploadsPath), stat(manifestPath)]);
  if (databaseInfo.size <= 0 || uploadsInfo.size <= 0 || manifestInfo.size <= 0) throw new Error("RESTORE_BACKUP_FILE_EMPTY");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    backupId?: string;
    files?: { database?: string; uploads?: string };
  };
  if (
    manifest.backupId !== backup.id ||
    manifest.files?.database !== backup.databaseDumpName ||
    manifest.files?.uploads !== backup.uploadsArchiveName
  ) {
    throw new Error("RESTORE_MANIFEST_INVALID");
  }
  if ((await checksumFiles([databasePath, uploadsPath, manifestPath])) !== backup.checksum) {
    throw new Error("RESTORE_CHECKSUM_INVALID");
  }

  await execFileAsync("pg_restore", ["--list", databasePath], { maxBuffer: 10 * 1024 * 1024 });
  await execFileAsync("tar", ["-tzf", uploadsPath], { maxBuffer: 10 * 1024 * 1024 });
  return { databasePath, uploadsPath, totalBytes: databaseInfo.size + uploadsInfo.size + manifestInfo.size };
}

async function createPreRestoreSnapshot(jobId: string, destination: string) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const databasePath = path.join(destination, "database.dump");
  const uploadsPath = path.join(destination, "uploads.tar.gz");
  const manifestPath = path.join(destination, "manifest.json");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_MISSING");
  await execFileAsync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--dbname=${databaseUrl}`, "--file", databasePath], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  await execFileAsync("tar", ["-czf", uploadsPath, "-C", path.dirname(uploadRoot), path.basename(uploadRoot)], {
    maxBuffer: 10 * 1024 * 1024
  });
  await writeFile(
    manifestPath,
    JSON.stringify({ restoreJobId: jobId, createdAt: new Date().toISOString(), protectedFromRetention: true }, null, 2),
    "utf8"
  );
  await writeFile(path.join(destination, "checksum.sha256"), await checksumFiles([databasePath, uploadsPath, manifestPath]), "utf8");
  const [databaseInfo, uploadsInfo] = await Promise.all([stat(databasePath), stat(uploadsPath)]);
  if (databaseInfo.size <= 0 || uploadsInfo.size <= 0) throw new Error("PRE_RESTORE_BACKUP_INVALID");
  await execFileAsync("pg_restore", ["--list", databasePath], { maxBuffer: 10 * 1024 * 1024 });
  await execFileAsync("tar", ["-tzf", uploadsPath], { maxBuffer: 10 * 1024 * 1024 });
}

async function rollbackRestore(input: {
  job: RestoreJob;
  databaseSwitched: boolean;
  uploadsChanged: boolean;
  rollbackDatabaseName: string | null;
  preRestoreRoot: string;
}) {
  let completed = true;
  const database = parseDatabaseUrl();
  if (input.databaseSwitched && input.rollbackDatabaseName) {
    try {
      const failedName = databaseName("restore_failed", input.job.id);
      await switchDatabase(database.adminUrl, database.name, input.rollbackDatabaseName, failedName);
      await dropDatabase(database.adminUrl, failedName);
    } catch {
      completed = false;
    }
  }
  if (input.uploadsChanged) {
    try {
      const restoreUploadsRoot = path.join(input.preRestoreRoot, "rollback-uploads");
      await rm(restoreUploadsRoot, { recursive: true, force: true });
      await mkdir(restoreUploadsRoot, { recursive: true });
      await extractUploads(path.join(input.preRestoreRoot, "uploads.tar.gz"), restoreUploadsRoot);
      await replaceUploads(path.join(restoreUploadsRoot, "uploads"));
    } catch {
      completed = false;
    }
  }
  return { completed };
}

async function switchDatabase(adminUrl: string, currentName: string, replacementName: string, previousName: string) {
  await dropDatabase(adminUrl, previousName);
  await runSql(adminUrl, `ALTER DATABASE ${quoteIdentifier(currentName)} WITH ALLOW_CONNECTIONS false`);
  await terminateDatabaseConnections(adminUrl, currentName);
  await terminateDatabaseConnections(adminUrl, replacementName);
  await runSql(adminUrl, `ALTER DATABASE ${quoteIdentifier(currentName)} RENAME TO ${quoteIdentifier(previousName)}`);
  try {
    await runSql(adminUrl, `ALTER DATABASE ${quoteIdentifier(replacementName)} WITH ALLOW_CONNECTIONS true`);
    await runSql(adminUrl, `ALTER DATABASE ${quoteIdentifier(replacementName)} RENAME TO ${quoteIdentifier(currentName)}`);
  } catch (error) {
    await runSql(adminUrl, `ALTER DATABASE ${quoteIdentifier(previousName)} WITH ALLOW_CONNECTIONS true`).catch(() => undefined);
    await runSql(adminUrl, `ALTER DATABASE ${quoteIdentifier(previousName)} RENAME TO ${quoteIdentifier(currentName)}`).catch(() => undefined);
    throw error;
  }
}

async function restoreDump(databasePath: string, databaseUrl: string) {
  await execFileAsync(
    "pg_restore",
    ["--exit-on-error", "--no-owner", "--no-privileges", `--dbname=${databaseUrl}`, databasePath],
    { maxBuffer: 20 * 1024 * 1024 }
  );
}

async function validateDatabase(databaseUrl: string) {
  const names = requiredTables.map(sqlLiteral).join(",");
  const query = `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${names})`;
  const { stdout } = await execFileAsync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-Atqc", query], {
    maxBuffer: 1024 * 1024
  });
  if (Number(stdout.trim()) !== requiredTables.length) throw new Error("RESTORE_DATABASE_VALIDATION_FAILED");
  await execFileAsync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-Atqc", 'SELECT count(*) FROM "Restaurant"'], {
    maxBuffer: 1024 * 1024
  });
}

async function extractUploads(archivePath: string, destination: string) {
  await execFileAsync("tar", ["-xzf", archivePath, "-C", destination], { maxBuffer: 10 * 1024 * 1024 });
}

async function validateUploads(directory: string) {
  const info = await stat(directory);
  if (!info.isDirectory()) throw new Error("RESTORE_UPLOADS_VALIDATION_FAILED");
}

async function replaceUploads(source: string) {
  await mkdir(uploadRoot, { recursive: true });
  for (const name of await readdir(uploadRoot)) {
    await rm(path.join(uploadRoot, name), { recursive: true, force: true });
  }
  for (const name of await readdir(source)) {
    await cp(path.join(source, name), path.join(uploadRoot, name), { recursive: true, force: true });
  }
}

async function ensureEnoughDisk(requiredBytes: number) {
  const { stdout } = await execFileAsync("df", ["-Pk", backupRoot], { maxBuffer: 1024 * 1024 });
  const line = stdout.trim().split(/\r?\n/).at(-1);
  const availableKb = Number(line?.trim().split(/\s+/)[3]);
  if (!Number.isFinite(availableKb) || availableKb * 1024 < Math.max(requiredBytes, 256 * 1024 * 1024)) {
    throw new Error("RESTORE_DISK_SPACE_INSUFFICIENT");
  }
}

function parseDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL_MISSING");
  const url = new URL(value);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("DATABASE_NAME_INVALID");
  return { url: value, name, adminUrl: databaseUrlFor(value, "postgres") };
}

function databaseUrlFor(value: string, databaseName: string) {
  const url = new URL(value);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function databaseName(prefix: string, jobId: string) {
  return `${prefix}_${jobId.replace(/-/g, "").slice(0, 16)}`;
}

async function createDatabase(adminUrl: string, name: string) {
  await runSql(adminUrl, `CREATE DATABASE ${quoteIdentifier(name)}`);
}

async function dropDatabase(adminUrl: string, name: string) {
  await runSql(adminUrl, `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
}

async function terminateDatabaseConnections(adminUrl: string, name: string) {
  await runSql(adminUrl, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${sqlLiteral(name)} AND pid <> pg_backend_pid()`);
}

async function runSql(databaseUrl: string, sql: string) {
  await execFileAsync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], { maxBuffer: 10 * 1024 * 1024 });
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function safeBackupPath(relativePath: string) {
  if (path.isAbsolute(relativePath) || relativePath.includes("..")) return null;
  const resolved = path.resolve(backupRoot, relativePath);
  return resolved.startsWith(`${backupRoot}${path.sep}`) ? resolved : null;
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

async function writeRestoreAudit(prisma: PrismaClient, job: RestoreJob, action: string) {
  const actor = await prisma.user.findUnique({ where: { id: job.actorUserId }, select: { id: true } });
  await prisma.auditLog.create({
    data: {
      userId: actor?.id,
      action,
      entityType: "PlatformRestoreJob",
      entityId: job.id,
      metadataJson: { backupId: job.backupId, actorUserId: job.actorUserId }
    }
  });
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
