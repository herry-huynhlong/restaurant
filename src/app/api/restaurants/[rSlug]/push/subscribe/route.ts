import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  }),
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
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: {
      userId: access.user.id,
      restaurantId: access.restaurant.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      deviceName: parsed.data.deviceName,
      isActive: true
    },
    create: {
      userId: access.user.id,
      restaurantId: access.restaurant.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      deviceName: parsed.data.deviceName
    }
  });

  console.info("[push] subscription saved", {
    restaurantId: access.restaurant.id,
    userId: access.user.id,
    subscriptionId: subscription.id,
    hasEndpoint: Boolean(subscription.endpoint),
    hasKeys: Boolean(subscription.p256dh && subscription.auth)
  });

  return NextResponse.json({ ok: true, subscriptionId: subscription.id });
}
