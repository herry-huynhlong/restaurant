import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

export type MaintenanceState = {
  active: boolean;
  reason: "RESTORE";
  restoreJobId: string;
  startedAt: string;
};

const runtimeRoot = path.resolve(process.env.PLATFORM_RUNTIME_DIR ?? path.join(process.cwd(), "runtime"));
const maintenanceFile = path.join(runtimeRoot, "maintenance.json");

export async function getMaintenanceState(): Promise<MaintenanceState | null> {
  try {
    const value = JSON.parse(await readFile(maintenanceFile, "utf8")) as MaintenanceState;
    return value.active && value.reason === "RESTORE" && value.restoreJobId ? value : null;
  } catch {
    return null;
  }
}

export async function isMaintenanceMode() {
  return Boolean(await getMaintenanceState());
}

export async function assertSystemWritable() {
  if (await isMaintenanceMode()) {
    throw new Error("SYSTEM_MAINTENANCE");
  }
}

export async function enableMaintenanceMode(restoreJobId: string) {
  await mkdir(runtimeRoot, { recursive: true });
  const temporaryFile = `${maintenanceFile}.${process.pid}.tmp`;
  const state: MaintenanceState = {
    active: true,
    reason: "RESTORE",
    restoreJobId,
    startedAt: new Date().toISOString()
  };
  await writeFile(temporaryFile, JSON.stringify(state, null, 2), "utf8");
  await rename(temporaryFile, maintenanceFile);
  return state;
}

export async function disableMaintenanceMode(restoreJobId: string) {
  const current = await getMaintenanceState();
  if (current && current.restoreJobId !== restoreJobId) {
    throw new Error("MAINTENANCE_OWNED_BY_ANOTHER_JOB");
  }
  await rm(maintenanceFile, { force: true });
}

export function getPlatformRuntimeRoot() {
  return runtimeRoot;
}
