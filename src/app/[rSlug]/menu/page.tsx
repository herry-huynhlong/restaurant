import { CustomerShell } from "@/components/app-shell/customer-shell";
import { CustomerMenuClient } from "@/components/customer/customer-menu-client";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";
import { prisma } from "@/lib/db/prisma";
import { servedUploadUrl } from "@/lib/upload-url";
import { getCustomerSessionCookie } from "@/lib/customer-session";
import { redirect } from "next/navigation";
import { restaurantRoutes } from "@/lib/routes";
import { activeDiningSessionWhere } from "@/server/services/dining-session-service";

export default async function CustomerMenuPage({ params }: { params: { rSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  const customerSession = getCustomerSessionCookie();

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

  const products = await prisma.product.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    include: { category: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }]
  });
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={diningSession.table.name} customerName={customerSession.customerName}>
      <CustomerMenuClient
        slug={restaurant.slug}
        primaryColor={restaurant.settings?.primaryColor ?? "#0f766e"}
        products={products.map((product) => ({
          id: product.id,
          categoryName: product.category.nameVi,
          nameVi: product.nameVi,
          descriptionVi: product.descriptionVi,
          price: product.price,
          imageUrl: servedUploadUrl(product.imageUrl),
          isSoldOut: product.isSoldOut
        }))}
      />
    </CustomerShell>
  );
}
