import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { isStaffDeviceRole } from "@/server/services/staff-device-session-service";

const deviceSessionSchema = z.object({
  deviceId: z.string().trim().min(8).max(120),
  deviceName: z.string().trim().max(120).optional(),
  operatorName: z.string().trim().min(1).max(120)
});

export async function POST(request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["WAITER", "KITCHEN", "CASHIER"]);
  if (!isStaffDeviceRole(access.membership.role)) {
    return NextResponse.json({ ok: false, code: "FORBIDDEN", error: "Vai trò không dùng thiết bị nhân viên." }, { status: 403 });
  }

  const parsed = deviceSessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Vui lòng nhập họ tên người sử dụng." }, { status: 400 });
  }

  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    const deviceSession = await tx.staffDeviceSession.upsert({
      where: {
        restaurantId_userId_deviceId: {
          restaurantId: access.restaurant.id,
          userId: access.user.id,
          deviceId: parsed.data.deviceId
        }
      },
      update: {
        role: access.membership.role,
        deviceName: parsed.data.deviceName,
        operatorName: parsed.data.operatorName,
        onShift: true,
        isActive: true,
        revokedAt: null,
        revokedByUserId: null,
        startedAt: now,
        endedAt: null,
        lastSeenAt: now
      },
      create: {
        restaurantId: access.restaurant.id,
        userId: access.user.id,
        deviceId: parsed.data.deviceId,
        deviceName: parsed.data.deviceName,
        operatorName: parsed.data.operatorName,
        role: access.membership.role,
        onShift: true,
        isActive: true,
        startedAt: now,
        lastSeenAt: now
      }
    });

    await tx.pushSubscription.updateMany({
      where: {
        restaurantId: access.restaurant.id,
        userId: access.user.id,
        deviceId: parsed.data.deviceId
      },
      data: {
        deviceName: parsed.data.deviceName,
        onShift: true,
        isActive: true,
        lastShiftStartedAt: now,
        lastShiftEndedAt: null
      }
    });

    await tx.auditLog.create({
      data: {
        restaurantId: access.restaurant.id,
        userId: access.user.id,
        action: "STAFF_DEVICE_SESSION_STARTED",
        entityType: "StaffDeviceSession",
        entityId: deviceSession.id,
        metadataJson: {
          deviceId: parsed.data.deviceId,
          deviceName: parsed.data.deviceName,
          operatorName: parsed.data.operatorName,
          role: access.membership.role
        }
      }
    });

    return deviceSession;
  });

  return NextResponse.json({
    ok: true,
    deviceSessionId: session.id,
    operatorName: session.operatorName,
    onShift: session.onShift
  });
}
