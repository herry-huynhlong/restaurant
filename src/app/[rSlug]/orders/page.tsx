import { CustomerShell } from "@/components/app-shell/customer-shell";
import { CustomerBillClient } from "@/components/customer/customer-bill-client";
import { requireCustomerPageContext } from "@/server/services/customer-page-context";

export default async function CustomerOrdersPage({ params }: { params: { rSlug: string } }) {
  const { restaurant, customerSession, diningSession } = await requireCustomerPageContext(params.rSlug);
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={diningSession.table.name} customerName={customerSession.customerName} plan={restaurant.plan} businessType={restaurant.businessType}>
      <CustomerBillClient slug={restaurant.slug} mode="orders" />
    </CustomerShell>
  );
}
