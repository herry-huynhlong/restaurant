import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { getRecentNotifications } from "@/server/services/notification-service";
import { ensureSimpleMenuCategories, typeFromCategoryName } from "@/server/services/simple-menu-service";
import { SimpleMenuManager } from "@/components/admin/simple-menu-manager";

export default async function MenuPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  await ensureSimpleMenuCategories(access.restaurant.id);

  const [products, notifications] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId: access.restaurant.id },
      include: { category: true },
      orderBy: [{ sortOrder: "asc" }, { nameVi: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Menu" userName={access.user.name} notifications={notifications}>
      <SimpleMenuManager
        slug={access.restaurant.slug}
        initialProducts={products.map((product) => ({
          id: product.id,
          categoryId: product.categoryId,
          menuType: typeFromCategoryName(product.category.nameVi),
          nameVi: product.nameVi,
          descriptionVi: product.descriptionVi,
          imageUrl: product.imageUrl,
          price: product.price,
          isActive: product.isActive,
          isSoldOut: product.isSoldOut,
          isFeatured: product.isFeatured
        }))}
      />
    </RestaurantAdminShell>
  );
}
