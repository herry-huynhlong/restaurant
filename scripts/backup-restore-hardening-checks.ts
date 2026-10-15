import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

async function main() {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "quanpilot-restore-test-"));
  process.env.PLATFORM_RUNTIME_DIR = runtimeRoot;

  const maintenance = await import("../src/lib/maintenance-mode");
  const jobs = await import("../src/server/services/platform-restore-runtime");
  const worker = await import("./platform-restore-worker");

  try {
    assert.equal(await maintenance.isMaintenanceMode(), false);
    await maintenance.enableMaintenanceMode("restore-test-job");
    assert.equal((await maintenance.getMaintenanceState())?.restoreJobId, "restore-test-job");
    await maintenance.disableMaintenanceMode("restore-test-job");
    assert.equal(await maintenance.isMaintenanceMode(), false);

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
