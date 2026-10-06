import { CustomerShell } from "@/components/app-shell/customer-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export default async function CustomerMenuPage({ params }: { params: { rSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name}>
      <EmptyState title="Menu đang được chuẩn bị" description="Màn menu/cart sẽ được triển khai ở Phase 3." />
    </CustomerShell>
  );
}
