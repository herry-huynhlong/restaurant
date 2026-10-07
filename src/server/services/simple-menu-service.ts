import { prisma } from "@/lib/db/prisma";

export type SimpleMenuType = "MAIN" | "EXTRA" | "DRINK";

export const simpleMenuTypes: Array<{ type: SimpleMenuType; nameVi: string; sortOrder: number }> = [
  { type: "MAIN", nameVi: "Món chính", sortOrder: 0 },
  { type: "EXTRA", nameVi: "Món thêm", sortOrder: 1 },
  { type: "DRINK", nameVi: "Nước", sortOrder: 2 }
];

export function typeFromCategoryName(name: string): SimpleMenuType {
  const normalized = name.toLowerCase();
  if (normalized.includes("nước") || normalized.includes("nuoc") || normalized.includes("uống") || normalized.includes("drink")) {
    return "DRINK";
  }
  if (normalized.includes("thêm") || normalized.includes("them") || normalized.includes("extra")) {
    return "EXTRA";
  }
  return "MAIN";
}

export function categoryNameFromType(type: SimpleMenuType) {
  return simpleMenuTypes.find((item) => item.type === type)?.nameVi ?? "Món chính";
}

export async function ensureSimpleMenuCategories(restaurantId: string) {
  for (const item of simpleMenuTypes) {
    await prisma.category.upsert({
      where: {
        restaurantId_nameVi: {
          restaurantId,
          nameVi: item.nameVi
        }
      },
      update: {
        isActive: true,
        sortOrder: item.sortOrder
      },
      create: {
        restaurantId,
        nameVi: item.nameVi,
        sortOrder: item.sortOrder,
        isActive: true
      }
    });
  }

  return prisma.category.findMany({
    where: {
      restaurantId,
      nameVi: { in: simpleMenuTypes.map((item) => item.nameVi) }
    },
    orderBy: [{ sortOrder: "asc" }, { nameVi: "asc" }]
  });
}

export async function getCategoryIdForSimpleMenuType(restaurantId: string, type: SimpleMenuType) {
  const categories = await ensureSimpleMenuCategories(restaurantId);
  const category = categories.find((item) => item.nameVi === categoryNameFromType(type)) ?? categories[0];
  return category.id;
}
