import { prisma } from "@/lib/db/prisma";
import { canRoleAccessPlan } from "@/lib/plan/features";
import { getEffectiveSubscriptionStatus } from "@/lib/tenant/restaurant";
import { isRestaurantInMaintenance } from "@/lib/restaurant-maintenance";
import { isMaintenanceMode } from "@/lib/maintenance-mode";
import { restaurantRoutes } from "@/lib/routes";
import type { StaffPwaStartup } from "@/lib/staff-pwa-startup";
import { getRoleHomePath, isStaffDeviceRole } from "./staff-device-session-service";

// userId and deviceId come from the server session/cookie, never URL/body claims.
// Read-only: do not enroll devices, start shifts, or refresh revoked records here.
export async function resolveStaffPwaStartup(slug: string, userId?: string, deviceId?: string | null): Promise<StaffPwaStartup> {
  if (!userId) return { state: "NO_SESSION" };
  const membership = await prisma.restaurantUser.findFirst({
    where: { userId, restaurant: { slug } },
    select: { role: true, isActive: true, deletedAt: true, user: { select: { isActive: true } }, restaurant: { select: { id: true, status: true, subscriptionEnd: true, subscriptionStatus: true, plan: true, planEntitlement: true, businessType: true } } }
  });
  if (!membership?.user.isActive || !membership.isActive || membership.deletedAt) return { state: "FORBIDDEN" };
  const restaurant = membership.restaurant;
  const policy = await prisma.platformSubscriptionPolicy.findUnique({ where: { singletonKey: "default" }, select: { gracePeriodDays: true } });
  if (restaurant.status !== "ACTIVE" || getEffectiveSubscriptionStatus(restaurant.subscriptionEnd, restaurant.subscriptionStatus, policy?.gracePeriodDays ?? 3) !== "ACTIVE" || await isMaintenanceMode() || await isRestaurantInMaintenance(restaurant.id)) {
    return { state: "TENANT_UNAVAILABLE", lockedPath: restaurantRoutes.locked(slug) };
  }
  if (!canRoleAccessPlan(restaurant.plan, membership.role, restaurant.businessType, restaurant.planEntitlement)) return { state: "FORBIDDEN" };
  const workspace = getRoleHomePath(slug, membership.role);
  if (isStaffDeviceRole(membership.role)) {
    const device = deviceId ? await prisma.staffDeviceSession.findUnique({ where: { restaurantId_userId_deviceId: { restaurantId: restaurant.id, userId, deviceId } }, select: { operatorName: true, isActive: true, revokedAt: true } }) : null;
    if (device && (!device.isActive || device.revokedAt)) return { state: "DEVICE_REVOKED" };
    if (!device?.operatorName) return { state: "DEVICE_SETUP_REQUIRED", role: membership.role, setupPath: `${restaurantRoutes.deviceSetup(slug)}?next=${encodeURIComponent(workspace)}` };
  }
  return { state: "READY", role: membership.role, workspace };
}
