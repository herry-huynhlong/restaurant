import { Plus } from "lucide-react";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { TablesLivePanel } from "@/components/admin/tables-live-panel";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { hasPlanFeature } from "@/lib/plan/features";
import { createAreaAction, createTableAction } from "@/app/[rSlug]/admin/actions";
import { prisma } from "@/lib/db/prisma";
import { getRecentNotifications } from "@/server/services/notification-service";
import { getAdminTablesState } from "@/server/services/table-state-service";

export default async function TablesPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string; table?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const [areas, notifications, tableState] = await Promise.all([
    prisma.area.findMany({
      where: { restaurantId: access.restaurant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id),
    getAdminTablesState(access.restaurant.id, access.restaurant.slug, baseUrl)
  ]);

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Khu vực & Bàn"
      userName={access.user.name}
      notifications={notifications}
      plan={access.restaurant.plan}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <form className="rounded-lg border bg-white p-4 shadow-sm" action={createAreaAction.bind(null, access.restaurant.slug)}>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Tạo khu vực</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input className="h-10 flex-1 rounded-md border px-3" name="name" placeholder="Tên khu vực, ví dụ Khu A" required />
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tạo khu vực</button>
          </div>
        </form>

        <form className="rounded-lg border bg-white p-4 shadow-sm" action={createTableAction.bind(null, access.restaurant.slug)}>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Tạo bàn</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input className="h-10 rounded-md border px-3" name="name" placeholder="Tên bàn, ví dụ A01" required />
            <select className="h-10 rounded-md border bg-white px-3" name="areaId" required>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tạo bàn</button>
          </div>
        </form>
      </section>

      <TablesLivePanel
        slug={access.restaurant.slug}
        restaurantName={access.restaurant.name}
        cashierName={access.user.name}
        canUsePayment={hasPlanFeature(access.restaurant.plan, "PAYMENT_CONFIRM")}
        initialState={tableState}
        initialSelectedTableId={searchParams?.table}
      />
    </RestaurantAdminShell>
  );
}
