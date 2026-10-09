import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";

const shiftRoles = ["WAITER", "KITCHEN", "CASHIER"] as const;

const deviceSchema = z.object({
  deviceId: z.string().trim().min(8).max(120)
});

const shiftSchema = deviceSchema.extend({
  action: z.enum(["START", "END"])
});

export async function GET(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, [...shiftRoles]);
  const parsed = deviceSchema.safeParse({
    deviceId: request.nextUrl.searchParams.get("deviceId")
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Thiếu deviceId." }, { status: 400 });
  }

  const session = await prisma.staffDeviceSession.findUnique({
    where: {
      restaurantId_userId_deviceId: {
        restaurantId: access.restaurant.id,
        userId: access.user.id,
        deviceId: parsed.data.deviceId
      }
    }
  });

  if (!session?.operatorName) {
    return NextResponse.json({ ok: false, code: "DEVICE_NEEDS_OPERATOR", error: "Vui lòng nhập họ tên người sử dụng." }, { status: 403 });
  }
  if (!session.isActive || session.revokedAt) {
    return NextResponse.json({ ok: false, code: "DEVICE_REVOKED", error: "Thiết bị này đã bị quản lý khóa." }, { status: 403 });
  }

  await prisma.staffDeviceSession.update({
    where: { id: session.id },
    data: {
      role: access.membership.role,
      lastSeenAt: new Date()
    }
  });

  return NextResponse.json({ ok: true, onShift: session.onShift, operatorName: session.operatorName });
}

export async function POST(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, [...shiftRoles]);
  const parsed = shiftSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Yêu cầu ca không hợp lệ." }, { status: 400 });
  }

  const now = new Date();
  const onShift = parsed.data.action === "START";

  try {
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.staffDeviceSession.findUnique({
        where: {
          restaurantId_userId_deviceId: {
            restaurantId: access.restaurant.id,
            userId: access.user.id,
            deviceId: parsed.data.deviceId
          }
        }
      });

      if (!existing?.operatorName || !existing.isActive || existing.revokedAt) {
        throw new Error("DEVICE_REVOKED");
      }

      const deviceSession = await tx.staffDeviceSession.update({
        where: { id: existing.id },
        data: {
          role: access.membership.role,
          onShift,
          lastSeenAt: now,
          startedAt: onShift ? now : undefined,
          endedAt: onShift ? null : now
        }
      });

      await tx.pushSubscription.updateMany({
        where: {
          restaurantId: access.restaurant.id,
          userId: access.user.id,
          deviceId: parsed.data.deviceId
        },
        data: {
          onShift,
          isActive: onShift ? true : undefined,
          lastShiftStartedAt: onShift ? now : undefined,
          lastShiftEndedAt: onShift ? null : now
        }
      });

      await tx.auditLog.create({
        data: {
          restaurantId: access.restaurant.id,
          userId: access.user.id,
          action: onShift ? "SHIFT_STARTED" : "SHIFT_ENDED",
          entityType: "StaffDeviceSession",
          entityId: deviceSession.id,
          metadataJson: {
            deviceId: parsed.data.deviceId,
            role: access.membership.role,
            onShift
          }
        }
      });

      return deviceSession;
    });

    return NextResponse.json({ ok: true, onShift: session.onShift });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_REVOKED") {
      return NextResponse.json({ ok: false, code: "DEVICE_REVOKED", error: "Thiết bị này đã bị quản lý khóa." }, { status: 403 });
    }
    throw error;
  }
}
