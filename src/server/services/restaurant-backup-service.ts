import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { PrismaClient } from "@prisma/client";
import { disableRestaurantMaintenance, enableRestaurantMaintenance } from "@/lib/restaurant-maintenance";

const execFileAsync = promisify(execFile);
const backupRoot = path.resolve(process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups"));
const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
const snapshotVersion = 1;

const tenantTables = [
  "RestaurantUser",
  "RestaurantSetting",
  "Category",
  "Product",
  "ProductOptionGroup",
  "ProductOptionItem",
  "Area",
  "RestaurantTable",
  "DiningSession",
  "Order",
  "OrderItem",
  "Payment",
  "ServiceRequest",
  "Notification"
] as const;

const deleteOrder = [
  "Notification",
  "ServiceRequest",
  "Payment",
  "OrderItem",
  "Order",
  "DiningSession",
  "ProductOptionItem",
  "ProductOptionGroup",
  "Product",
  "Category",
  "RestaurantTable",
  "Area",
  "RestaurantSetting",
  "RestaurantUser"
] as const;

type TenantTable = (typeof tenantTables)[number];
type RestaurantSnapshot = {
  version: number;
  restaurant: { id: string; name: string; slug: string; logoUrl: string | null; businessType: "RESTAURANT" | "DRINK_SHOP" };
  createdAt: string;
  tables: Record<TenantTable, unknown[]>;
  uploadPaths: string[];
};

export async function createRestaurantBackup(prisma: PrismaClient, runId: string) {
  const run = await prisma.restaurantBackupRun.findUnique({
    where: { id: runId },
    include: { restaurant: { select: { id: true, name: true, slug: true, logoUrl: true, businessType: true } } }
  });
  if (!run) throw new Error("RESTAURANT_BACKUP_NOT_FOUND");

  const startedAt = new Date();
  await prisma.restaurantBackupRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt } });

  try {
    const snapshot = await prisma.$transaction(async (tx) => {
      const tables = {} as Record<TenantTable, unknown[]>;
      for (const table of tenantTables) {
        const rows = await tx.$queryRawUnsafe<Array<{ data: unknown }>>(
          `SELECT row_to_json(t) AS data FROM "${table}" t WHERE t."restaurantId" = $1 ORDER BY t."id"`,
          run.restaurantId
        );
        tables[table] = rows.map((row) => row.data);
      }

      const settings = tables.RestaurantSetting[0] as { logoUrl?: string | null; paymentQrImage?: string | null } | undefined;
      const products = tables.Product as Array<{ imageUrl?: string | null }>;
      return {
        version: snapshotVersion,
        restaurant: {
          id: run.restaurant.id,
          name: run.restaurant.name,
          slug: run.restaurant.slug,
          logoUrl: run.restaurant.logoUrl,
          businessType: run.restaurant.businessType
        },
        createdAt: startedAt.toISOString(),
        tables,
        uploadPaths: collectUploadPaths([
          run.restaurant.logoUrl,
          settings?.logoUrl,
          settings?.paymentQrImage,
          ...products.map((product) => product.imageUrl)
        ])
      } satisfies RestaurantSnapshot;
    }, { isolationLevel: "RepeatableRead", timeout: 120_000 });

    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const relativeDir = path.join("restaurants", run.restaurantId, `${stamp}-${run.id}`);
    const runDir = safeBackupPath(relativeDir);
    await mkdir(runDir, { recursive: true });
    const snapshotName = path.join(relativeDir, "snapshot.json").replaceAll("\\", "/");
    const uploadsArchiveName = path.join(relativeDir, "uploads.tar.gz").replaceAll("\\", "/");
    const snapshotPath = safeBackupPath(snapshotName);
    const uploadsPath = safeBackupPath(uploadsArchiveName);

    await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");
    await archiveTenantUploads(snapshot.uploadPaths, uploadsPath, run.id);

    const [snapshotInfo, uploadsInfo, snapshotHash, uploadsHash] = await Promise.all([
      stat(snapshotPath),
      stat(uploadsPath),
      hashFile(snapshotPath),
      hashFile(uploadsPath)
    ]);
    if (snapshotInfo.size <= 0 || uploadsInfo.size <= 0) throw new Error("RESTAURANT_BACKUP_EMPTY");

    const manifest = {
      version: snapshotVersion,
      backupId: run.id,
      restaurantId: run.restaurantId,
      restaurantName: run.restaurantNameSnapshot,
      createdAt: snapshot.createdAt,
      files: {
        snapshot: { name: snapshotName, sha256: snapshotHash },
        uploads: { name: uploadsArchiveName, sha256: uploadsHash }
      }
    };
    await writeFile(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    await prisma.restaurantBackupRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        snapshotName,
        uploadsArchiveName,
        sizeBytes: snapshotInfo.size + uploadsInfo.size,
        checksum: `${snapshotHash}:${uploadsHash}`,
        schemaVersion: snapshotVersion,
        verifiedAt: new Date(),
        completedAt: new Date(),
        errorMessage: null
      }
    });
    await expireRestaurantBackups(prisma, run.restaurantId);
  } catch (error) {
    await prisma.restaurantBackupRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date(), errorMessage: publicBackupError(error) }
    });
    throw error;
  }
}

