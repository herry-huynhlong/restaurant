"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { checkBackupRestoreReadiness, ensurePlatformDataPolicy, getBackupWorkerAvailability, refreshRestaurantStorageUsage } from "@/server/services/platform-storage-service";
import { createRestoreJob } from "@/server/services/platform-restore-runtime";

const storagePolicySchema = z.object({
  backupEnabled: z.boolean(),
  backupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ sao lưu không hợp lệ."),
  backupRetentionCount: z.coerce.number().int().min(1, "Cần giữ ít nhất 1 bản sao lưu.").max(14, "Không nên giữ quá 14 bản sao lưu."),
  notificationRetentionDays: z.coerce.number().int().min(1, "Số ngày lưu thông báo không hợp lệ.").max(90, "Thông báo không nên giữ quá 90 ngày."),
  temporaryDataRetentionDays: z.coerce.number().int().min(7, "Dữ liệu tạm cần lưu ít nhất 7 ngày.").max(365, "Dữ liệu tạm không nên giữ quá 365 ngày."),
  backupStorageKind: z.literal("LOCAL")
});

const restoreSchema = z.object({
  backupRunId: z.string().min(1),
  currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại."),
  acknowledgeRisk: z.literal("on", { errorMap: () => ({ message: "Vui lòng xác nhận bạn hiểu rủi ro khôi phục." }) })
});

const restaurantBackupSchema = z.object({
  restaurantId: z.string().min(1)
});

const restaurantRestoreSchema = z.object({
  restaurantId: z.string().min(1),
  backupRunId: z.string().min(1),
  currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại."),
  acknowledgeRisk: z.literal("on", { errorMap: () => ({ message: "Vui lòng xác nhận bạn hiểu phạm vi khôi phục." }) })
});

export type RestoreBackupActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  restoreJobId: string | null;
};

