import { redirect } from "next/navigation";
import { getCustomerSessionCookie } from "@/lib/customer-session";
import { prisma } from "@/lib/db/prisma";
import { restaurantRoutes } from "@/lib/routes";
import { getRestaurantBySlug, canRestaurantOperate } from "@/lib/tenant/restaurant";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

export async function requireCustomerPageContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  const customerSession = getCustomerSessionCookie();

  if (!canRestaurantOperate({
    restaurantStatus: restaurant.status,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionEnd: restaurant.subscriptionEnd
  })) {
    redirect(`${restaurantRoutes.welcome(restaurant.slug)}?error=${encodeURIComponent("Nhà hàng hiện tạm ngừng hoạt động.")}`);
  }

  if (!customerSession || customerSession.restaurantId !== restaurant.id || customerSession.restaurantSlug !== restaurant.slug) {
    redirect(restaurantRoutes.welcome(restaurant.slug));
  }

  const diningSession = await prisma.diningSession.findFirst({
    where: {
      id: customerSession.diningSessionId,
      restaurantId: restaurant.id,
      tableId: customerSession.tableId,
      ...activeDiningSessionWhere()
    },
    include: { table: true }
  });

  if (!diningSession || !diningSession.table.isActive || diningSession.table.qrToken !== customerSession.qrToken) {
    redirect(`${restaurantRoutes.welcome(restaurant.slug)}?t=${encodeURIComponent(customerSession.qrToken)}&error=${encodeURIComponent("Phiên gọi món không hợp lệ. Vui lòng nhập lại tên.")}`);
  }

  return { restaurant, customerSession, diningSession };
}
