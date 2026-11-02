"use client";

import { staffPwaLoginUrl } from "./tenant-pwa";
import { startupDestination, type StaffPwaStartup } from "./staff-pwa-startup";

const pending = new Map<string, Promise<StaffPwaStartup>>();
async function currentStartup(slug: string) {
  let task = pending.get(slug);
  if (!task) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    task = fetch(`/api/restaurants/${encodeURIComponent(slug)}/pwa/status`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const value = await response.json() as StaffPwaStartup;
        return value;
      }).catch((): StaffPwaStartup => ({ state: "NETWORK_ERROR" })).finally(() => { window.clearTimeout(timeout); pending.delete(slug); });
    pending.set(slug, task);
  }
  return task;
}

// Called only for failed/redirected auth responses, not a new polling loop.
export async function recoverStaffAccess(slug: string, response: Response) {
  if (![401, 403].includes(response.status) && !response.redirected) return false;
  const value = await currentStartup(slug);
  const destination = startupDestination(value);
  const section = window.location.pathname.split("/")[2];
  const role = ({ staff: "WAITER", kitchen: "KITCHEN", cashier: "CASHIER", admin: "MANAGER" } as Record<string, string>)[section];
  if (value.state === "NO_SESSION" || value.state === "DEVICE_REVOKED") window.location.replace(staffPwaLoginUrl(slug, role));
  else if (destination && value.state !== "READY") window.location.replace(destination);
  // Network failure is not evidence of logout/revocation; leave the page intact.
  return value.state !== "READY";
}
