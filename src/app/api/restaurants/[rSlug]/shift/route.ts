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

  const session = await prisma.staffDeviceSession.upsert({
    where: {
      restaurantId_userId_deviceId: {
        restaurantId: access.restaurant.id,
        userId: access.user.id,
        deviceId: parsed.data.deviceId
      }
    },
    update: {
      role: access.membership.role,
      lastSeenAt: new Date()
    },
    create: {
      restaurantId: access.restaurant.id,
      userId: access.user.id,
      deviceId: parsed.data.deviceId,
      role: access.membership.role,
      onShift: true
    }
  });

  return NextResponse.json({ ok: true, onShift: session.onShift });
}

export async function POST(request: NextRequest, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, [...shiftRoles]);
  const parsed = shiftSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Yêu cầu ca không hợp lệ." }, { status: 400 });
  }

  const now = new Date();
  const onShift = parsed.data.action === "START";

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
        onShift,
        lastSeenAt: now,
        startedAt: onShift ? now : undefined,
        endedAt: onShift ? null : now
      },
      create: {
        restaurantId: access.restaurant.id,
        userId: access.user.id,
        deviceId: parsed.data.deviceId,
        role: access.membership.role,
        onShift,
        startedAt: now,
        endedAt: onShift ? null : now,
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
}