export async function verifyRestaurantBackup(prisma: PrismaClient, backupId: string) {
  const backup = await prisma.restaurantBackupRun.findUnique({ where: { id: backupId } });
  if (!backup || backup.status !== "SUCCESS" || !backup.snapshotName || !backup.uploadsArchiveName || !backup.checksum) {
    throw new Error("RESTAURANT_BACKUP_NOT_READY");
  }
  const snapshotPath = safeBackupPath(backup.snapshotName);
  const uploadsPath = safeBackupPath(backup.uploadsArchiveName);
  const [snapshotHash, uploadsHash] = await Promise.all([hashFile(snapshotPath), hashFile(uploadsPath)]);
  if (`${snapshotHash}:${uploadsHash}` !== backup.checksum) throw new Error("RESTAURANT_BACKUP_CHECKSUM_MISMATCH");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as RestaurantSnapshot;
  if (snapshot.version !== snapshotVersion || snapshot.restaurant.id !== backup.restaurantId) {
    throw new Error("RESTAURANT_BACKUP_SCOPE_MISMATCH");
  }
  for (const table of tenantTables) {
    if (!Array.isArray(snapshot.tables[table])) throw new Error("RESTAURANT_BACKUP_INVALID");
  }
  await execFileAsync("tar", ["-tzf", uploadsPath], { maxBuffer: 10 * 1024 * 1024 });
  return { backup, snapshot, snapshotPath, uploadsPath };
}

