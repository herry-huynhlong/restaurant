import { CustomerShell } from "@/components/app-shell/customer-shell";
import { CustomerMenuClient } from "@/components/customer/customer-menu-client";
import { prisma } from "@/lib/db/prisma";
import { servedUploadUrl } from "@/lib/upload-url";
import { requireCustomerPageContext } from "@/server/services/customer-page-context";

const menuTypeLabels: Record<string, string> = {
  MAIN: "Món chính",
  EXTRA: "Món thêm",
  DRINK: "Nước / Đồ uống"
};

export default async function CustomerMenuPage({ params }: { params: { rSlug: string } }) {
  const { restaurant, customerSession, diningSession } = await requireCustomerPageContext(params.rSlug);

  const products = await prisma.product.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    orderBy: [{ menuType: "asc" }, { sortOrder: "asc" }, { nameVi: "asc" }]
  });
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={diningSession.table.name} customerName={customerSession.customerName}>
      <CustomerMenuClient
        slug={restaurant.slug}
        primaryColor={restaurant.settings?.primaryColor ?? "#0f766e"}
        products={products.map((product) => ({
          id: product.id,
          categoryName: menuTypeLabels[product.menuType] ?? menuTypeLabels.MAIN,
          menuType: product.menuType === "EXTRA" || product.menuType === "DRINK" ? product.menuType : "MAIN",
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
