import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RestaurantRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { restaurantRoutes } from "@/lib/routes";

const staffDeviceCookieName = "staffDeviceId";
const staffRoles = new Set<RestaurantRole>(["WAITER", "KITCHEN", "CASHIER"]);

export function getStaffDeviceIdCookie() {
  return cookies().get(staffDeviceCookieName)?.value ?? null;
}

export function isStaffDeviceRole(role: RestaurantRole) {
  return staffRoles.has(role);
}

export function getRoleHomePath(slug: string, role: RestaurantRole) {
  switch (role) {
    case "WAITER":
      return restaurantRoutes.staff(slug);
    case "KITCHEN":
      return restaurantRoutes.kitchen(slug);
    case "CASHIER":
      return restaurantRoutes.cashier(slug);
    case "OWNER":
    case "MANAGER":
      return restaurantRoutes.admin(slug);
    default:
      return "/unauthorized";
  }
}

export async function getActiveStaffDeviceSession({
  restaurantId,
  userId,
  deviceId
}: {
  restaurantId: string;
  userId: string;
  deviceId: string | null | undefined;
}) {
  if (!deviceId) return null;

  return prisma.staffDeviceSession.findUnique({
    where: {
      restaurantId_userId_deviceId: {
        restaurantId,
        userId,
        deviceId
      }
    }
  });
}

export async function requireActiveStaffDeviceSession({
  restaurantId,
  restaurantSlug,
  userId,
  role,
  nextPath
}: {
  restaurantId: string;
  restaurantSlug: string;
  userId: string;
  role: RestaurantRole;
  nextPath: string;
}) {
  if (!isStaffDeviceRole(role)) return null;

  const deviceId = getStaffDeviceIdCookie();
  const session = await getActiveStaffDeviceSession({ restaurantId, userId, deviceId });

  if (!deviceId || !session?.operatorName) {
    redirect(`${restaurantRoutes.deviceSetup(restaurantSlug)}?next=${encodeURIComponent(nextPath)}`);
  }

  if (!session.isActive || session.revokedAt) {
    redirect(`/${restaurantSlug}/login?error=${encodeURIComponent("Thiết bị này đã bị quản lý khóa.")}`);
  }

  await prisma.staffDeviceSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return session;
}

export async function assertActiveStaffDeviceForAction({
  restaurantId,
  restaurantSlug,
  userId,
  role
}: {
  restaurantId: string;
  restaurantSlug?: string;
  userId: string;
  role: RestaurantRole;
}) {
  if (!isStaffDeviceRole(role)) return null;

  const deviceId = getStaffDeviceIdCookie();
  const session = await getActiveStaffDeviceSession({ restaurantId, userId, deviceId });

  if (!deviceId || !session?.operatorName || !session.isActive || session.revokedAt) {
    if (restaurantSlug) {
      redirect(`/${restaurantSlug}/login?error=${encodeURIComponent("Thiết bị này đã bị quản lý khóa.")}`);
    }
    throw new Error("DEVICE_REVOKED");
  }

  await prisma.staffDeviceSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return session;
}
