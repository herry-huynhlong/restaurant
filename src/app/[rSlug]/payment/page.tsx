import { CustomerShell } from "@/components/app-shell/customer-shell";
import { CustomerBillClient } from "@/components/customer/customer-bill-client";
import { hasPlanFeature } from "@/lib/plan/features";
import { requireCustomerPageContext } from "@/server/services/customer-page-context";

export default async function CustomerPaymentPage({ params }: { params: { rSlug: string } }) {
  const { restaurant, customerSession, diningSession } = await requireCustomerPageContext(params.rSlug);
  if (!hasPlanFeature(restaurant.plan, "PAYMENT_REQUEST", restaurant.businessType)) {
    return (
      <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={diningSession.table.name} customerName={customerSession.customerName} plan={restaurant.plan} businessType={restaurant.businessType}>
        <section className="rounded-lg border bg-white p-5 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Chưa hỗ trợ thanh toán tại bàn</h2>
          <p className="mt-2 text-sm text-slate-600">Vui lòng gọi nhân viên để được hỗ trợ.</p>
        </section>
      </CustomerShell>
    );
  }
  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={diningSession.table.name} customerName={customerSession.customerName} plan={restaurant.plan} businessType={restaurant.businessType}>
      <CustomerBillClient slug={restaurant.slug} mode="payment" />
    </CustomerShell>
  );
}
