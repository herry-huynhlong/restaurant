import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionValue } from "@/lib/customer-session";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

export async function getCustomerContext(request: NextRequest, slug: string) {
  const session = verifyCustomerSessionValue(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session || session.restaurantSlug !== slug) return null;

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

  if (!diningSession || !diningSession.table.isActive || diningSession.table.qrToken !== session.qrToken) {
    return null;
  }

  return { session, diningSession, restaurant: diningSession.restaurant, table: diningSession.table };
}
