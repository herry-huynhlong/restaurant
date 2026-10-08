import { CustomerShell } from "@/components/app-shell/customer-shell";
import { getRestaurantBySlug, canRestaurantOperate } from "@/lib/tenant/restaurant";
import { prisma } from "@/lib/db/prisma";
import { startCustomerSessionAction } from "@/app/[rSlug]/welcome/actions";

export default async function WelcomePage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { t?: string; error?: string };
}) {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  const qrToken = searchParams?.t?.trim() ?? "";
  const canOperate = canRestaurantOperate({
    restaurantStatus: restaurant.status,
    subscriptionStatus: restaurant.subscriptionStatus,
    subscriptionEnd: restaurant.subscriptionEnd
  });
  const table = qrToken
    ? await prisma.restaurantTable.findFirst({
        where: { restaurantId: restaurant.id, qrToken }
      })
    : null;
  const canUseTable = Boolean(table?.isActive);
  const errorMessage = searchParams?.error ?? (!qrToken ? "QR không hợp lệ." : !table ? "QR không hợp lệ." : !canUseTable ? "Bàn này hiện không hoạt động." : null);
  const startAction = startCustomerSessionAction.bind(null, restaurant.slug);

  return (
    <CustomerShell slug={restaurant.slug} restaurantName={restaurant.name} tableName={table?.name} plan={restaurant.plan}>
      {!canOperate ? (
        <BlockedMessage />
      ) : errorMessage ? (
        <ErrorMessage message={errorMessage} />
      ) : (
        <form className="rounded-lg border bg-white p-5 shadow-sm" action={startAction}>
          <input name="qrToken" type="hidden" value={qrToken} />
          <p className="text-sm font-medium text-teal-700">Chào mừng / Welcome</p>
          <h2 className="mt-2 text-2xl font-semibold">{restaurant.name}</h2>
          {table ? <p className="mt-1 text-slate-600">Bàn {table.name}</p> : null}
          <label className="mt-5 block text-sm font-medium">
            Tên của bạn / Your name
            <input className="mt-1 h-11 w-full rounded-md border px-3" name="customerName" maxLength={80} required />
          </label>
          <button className="mt-4 h-11 w-full rounded-md bg-teal-700 text-sm font-semibold text-white" type="submit">
            Bắt đầu gọi món
          </button>
        </form>
      )}
    </CustomerShell>
  );
}

function BlockedMessage() {
  return (
    <section className="rounded-lg border bg-white p-5 text-center shadow-sm">
      <h2 className="text-lg font-semibold">Nhà hàng hiện tạm ngừng hoạt động.</h2>
      <p className="mt-2 text-sm text-slate-600">Vui lòng liên hệ nhân viên để được hỗ trợ.</p>
    </section>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-red-200 bg-white p-5 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-red-700">{message}</h2>
      <p className="mt-2 text-sm text-slate-600">Vui lòng quét lại QR trên bàn hoặc liên hệ nhân viên.</p>
    </section>
  );
}
