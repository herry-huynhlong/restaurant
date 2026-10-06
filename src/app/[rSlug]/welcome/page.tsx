import { CustomerShell } from "@/components/app-shell/customer-shell";
import { getRestaurantBySlug, canRestaurantOperate } from "@/lib/tenant/restaurant";

export default async function WelcomePage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { table?: string };
}) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  const canOperate = canRestaurantOperate({
    restaurantStatus: restaurant.status,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionEnd: restaurant.subscriptionEnd
  });

  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={searchParams?.table}>
      {!canOperate ? (
        <BlockedMessage />
      ) : (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-teal-700">Chào mừng / Welcome</p>
          <h2 className="mt-2 text-2xl font-semibold">{restaurant.name}</h2>
          {searchParams?.table ? <p className="mt-1 text-slate-600">Bàn {searchParams.table}</p> : null}
          <label className="mt-5 block text-sm font-medium">
            Tên của bạn / Your name
            <input className="mt-1 h-11 w-full rounded-md border px-3" required />
          </label>
          <button className="mt-4 h-11 w-full rounded-md bg-teal-700 text-sm font-semibold text-white" type="button">
            Vào menu
          </button>
        </section>
      )}
    </CustomerShell>
  );
}

function BlockedMessage() {
  return (
    <section className="rounded-lg border bg-white p-5 text-center shadow-sm">
      <h2 className="text-lg font-semibold">Nhà hàng hiện chưa nhận đơn</h2>
      <p className="mt-2 text-sm text-slate-600">Vui lòng liên hệ nhân viên để được hỗ trợ.</p>
    </section>
  );
}
