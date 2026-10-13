import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { ensurePlatformDataPolicy } from "@/server/services/platform-storage-service";

const metricsFile = process.env.SERVER_METRICS_FILE ?? "/app/host-metrics/metrics.json";
const METRICS_STALE_MS = 30 * 1000;

type RawMetrics = {
  collectedAt?: string;
  disk?: {
    usedBytes?: number;
    totalBytes?: number;
    availableBytes?: number;
    percentUsed?: number;
  };
  memory?: {
    totalBytes?: number;
    usedBytes?: number;
    availableBytes?: number;
    percentUsed?: number;
  };
  swap?: {
    totalBytes?: number;
    usedBytes?: number;
    percentUsed?: number;
  };
};

export async function getPlatformResourceMetrics() {
  const [hostMetrics, policy, successfulBackups, latestSuccessfulBackup] = await Promise.all([
    readHostMetrics(),
    ensurePlatformDataPolicy(),
    prisma.platformBackupRun.findMany({
      where: { status: "SUCCESS" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    prisma.platformBackupRun.findFirst({
      where: { status: "SUCCESS" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }]
    })
  ]);

  return {
    host: hostMetrics,
    backup: {
      totalBytes: successfulBackups.reduce((sum, backup) => sum + Number(backup.sizeBytes), 0),
      successfulCount: successfulBackups.length,
      retentionCount: policy.backupRetentionCount,
      latestSuccessfulAt: latestSuccessfulBackup?.completedAt ?? latestSuccessfulBackup?.updatedAt ?? null
    }
  };
}

async function readHostMetrics() {
  try {
    const raw = await readFile(metricsFile, "utf8");
    const parsed = JSON.parse(raw) as RawMetrics;
    const collectedAt = parsed.collectedAt ? new Date(parsed.collectedAt) : null;
    const stale = !collectedAt || Date.now() - collectedAt.getTime() > METRICS_STALE_MS;

    return {
      ok: !stale,
      stale,
      collectedAt,
      disk: normalizeStorage(parsed.disk),
      memory: normalizeStorage(parsed.memory),
      swap: normalizeSwap(parsed.swap),
      error: stale ? "Không thể cập nhật số liệu máy chủ." : null
    };
  } catch {
    return {
      ok: false,
      stale: true,
      collectedAt: null,
      disk: null,
      memory: null,
      swap: null,
      error: "Chưa nhận được số liệu máy chủ."
    };
  }
}

function normalizeStorage(value: RawMetrics["disk"] | RawMetrics["memory"]) {
  if (!value || !isFiniteNumber(value.totalBytes) || !isFiniteNumber(value.usedBytes)) return null;
  const totalBytes = Math.max(0, Math.floor(value.totalBytes));
  const usedBytes = Math.max(0, Math.floor(value.usedBytes));
  const availableBytes = isFiniteNumber(value.availableBytes) ? Math.max(0, Math.floor(value.availableBytes)) : Math.max(0, totalBytes - usedBytes);
  const percentUsed = isFiniteNumber(value.percentUsed) ? clampPercent(value.percentUsed) : percentage(usedBytes, totalBytes);
  return { totalBytes, usedBytes, availableBytes, percentUsed };
}

function normalizeSwap(value: RawMetrics["swap"]) {
  if (!value || !isFiniteNumber(value.totalBytes) || !isFiniteNumber(value.usedBytes)) return null;
  const totalBytes = Math.max(0, Math.floor(value.totalBytes));
  const usedBytes = Math.max(0, Math.floor(value.usedBytes));
  const percentUsed = isFiniteNumber(value.percentUsed) ? clampPercent(value.percentUsed) : percentage(usedBytes, totalBytes);
  return { totalBytes, usedBytes, percentUsed };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percentage(used: number, total: number) {
  if (!total) return 0;
  return clampPercent((used / total) * 100);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(1))));
}
