import { CustomerShell } from "@/components/app-shell/customer-shell";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export default async function TenantLockedPage({ params }: { params: { rSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.rSlug);

  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} plan={restaurant.plan}>
      <section className="rounded-lg border bg-white p-5 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Nhà hàng hiện đang bị khóa.</h1>
        <p className="mt-2 text-sm text-slate-600">Vui lòng liên hệ quản trị hệ thống.</p>
      </section>
    </CustomerShell>
  );
}
