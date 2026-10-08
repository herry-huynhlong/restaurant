import { NextResponse } from "next/server";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { sendPushToSubscription } from "@/server/services/web-push-service";

export async function POST(request: Request, { params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"]);
  const body = await request.json().catch(() => ({}));
  const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : undefined;

  const subscription = subscriptionId
    ? await prisma.pushSubscription.findFirst({
        where: {
          id: subscriptionId,
          userId: access.user.id,
          restaurantId: access.restaurant.id,
          isActive: true
        }
      })
    : await prisma.pushSubscription.findFirst({
        where: {
          userId: access.user.id,
          restaurantId: access.restaurant.id,
          isActive: true
        },
        orderBy: { updatedAt: "desc" }
      });

  if (!subscription) {
    return NextResponse.json({ error: "No active subscription for current user/device." }, { status: 404 });
  }

  const result = await sendPushToSubscription(subscription.id, {
    title: "Thông báo thử",
    body: `Thông báo của ${access.restaurant.name} đang hoạt động.`,
    url: `/${access.restaurant.slug}/staff`,
    tag: `test-${access.restaurant.id}`,
    type: "PUSH_TEST"
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
