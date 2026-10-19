import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { CUSTOMER_SESSION_COOKIE, customerSessionCookieName, verifyCustomerSessionValue } from "@/lib/customer-session";
import { normalizeCustomerName } from "@/lib/customer-name";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";
import { canRestaurantOperate } from "@/lib/tenant/restaurant";
import { isRestaurantInMaintenance } from "@/lib/restaurant-maintenance";

export async function getCustomerContext(request: NextRequest, slug: string) {
  const session = verifyCustomerSessionValue(
    request.cookies.get(customerSessionCookieName(slug))?.value
    ?? request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value
  );
  const customerName = normalizeCustomerName(session?.customerName);
  if (!session || !customerName || session.restaurantSlug !== slug) return null;

  const diningSession = await prisma.diningSession.findFirst({
    where: {
      id: session.diningSessionId,
      restaurantId: session.restaurantId,
      tableId: session.tableId,
      ...activeDiningSessionWhere()
    },
    include: {
      table: true,
      restaurant: true
    }
  });

  if (!diningSession || !diningSession.table.isActive) {
    return null;
  }

  if (await isRestaurantInMaintenance(diningSession.restaurantId)) {
    return null;
  }

  if (!(await canRestaurantOperate({
    restaurantStatus: diningSession.restaurant.status,
    subscriptionStatus: diningSession.restaurant.subscriptionStatus,
    subscriptionEnd: diningSession.restaurant.subscriptionEnd
  }))) {
    return null;
  }

  return { session: { ...session, customerName }, diningSession, restaurant: diningSession.restaurant, table: diningSession.table };
}
