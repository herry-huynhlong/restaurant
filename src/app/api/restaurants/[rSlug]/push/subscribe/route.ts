import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { isStaffDeviceRole } from "@/server/services/staff-device-session-service";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  }),
  deviceId: z.string().min(8).max(120).optional(),
  deviceName: z.string().max(120).optional()
});

export async function POST(request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"]);
  const body = await request.json();
  const parsed = subscriptionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent");
  let shiftSession = null;
  if (isStaffDeviceRole(access.membership.role) && parsed.data.deviceId) {
    shiftSession = await prisma.staffDeviceSession.findUnique({
        where: {
          restaurantId_userId_deviceId: {
            restaurantId: access.restaurant.id,
            userId: access.user.id,
            deviceId: parsed.data.deviceId
          }
        }
      });

    if (!shiftSession?.operatorName) {
      return NextResponse.json({ ok: false, code: "DEVICE_NEEDS_OPERATOR", error: "Vui lòng nhập họ tên người sử dụng." }, { status: 403 });
    }
    if (!shiftSession.isActive || shiftSession.revokedAt) {
      return NextResponse.json({ ok: false, code: "DEVICE_REVOKED", error: "Thiết bị này đã bị quản lý khóa." }, { status: 403 });
    }

    shiftSession = await prisma.staffDeviceSession.update({
      where: { id: shiftSession.id },
      data: {
        role: access.membership.role,
        deviceName: parsed.data.deviceName,
        lastSeenAt: new Date()
      }
    });
  }
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: {
      userId: access.user.id,
      restaurantId: access.restaurant.id,
      deviceId: parsed.data.deviceId,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      deviceName: parsed.data.deviceName,
      onShift: shiftSession?.onShift ?? true,
      lastShiftStartedAt: shiftSession?.onShift ? new Date() : undefined,
      lastShiftEndedAt: shiftSession && !shiftSession.onShift ? shiftSession.endedAt ?? new Date() : undefined,
      isActive: true
    },
    create: {
      userId: access.user.id,
      restaurantId: access.restaurant.id,
      deviceId: parsed.data.deviceId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      deviceName: parsed.data.deviceName,
      onShift: shiftSession?.onShift ?? true,
      lastShiftStartedAt: shiftSession?.onShift ? new Date() : undefined,
      lastShiftEndedAt: shiftSession && !shiftSession.onShift ? shiftSession.endedAt ?? new Date() : undefined
    }
  });

  if (parsed.data.deviceName) {
    await prisma.pushSubscription.updateMany({
      where: {
        userId: access.user.id,
        restaurantId: access.restaurant.id,
        deviceName: parsed.data.deviceName,
        id: { not: subscription.id }
      },
      data: { isActive: false }
    });
  }

  console.info("[push] subscription saved", {
    restaurantId: access.restaurant.id,
    userId: access.user.id,
    subscriptionId: subscription.id,
    endpointSuffix: subscription.endpoint.slice(-18),
    hasKeys: Boolean(subscription.p256dh && subscription.auth)
  });

  return NextResponse.json({ ok: true, subscriptionId: subscription.id });
}

export async function DELETE(request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"]);
  const body = await request.json().catch(() => ({})) as { endpoint?: string };

  if (!body.endpoint) {
    return NextResponse.json({ ok: false, error: "Missing endpoint." }, { status: 400 });
  }

  const result = await prisma.pushSubscription.updateMany({
    where: {
      endpoint: body.endpoint,
      userId: access.user.id,
      restaurantId: access.restaurant.id
    },
    data: { isActive: false }
  });

  console.info("[push] subscription disabled", {
    restaurantId: access.restaurant.id,
    userId: access.user.id,
    endpointSuffix: body.endpoint.slice(-18),
    count: result.count
  });

  return NextResponse.json({ ok: true, count: result.count });
}
