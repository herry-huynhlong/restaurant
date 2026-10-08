import Link from "next/link";
import { restaurantRoutes } from "@/lib/routes";
import { hasPlanFeature } from "@/lib/plan/features";

export function CustomerShell({
  slug,
  restaurantName,
  tableName,
  customerName,
  plan,
  children
}: {
  slug: string;
  restaurantName: string;
  tableName?: string;
  customerName?: string;
  plan?: string | null;
  children: React.ReactNode;
}) {
  const canUsePayment = hasPlanFeature(plan, "CASHIER_FLOW");
  const navColumns = canUsePayment ? "grid-cols-3" : "grid-cols-2";

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold">{restaurantName}</h1>
            {tableName ? <p className="text-sm text-slate-600">Bàn {tableName}</p> : null}
            {customerName ? <p className="text-sm text-teal-700">Xin chào, {customerName}</p> : null}
          </div>
          <div className="flex rounded-md border text-sm">
            <span className="px-2 py-1 font-medium">VI</span>
            <span className="border-l px-2 py-1">EN</span>
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-md px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</section>
      <nav className="fixed inset-x-0 bottom-0 border-t bg-white pb-[env(safe-area-inset-bottom)]">
        <div className={`mx-auto grid max-w-md ${navColumns} text-center text-xs`}>
          <Link className="px-2 py-3" href={restaurantRoutes.menu(slug)}>Menu</Link>
          <Link className="px-2 py-3" href={restaurantRoutes.orders(slug)}>Đã gọi</Link>
          {canUsePayment ? <Link className="px-2 py-3" href={restaurantRoutes.payment(slug)}>Thanh toán</Link> : null}
        </div>
      </nav>
    </main>
  );
}
