import { CustomerShell } from "@/components/app-shell/customer-shell";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export default async function TenantLockedPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { maintenance?: string };
}) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  const isMaintenance = searchParams?.maintenance === "1";

  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} plan={restaurant.plan} planEntitlement={restaurant.planEntitlement} businessType={restaurant.businessType}>
      <section className="rounded-lg border bg-white p-5 text-center shadow-sm">
        <h1 className="text-lg font-semibold">{isMaintenance ? "Cửa hàng đang được bảo trì dữ liệu." : "Nhà hàng hiện đang bị khóa."}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {isMaintenance ? "Vui lòng thử lại sau ít phút." : "Vui lòng liên hệ quản trị hệ thống."}
        </p>
      </section>
    </CustomerShell>
  );
}