export type RestaurantRestoreActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  restoreRunId: string | null;
};

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
  const worker = await getBackupWorkerAvailability();
  if (!worker.ready) {
    redirectWithError("Dịch vụ sao lưu đang gián đoạn. Vui lòng kiểm tra để tiếp tục bảo vệ dữ liệu.");
  }

  const policy = await ensurePlatformDataPolicy();
  const run = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('platform_backup_queue'))`;
    const activeRun = await tx.platformBackupRun.findFirst({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true }
    });
    if (activeRun) return null;

    const created = await tx.platformBackupRun.create({
      data: {
        status: "QUEUED",
        triggerType: "MANUAL",
        storageKind: policy.backupStorageKind,
        locationLabel: storageKindLabel(policy.backupStorageKind)
      }
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: "PLATFORM_BACKUP_QUEUED",
        entityType: "PlatformBackupRun",
        entityId: created.id,
        metadataJson: { triggerType: "MANUAL", storageKind: policy.backupStorageKind }
      }
    });
    return created;
  });

  if (!run) {
    redirectWithError("Đang có một lần sao lưu được xử lý. Vui lòng chờ hoàn tất.");
  }

  revalidatePath(platformRoutes.storage);
  redirect(`${platformRoutes.storage}?backupJob=${encodeURIComponent(run.id)}`);
}

export async function queueRestaurantBackupAction(formData: FormData) {
  const actor = await requirePlatformOwner();
  const parsed = restaurantBackupSchema.safeParse({ restaurantId: readString(formData, "restaurantId") });
  if (!parsed.success) redirectWithError("Không xác định được cửa hàng cần sao lưu.");

  const [restaurant, worker] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: parsed.data.restaurantId }, select: { id: true, name: true, status: true } }),
    getBackupWorkerAvailability()
  ]);
  if (!restaurant || restaurant.status === "DELETED") redirectWithError("Cửa hàng không còn khả dụng.");
  if (!worker.ready) redirectWithError("Dịch vụ sao lưu đang gián đoạn.");

  const run = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-backup:${restaurant.id}`}))`;
    const active = await tx.restaurantBackupRun.findFirst({
      where: { restaurantId: restaurant.id, status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true }
    });
    if (active) return null;
    const created = await tx.restaurantBackupRun.create({
      data: {
        restaurantId: restaurant.id,
        restaurantNameSnapshot: restaurant.name,
        triggerType: "MANUAL"
      }
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        restaurantId: restaurant.id,
        action: "RESTAURANT_BACKUP_QUEUED",
        entityType: "RestaurantBackupRun",
        entityId: created.id
      }
    });
    return created;
  });
  if (!run) redirectWithError("Cửa hàng này đang có một lần sao lưu được xử lý.");

  revalidatePath(platformRoutes.storage);
  redirectWithSuccess(`Đã tiếp nhận yêu cầu sao lưu cửa hàng ${restaurant.name}.`);
}

export async function queueRestaurantRestoreAction(
  _previousState: RestaurantRestoreActionState,
  formData: FormData
): Promise<RestaurantRestoreActionState> {
  const actor = await requirePlatformOwner();
  if (process.env.TENANT_RESTORE_ENABLED !== "true") {
    return restaurantRestoreError("Khôi phục riêng đang chờ hoàn tất kiểm tra vận hành.");
  }
  const parsed = restaurantRestoreSchema.safeParse({
    restaurantId: readString(formData, "restaurantId"),
    backupRunId: readString(formData, "backupRunId"),
    currentPassword: String(formData.get("currentPassword") ?? ""),
    acknowledgeRisk: formData.get("acknowledgeRisk")
  });
  if (!parsed.success) return restaurantRestoreError(validationMessage(parsed.error));

  try {
    const [user, backup, worker] = await Promise.all([
      prisma.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } }),
      prisma.restaurantBackupRun.findFirst({
        where: {
          id: parsed.data.backupRunId,
          restaurantId: parsed.data.restaurantId,
          status: "SUCCESS",
          verifiedAt: { not: null }
        },
        include: { restaurant: { select: { name: true } } }
      }),
      getBackupWorkerAvailability()
    ]);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return restaurantRestoreError("Mật khẩu không chính xác.");
    }
    if (!backup) return restaurantRestoreError("Bản sao lưu không còn khả dụng cho cửa hàng này.");
    if (!worker.ready) return restaurantRestoreError("Dịch vụ sao lưu và khôi phục đang gián đoạn.");

    const run = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-restore:${parsed.data.restaurantId}`}))`;
      const active = await tx.restaurantRestoreRun.findFirst({
        where: {
          restaurantId: parsed.data.restaurantId,
          status: { in: ["QUEUED", "VERIFYING", "PREPARING", "RESTORING"] }
        },
        select: { id: true }
      });
      if (active) return null;
      const created = await tx.restaurantRestoreRun.create({
        data: {
          restaurantId: parsed.data.restaurantId,
          backupRunId: backup.id,
          actorUserId: actor.id,
          publicMessage: "Yêu cầu khôi phục cửa hàng đang chờ xử lý."
        }
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          restaurantId: parsed.data.restaurantId,
          action: "RESTAURANT_RESTORE_QUEUED",
          entityType: "RestaurantRestoreRun",
          entityId: created.id,
          metadataJson: { backupRunId: backup.id }
        }
      });
      return created;
    });
    if (!run) return restaurantRestoreError("Cửa hàng này đang có một lần khôi phục được xử lý.");

    revalidatePath(platformRoutes.storage);
    return {
      status: "success",
      message: `Đã tiếp nhận yêu cầu khôi phục cửa hàng ${backup.restaurant.name}.`,
      restoreRunId: run.id
    };
  } catch {
    return restaurantRestoreError("Không thể bắt đầu khôi phục cửa hàng. Vui lòng thử lại.");
  }
}

function restaurantRestoreError(message: string): RestaurantRestoreActionState {
  return { status: "error", message, restoreRunId: null };
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
  redirectWithSuccess("Bản sao lưu đã vượt qua kiểm tra tính toàn vẹn.");
}

export async function restoreBackupAction(
  _previousState: RestoreBackupActionState,
  formData: FormData
): Promise<RestoreBackupActionState> {
  const actor = await requirePlatformOwner();
  const parsed = restoreSchema.safeParse({
    backupRunId: readString(formData, "backupRunId"),
    currentPassword: String(formData.get("currentPassword") ?? ""),
    acknowledgeRisk: formData.get("acknowledgeRisk")
  });
  if (!parsed.success) {
    return restoreActionError(validationMessage(parsed.error));
  }

  try {
    const [user, worker, readiness] = await Promise.all([
      prisma.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } }),
      getBackupWorkerAvailability(),
      checkBackupRestoreReadiness(parsed.data.backupRunId)
    ]);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return restoreActionError("Mật khẩu không chính xác.");
    }
    if (!worker.ready) {
      return restoreActionError("Không thể bắt đầu khôi phục vì dịch vụ đang gián đoạn.");
    }
    if (readiness.status === "NOT_READY" || !readiness.canRestoreProduction) {
      return restoreActionError("Bản sao lưu chưa đủ điều kiện khôi phục.");
    }

    const restoreJob = await createRestoreJob({ backupId: parsed.data.backupRunId, actorUserId: actor.id });
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: "PLATFORM_RESTORE_QUEUED",
        entityType: "PlatformRestoreJob",
        entityId: restoreJob.id,
        metadataJson: { backupId: parsed.data.backupRunId }
      }
    });
    revalidatePath(platformRoutes.storage);
    return {
      status: "success",
      message: "Đã tiếp nhận yêu cầu khôi phục dữ liệu.",
      restoreJobId: restoreJob.id
    };
  } catch (error) {
    if (error instanceof Error && error.message === "RESTORE_ALREADY_ACTIVE") {
      return restoreActionError("Đang có một lần khôi phục được xử lý.");
    }
    return restoreActionError("Không thể bắt đầu khôi phục. Vui lòng thử lại.");
  }
}

function restoreActionError(message: string): RestoreBackupActionState {
  return { status: "error", message, restoreJobId: null };
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
