import { CustomerShell } from "@/components/app-shell/customer-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export default async function CustomerCartPage({ params }: { params: { rSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} plan={restaurant.plan}>
      <EmptyState title="Giỏ hàng trống" description="Vui lòng quay lại Menu để chọn món." />
    </CustomerShell>
  );
}
