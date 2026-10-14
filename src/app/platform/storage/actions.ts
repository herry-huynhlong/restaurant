"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { checkBackupRestoreReadiness, ensurePlatformDataPolicy, refreshRestaurantStorageUsage } from "@/server/services/platform-storage-service";

const storagePolicySchema = z.object({
  backupEnabled: z.boolean(),
  backupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ sao lưu không hợp lệ."),
  backupRetentionCount: z.coerce.number().int().min(1, "Cần giữ ít nhất 1 bản sao lưu.").max(14, "Không nên giữ quá 14 bản sao lưu."),
  notificationRetentionDays: z.coerce.number().int().min(1, "Số ngày lưu thông báo không hợp lệ.").max(90, "Thông báo không nên giữ quá 90 ngày."),
  temporaryDataRetentionDays: z.coerce.number().int().min(7, "Dữ liệu tạm cần lưu ít nhất 7 ngày.").max(365, "Dữ liệu tạm không nên giữ quá 365 ngày."),
  backupStorageKind: z.literal("LOCAL")
});

export async function updateStoragePolicyAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const parsed = storagePolicySchema.safeParse({
    backupEnabled: formData.get("backupEnabled") === "on",
    backupTime: readString(formData, "backupTime"),
    backupRetentionCount: readString(formData, "backupRetentionCount"),
    notificationRetentionDays: readString(formData, "notificationRetentionDays"),
    temporaryDataRetentionDays: readString(formData, "temporaryDataRetentionDays"),
    backupStorageKind: readString(formData, "backupStorageKind")
  });

  if (!parsed.success) {
    redirectWithError(validationMessage(parsed.error));
  }

  const policy = await ensurePlatformDataPolicy();
  await prisma.$transaction([
    prisma.platformDataPolicy.update({
      where: { id: policy.id },
      data: parsed.data
    }),
    prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: "PLATFORM_STORAGE_POLICY_UPDATED",
        entityType: "PlatformDataPolicy",
        entityId: policy.id,
        metadataJson: {
          backupEnabled: parsed.data.backupEnabled,
          backupTime: parsed.data.backupTime,
          backupRetentionCount: parsed.data.backupRetentionCount,
          notificationRetentionDays: parsed.data.notificationRetentionDays,
          temporaryDataRetentionDays: parsed.data.temporaryDataRetentionDays,
          backupStorageKind: parsed.data.backupStorageKind
        }
      }
    })
  ]);

  revalidatePath(platformRoutes.storage);
  redirectWithSuccess("Đã lưu chính sách lưu trữ.");
}

export async function refreshStorageUsageAction() {
  const actor = await requirePlatformOwner();
  await refreshRestaurantStorageUsage();
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: "PLATFORM_STORAGE_USAGE_REFRESHED",
      entityType: "RestaurantStorageUsage",
      metadataJson: { source: "platform-admin" }
    }
  });
  revalidatePath(platformRoutes.storage);
  redirectWithSuccess("Đã cập nhật dung lượng ước tính.");
}

export async function queueManualBackupAction() {
  const actor = await requirePlatformOwner();
  const policy = await ensurePlatformDataPolicy();
  const run = await prisma.platformBackupRun.create({
    data: {
      status: "QUEUED",
      triggerType: "MANUAL",
      storageKind: policy.backupStorageKind,
      locationLabel: storageKindLabel(policy.backupStorageKind)
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: "PLATFORM_BACKUP_QUEUED",
      entityType: "PlatformBackupRun",
      entityId: run.id,
      metadataJson: { triggerType: "MANUAL", storageKind: policy.backupStorageKind }
    }
  });

  revalidatePath(platformRoutes.storage);
  redirectWithSuccess("Đã tiếp nhận yêu cầu sao lưu.");
}

export async function queueCleanupAction() {
  const actor = await requirePlatformOwner();
  const run = await prisma.platformMaintenanceRun.create({
    data: {
      taskType: "CLEANUP_TEMPORARY_DATA",
      status: "QUEUED"
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: "PLATFORM_CLEANUP_QUEUED",
      entityType: "PlatformMaintenanceRun",
      entityId: run.id,
      metadataJson: { taskType: "CLEANUP_TEMPORARY_DATA" }
    }
  });

  revalidatePath(platformRoutes.storage);
  redirectWithSuccess("Đã tiếp nhận yêu cầu dọn dữ liệu tạm.");
}

export async function checkBackupRestoreReadinessAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const backupRunId = readString(formData, "backupRunId");
  if (!backupRunId) {
    redirectWithError("Thiếu bản sao lưu cần kiểm tra.");
  }

  const result = await checkBackupRestoreReadiness(backupRunId);
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: "PLATFORM_BACKUP_RESTORE_CHECKED",
      entityType: "PlatformBackupRun",
      entityId: backupRunId,
      metadataJson: {
        status: result.status,
        canRestoreProduction: result.canRestoreProduction,
        passedChecks: result.checks.filter((check) => check.status === "PASS").length,
        warningChecks: result.checks.filter((check) => check.status === "WARN").length,
        failedChecks: result.checks.filter((check) => check.status === "FAIL").length
      }
    }
  });

  revalidatePath(platformRoutes.storage);
  if (result.status === "NOT_READY") {
    redirectWithError("Bản sao lưu chưa đủ điều kiện khôi phục. Hãy xem chi tiết kiểm tra.");
  }
  redirectWithSuccess("Đã kiểm tra bản sao lưu. Khôi phục production vẫn đang khóa để bảo vệ dữ liệu.");
}

function storageKindLabel(value: string) {
  return value === "S3_COMPATIBLE" ? "Nơi lưu độc lập" : "Nơi lưu hiện tại";
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function validationMessage(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.values(fieldErrors).flat().filter(Boolean).join(" ") || "Dữ liệu không hợp lệ.";
}

function redirectWithError(message: string): never {
  redirect(`${platformRoutes.storage}?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string): never {
  redirect(`${platformRoutes.storage}?success=${encodeURIComponent(message)}`);
}
