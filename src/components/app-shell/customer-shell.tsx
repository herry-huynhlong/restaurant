import { hasPlanFeature } from "@/lib/plan/features";
import { CustomerHeaderNav } from "@/components/customer/customer-header-nav";

export function CustomerShell({
  slug,
  restaurantName,
  tableName,
  customerName,
  plan,
  planEntitlement,
  businessType,
  children
}: {
  slug: string;
  restaurantName: string;
  tableName?: string;
  customerName?: string;
  plan?: string | null;
  planEntitlement?: string | null;
  businessType?: string | null;
  children: React.ReactNode;
}) {
  const canUsePayment = hasPlanFeature(plan, "PAYMENT_REQUEST", businessType, planEntitlement);

  return (
    <main className="min-h-screen bg-slate-50">
      <CustomerHeaderNav slug={slug} restaurantName={restaurantName} tableName={tableName} customerName={customerName} canUsePayment={canUsePayment} />
      <section className="mx-auto w-full max-w-md px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</section>
    </main>
  );
}
