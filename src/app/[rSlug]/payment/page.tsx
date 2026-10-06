import { CustomerShell } from "@/components/app-shell/customer-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export default async function CustomerPaymentPage({ params }: { params: { rSlug: string } }) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name}>
      <EmptyState title="Thanh toán" description="Cash và QR payment request sẽ được triển khai ở Phase 6." />
    </CustomerShell>
  );
}
