import { prisma } from "@/lib/db/prisma";

export async function getRestaurantAdminOverview(restaurantId: string) {
  const [categories, products, tables, staff] = await Promise.all([
    prisma.category.count({ where: { restaurantId } }),
    prisma.product.count({ where: { restaurantId } }),
    prisma.restaurantTable.count({ where: { restaurantId } }),
    prisma.restaurantUser.count({ where: { restaurantId, isActive: true } })
  ]);

  return {
    categories,
    products,
    tables,
    staff
  };
}
