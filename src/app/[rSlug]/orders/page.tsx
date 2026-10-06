import { CustomerShell } from "@/components/app-shell/customer-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export default async function CustomerOrdersPage({ params }: { params: { rSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name}>
      <EmptyState title="Chưa có món đã gọi" description="Lịch sử order theo dining session sẽ có ở Phase 4." />
    </CustomerShell>
  );
}
