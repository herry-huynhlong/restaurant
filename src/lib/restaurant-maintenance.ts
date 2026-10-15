import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { getPlatformRuntimeRoot } from "@/lib/maintenance-mode";

export type RestaurantMaintenanceState = {
  restaurantId: string;
  restoreRunId: string;
  startedAt: string;
};

const maintenanceRoot = path.join(getPlatformRuntimeRoot(), "restaurant-maintenance");

export async function getRestaurantMaintenanceState(restaurantId: string) {
  if (!isSafeId(restaurantId)) return null;
  try {
    return JSON.parse(await readFile(statePath(restaurantId), "utf8")) as RestaurantMaintenanceState;
  } catch {
    return null;
  }
}

export async function isRestaurantInMaintenance(restaurantId: string) {
  return Boolean(await getRestaurantMaintenanceState(restaurantId));
}

export async function enableRestaurantMaintenance(restaurantId: string, restoreRunId: string) {
  await mkdir(maintenanceRoot, { recursive: true });
  const destination = statePath(restaurantId);
  const temporary = `${destination}.${process.pid}.tmp`;
  const state: RestaurantMaintenanceState = {
    restaurantId,
    restoreRunId,
    startedAt: new Date().toISOString()
  };
  await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await rename(temporary, destination);
  return state;
}

export async function disableRestaurantMaintenance(restaurantId: string, restoreRunId: string) {
  const current = await getRestaurantMaintenanceState(restaurantId);
  if (current && current.restoreRunId !== restoreRunId) {
    throw new Error("RESTAURANT_MAINTENANCE_OWNED_BY_ANOTHER_JOB");
  }
  await rm(statePath(restaurantId), { force: true });
}

function statePath(restaurantId: string) {
  if (!isSafeId(restaurantId)) throw new Error("INVALID_RESTAURANT_ID");
  return path.join(maintenanceRoot, `${restaurantId}.json`);
}

function isSafeId(value: string) {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}
