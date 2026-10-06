import { CustomerShell } from "@/components/app-shell/customer-shell";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";
import { prisma } from "@/lib/db/prisma";
import { formatVnd } from "@/lib/money";
import { getCustomerSessionCookie } from "@/lib/customer-session";
import { redirect } from "next/navigation";
import { restaurantRoutes } from "@/lib/routes";

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
      status: { in: ["OPEN", "AWAITING_PAYMENT"] }
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
      <section className="space-y-3 pb-20">
        {products.length ? products.map((product) => (
          <article key={product.id} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="h-20 w-20 shrink-0 rounded-md bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {product.imageUrl ? <img alt={product.nameVi} className="h-full w-full rounded-md object-cover" src={product.imageUrl} /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{product.category.nameVi}</p>
                <h2 className="font-semibold">{product.nameVi}</h2>
                {product.descriptionVi ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{product.descriptionVi}</p> : null}
                <div className="mt-2 flex items-center justify-between">
                  <p className="font-semibold text-teal-700">{formatVnd(product.price)}</p>
                  <button className="rounded-md px-3 py-1 text-sm font-semibold text-white disabled:bg-slate-300" style={{ backgroundColor: restaurant.settings?.primaryColor ?? "#0f766e" }} type="button" disabled={product.isSoldOut}>
                    {product.isSoldOut ? "Hết món" : "+"}
                  </button>
                </div>
              </div>
            </div>
          </article>
        )) : (
          <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">Chưa có món ăn</h2>
            <p className="mt-2 text-sm text-slate-600">Nhà hàng đang cập nhật menu.</p>
          </section>
        )}
      </section>
    </CustomerShell>
  );
}
