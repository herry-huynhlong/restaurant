import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";

async function main() {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "quanpilot-restore-test-"));
  process.env.PLATFORM_RUNTIME_DIR = runtimeRoot;

  const maintenance = await import("../src/lib/maintenance-mode");
  const restaurantMaintenance = await import("../src/lib/restaurant-maintenance");
  const jobs = await import("../src/server/services/platform-restore-runtime");
  const worker = await import("./platform-restore-worker");

  try {
    assert.equal(await maintenance.isMaintenanceMode(), false);
    await maintenance.enableMaintenanceMode("restore-test-job");
    assert.equal((await maintenance.getMaintenanceState())?.restoreJobId, "restore-test-job");
    await maintenance.disableMaintenanceMode("restore-test-job");
    assert.equal(await maintenance.isMaintenanceMode(), false);

    await restaurantMaintenance.enableRestaurantMaintenance("restaurant-a", "tenant-restore-1");
    assert.equal(await restaurantMaintenance.isRestaurantInMaintenance("restaurant-a"), true);
    assert.equal(await restaurantMaintenance.isRestaurantInMaintenance("restaurant-b"), false);
    await restaurantMaintenance.disableRestaurantMaintenance("restaurant-a", "tenant-restore-1");
    assert.equal(await restaurantMaintenance.isRestaurantInMaintenance("restaurant-a"), false);

    const tenantBackupSource = await readFile(path.join(process.cwd(), "src/server/services/restaurant-backup-service.ts"), "utf8");
    assert.match(tenantBackupSource, /WHERE t\."restaurantId" = \$1/);
    assert.match(tenantBackupSource, /RESTAURANT_RESTORE_HAS_RECONCILED_PAYMENTS/);
    assert.match(tenantBackupSource, /triggerType: "PRE_RESTORE"/);
    assert.doesNotMatch(tenantBackupSource, /"User",/);
    assert.doesNotMatch(tenantBackupSource, /"PushSubscription",/);
    assert.doesNotMatch(tenantBackupSource, /"RestaurantSubscriptionRequest",/);

    const first = await jobs.createRestoreJob({ backupId: "backup-1", actorUserId: "owner-1" });
    await assert.rejects(
      jobs.createRestoreJob({ backupId: "backup-2", actorUserId: "owner-1" }),
      /RESTORE_ALREADY_ACTIVE/
    );

    await jobs.updateRestoreJob(first.id, { status: "VERIFYING", publicMessage: "testing" });
    await worker.markInterruptedRestoreJobs();
    assert.equal((await jobs.readRestoreJob(first.id))?.status, "NEEDS_INTERVENTION");

    const second = await jobs.createRestoreJob({ backupId: "backup-2", actorUserId: "owner-1" });
    assert.equal(second.status, "QUEUED");
    assert.equal((await jobs.listRestoreJobs()).length, 2);

    process.stdout.write("Backup/restore hardening checks passed.\n");
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