export async function restoreRestaurantBackup(prisma: PrismaClient, restoreRunId: string) {
  const restoreRun = await prisma.restaurantRestoreRun.findUnique({
    where: { id: restoreRunId },
    include: { backupRun: true, restaurant: { select: { id: true, name: true } } }
  });
  if (!restoreRun) throw new Error("RESTAURANT_RESTORE_NOT_FOUND");

  await prisma.restaurantRestoreRun.update({
    where: { id: restoreRun.id },
    data: { status: "VERIFYING", startedAt: new Date(), publicMessage: "Đang kiểm tra bản sao lưu." }
  });

  let maintenanceEnabled = false;
  try {
    const verified = await verifyRestaurantBackup(prisma, restoreRun.backupRunId);
    const paidAfterBackup = await prisma.payment.count({
      where: {
        restaurantId: restoreRun.restaurantId,
        status: "PAID",
        paidAt: { gt: new Date(verified.snapshot.createdAt) }
      }
    });
    if (paidAfterBackup > 0) throw new Error("RESTAURANT_RESTORE_HAS_RECONCILED_PAYMENTS");

    await enableRestaurantMaintenance(restoreRun.restaurantId, restoreRun.id);
    maintenanceEnabled = true;
    await sleep(750);
    const paidAfterLock = await prisma.payment.count({
      where: {
        restaurantId: restoreRun.restaurantId,
        status: "PAID",
        paidAt: { gt: new Date(verified.snapshot.createdAt) }
      }
    });
    if (paidAfterLock > 0) throw new Error("RESTAURANT_RESTORE_HAS_RECONCILED_PAYMENTS");

    const preRestore = await prisma.restaurantBackupRun.create({
      data: {
        restaurantId: restoreRun.restaurantId,
        restaurantNameSnapshot: restoreRun.restaurant.name,
        status: "QUEUED",
        triggerType: "PRE_RESTORE"
      }
    });
    await createRestaurantBackup(prisma, preRestore.id);
    await prisma.restaurantRestoreRun.update({
      where: { id: restoreRun.id },
      data: { status: "PREPARING", rollbackReady: true, publicMessage: "Đã tạo điểm an toàn trước khôi phục." }
    });

    await prisma.restaurantRestoreRun.update({
      where: { id: restoreRun.id },
      data: { status: "RESTORING", publicMessage: "Đang khôi phục dữ liệu cửa hàng." }
    });

    await restoreTenantUploads(verified.uploadsPath, restoreRun.id);
    await replaceTenantRows(prisma, restoreRun.restaurantId, verified.snapshot);

    await disableRestaurantMaintenance(restoreRun.restaurantId, restoreRun.id);
    maintenanceEnabled = false;
    await prisma.restaurantRestoreRun.update({
      where: { id: restoreRun.id },
      data: {
        status: "SUCCESS",
        completedAt: new Date(),
        publicMessage: "Đã khôi phục dữ liệu cửa hàng thành công.",
        errorMessage: null
      }
    });
  } catch (error) {
    if (maintenanceEnabled) {
      await disableRestaurantMaintenance(restoreRun.restaurantId, restoreRun.id).catch(() => undefined);
    }
    await prisma.restaurantRestoreRun.update({
      where: { id: restoreRun.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        publicMessage: "Không thể khôi phục cửa hàng. Dữ liệu hiện tại được giữ nguyên.",
        errorMessage: publicRestoreError(error)
      }
    });
    throw error;
  }
}

async function replaceTenantRows(prisma: PrismaClient, restaurantId: string, snapshot: RestaurantSnapshot) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `restaurant-restore:${restaurantId}`);
    await tx.pushSubscription.deleteMany({ where: { restaurantId } });
    await tx.staffDeviceSession.deleteMany({ where: { restaurantId } });
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        name: snapshot.restaurant.name,
        logoUrl: snapshot.restaurant.logoUrl,
        businessType: snapshot.restaurant.businessType
      }
    });
    for (const table of deleteOrder) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "restaurantId" = $1`, restaurantId);
    }
    for (const table of tenantTables) {
      const rows = snapshot.tables[table];
      if (!rows.length) continue;
      await tx.$executeRawUnsafe(
        `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)`,
        JSON.stringify(rows)
      );
    }
    for (const table of tenantTables) {
      const result = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "${table}" WHERE "restaurantId" = $1`,
        restaurantId
      );
      if (Number(result[0]?.count ?? 0) !== snapshot.tables[table].length) {
        throw new Error("RESTAURANT_RESTORE_VALIDATION_FAILED");
      }
    }
  }, { isolationLevel: "Serializable", timeout: 180_000 });
}

