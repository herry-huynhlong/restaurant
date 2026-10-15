import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { getPlatformRuntimeRoot } from "@/lib/maintenance-mode";

export type RestoreJobStatus =
  | "QUEUED"
  | "VERIFYING"
  | "PREPARING"
  | "RESTORING"
  | "VALIDATING"
  | "SUCCESS"
  | "FAILED"
  | "NEEDS_INTERVENTION";

export type RestoreJob = {
  id: string;
  backupId: string;
  actorUserId: string;
  status: RestoreJobStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  publicMessage: string;
  rollbackCompleted?: boolean;
};

const jobsRoot = path.join(getPlatformRuntimeRoot(), "restore-jobs");
const requestLock = path.join(getPlatformRuntimeRoot(), "restore-request.lock");
const activeStatuses = new Set<RestoreJobStatus>(["QUEUED", "VERIFYING", "PREPARING", "RESTORING", "VALIDATING"]);

export async function createRestoreJob(input: { backupId: string; actorUserId: string }) {
  await mkdir(getPlatformRuntimeRoot(), { recursive: true });
  await acquireDirectoryLock(requestLock);
  try {
    const jobs = await listRestoreJobs();
    if (jobs.some((job) => activeStatuses.has(job.status))) {
      throw new Error("RESTORE_ALREADY_ACTIVE");
    }

    const now = new Date().toISOString();
    const job: RestoreJob = {
      id: crypto.randomUUID(),
      backupId: input.backupId,
      actorUserId: input.actorUserId,
      status: "QUEUED",
      createdAt: now,
      updatedAt: now,
      publicMessage: "Yêu cầu khôi phục đang chờ xử lý."
    };
    await writeRestoreJob(job);
    return job;
  } finally {
    await rm(requestLock, { recursive: true, force: true });
  }
}

export async function listRestoreJobs() {
  await mkdir(jobsRoot, { recursive: true });
  const names = await readdir(jobsRoot);
  const jobs = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          return JSON.parse(await readFile(path.join(jobsRoot, name), "utf8")) as RestoreJob;
        } catch {
          return null;
        }
      })
  );
  return jobs.filter((job): job is RestoreJob => Boolean(job)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readRestoreJob(jobId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) return null;
  try {
    return JSON.parse(await readFile(path.join(jobsRoot, `${jobId}.json`), "utf8")) as RestoreJob;
  } catch {
    return null;
  }
}

export async function updateRestoreJob(jobId: string, patch: Partial<Omit<RestoreJob, "id" | "createdAt">>) {
  const current = await readRestoreJob(jobId);
  if (!current) throw new Error("RESTORE_JOB_NOT_FOUND");
  const next: RestoreJob = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };
  await writeRestoreJob(next);
  return next;
}

export function isActiveRestoreStatus(status: RestoreJobStatus) {
  return activeStatuses.has(status);
}

async function writeRestoreJob(job: RestoreJob) {
  await mkdir(jobsRoot, { recursive: true });
  const destination = path.join(jobsRoot, `${job.id}.json`);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(job, null, 2), "utf8");
  await rename(temporary, destination);
}

async function acquireDirectoryLock(lockPath: string) {
  try {
    await mkdir(lockPath);
  } catch {
    try {
      const info = await stat(lockPath);
      if (Date.now() - info.mtimeMs <= 5 * 60 * 1000) throw new Error("RESTORE_ALREADY_ACTIVE");
      await rm(lockPath, { recursive: true, force: true });
      await mkdir(lockPath);
    } catch (error) {
      if (error instanceof Error && error.message === "RESTORE_ALREADY_ACTIVE") throw error;
      throw new Error("RESTORE_ALREADY_ACTIVE");
    }
  }
}
