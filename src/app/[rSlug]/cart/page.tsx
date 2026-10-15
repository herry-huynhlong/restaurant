import { CustomerShell } from "@/components/app-shell/customer-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCustomerPageContext } from "@/server/services/customer-page-context";

export default async function CustomerCartPage({ params }: { params: { rSlug: string } }) {
  const { restaurant, customerSession, diningSession } = await requireCustomerPageContext(params.rSlug);
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={diningSession.table.name} customerName={customerSession.customerName} plan={restaurant.plan} planEntitlement={restaurant.planEntitlement} businessType={restaurant.businessType}>
      <EmptyState title="Giỏ hàng trống" description="Vui lòng quay lại Menu để chọn món." />
    </CustomerShell>
  );
}
