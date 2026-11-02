import type { RestaurantRole } from "@prisma/client";

export type StaffPwaStartup =
  | { state: "READY"; workspace: string; role: RestaurantRole }
  | { state: "DEVICE_SETUP_REQUIRED"; setupPath: string; role: RestaurantRole }
  | { state: "NO_SESSION" }
  | { state: "DEVICE_REVOKED" }
  | { state: "FORBIDDEN" }
  | { state: "TENANT_UNAVAILABLE"; lockedPath: string }
  | { state: "NETWORK_ERROR" };

export function startupDestination(value: StaffPwaStartup) {
  if (value.state === "READY") return value.workspace;
  if (value.state === "DEVICE_SETUP_REQUIRED") return value.setupPath;
  if (value.state === "TENANT_UNAVAILABLE") return value.lockedPath;
  if (value.state === "FORBIDDEN") return "/unauthorized";
  return null;
}