async function archiveTenantUploads(relativePaths: string[], outputPath: string, runId: string) {
  const stagingRoot = path.join(backupRoot, ".tenant-upload-stage", runId);
  const stagingUploads = path.join(stagingRoot, "uploads");
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingUploads, { recursive: true });
  for (const relativePath of relativePaths) {
    const source = safeUploadPath(relativePath);
    try {
      const info = await stat(source);
      if (!info.isFile()) continue;
      const destination = path.join(stagingUploads, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(source, destination);
    } catch {
      // Missing images do not invalidate the database snapshot.
    }
  }
  await execFileAsync("tar", ["-czf", outputPath, "-C", stagingRoot, "uploads"], { maxBuffer: 10 * 1024 * 1024 });
  await rm(stagingRoot, { recursive: true, force: true });
}

async function restoreTenantUploads(archivePath: string, restoreRunId: string) {
  const stagingRoot = path.join(backupRoot, ".tenant-restore-stage", restoreRunId);
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  await execFileAsync("tar", ["-xzf", archivePath, "-C", stagingRoot], { maxBuffer: 10 * 1024 * 1024 });
  const extracted = path.join(stagingRoot, "uploads");
  await copyTree(extracted, uploadRoot);
  await rm(stagingRoot, { recursive: true, force: true });
}

async function copyTree(source: string, destination: string) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await cp(from, to);
  }
}

async function expireRestaurantBackups(prisma: PrismaClient, restaurantId: string) {
  const groups = await Promise.all(["AUTOMATIC", "MANUAL", "PRE_RESTORE"].map((triggerType) =>
    prisma.restaurantBackupRun.findMany({
      where: { restaurantId, status: "SUCCESS", triggerType },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      skip: 3
    })
  ));
  const oldBackups = groups.flat();
  for (const backup of oldBackups) {
    await removeBackupDirectory(backup.snapshotName);
    await prisma.restaurantBackupRun.update({ where: { id: backup.id }, data: { status: "EXPIRED" } });
  }
}

async function removeBackupDirectory(snapshotName: string | null) {
  if (!snapshotName) return;
  const snapshotPath = safeBackupPath(snapshotName);
  const runDir = path.dirname(snapshotPath);
  if (runDir.startsWith(path.join(backupRoot, "restaurants"))) {
    await rm(runDir, { recursive: true, force: true });
  }
}

function collectUploadPaths(urls: Array<string | null | undefined>) {
  const result = new Set<string>();
  for (const value of urls) {
    if (!value) continue;
    let pathname: string;
    try {
      pathname = new URL(value).pathname;
    } catch {
      pathname = value;
    }
    const marker = "/uploads/";
    const index = pathname.indexOf(marker);
    if (index === -1) continue;
    const relative = pathname.slice(index + marker.length).replaceAll("\\", "/");
    if (!relative || relative.split("/").includes("..")) continue;
    result.add(relative);
  }
  return [...result].sort();
}

function safeBackupPath(relativePath: string) {
  const resolved = path.resolve(backupRoot, relativePath);
  if (!resolved.startsWith(`${backupRoot}${path.sep}`)) throw new Error("BACKUP_PATH_INVALID");
  return resolved;
}

function safeUploadPath(relativePath: string) {
  const resolved = path.resolve(uploadRoot, relativePath);
  if (!resolved.startsWith(`${uploadRoot}${path.sep}`)) throw new Error("UPLOAD_PATH_INVALID");
  return resolved;
}

async function hashFile(filePath: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function publicBackupError(error: unknown) {
  if (error instanceof Error && error.message === "RESTAURANT_BACKUP_NOT_FOUND") return "Không tìm thấy cửa hàng cần sao lưu.";
  return "Không thể hoàn tất sao lưu cửa hàng.";
}

function publicRestoreError(error: unknown) {
  if (error instanceof Error && error.message === "RESTAURANT_RESTORE_HAS_RECONCILED_PAYMENTS") {
    return "Cửa hàng có giao dịch đã thanh toán sau thời điểm sao lưu. Khôi phục tự động đã bị chặn để bảo vệ dữ liệu tài chính.";
  }
  if (error instanceof Error && error.message.includes("CHECKSUM")) return "Bản sao lưu không còn hợp lệ.";
  return "Không thể hoàn tất khôi phục cửa hàng.";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
