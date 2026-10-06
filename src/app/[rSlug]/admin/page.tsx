import { AppHeader } from "@/components/app-shell/app-header";
import { StatCard } from "@/components/ui/stat-card";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRestaurantAdminOverview } from "@/server/services/restaurant-service";

export default async function RestaurantAdminPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const overview = await getRestaurantAdminOverview(access.restaurant.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title={access.restaurant.name}
        subtitle={`Admin dashboard · role ${access.membership.role}`}
      />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Categories" value={overview.categories} />
        <StatCard label="Products" value={overview.products} />
        <StatCard label="Tables" value={overview.tables} />
        <StatCard label="Staff" value={overview.staff} />
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-10">
        <div className="rounded-lg border bg-white p-5">
          <h2 className="text-lg font-semibold">Phase 1 ready</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Tenant, auth, roles, seed data, and server-side access checks are wired.
            Menu, tables, QR, and ordering screens are intentionally reserved for later phases.
          </p>
        </div>
      </section>
    </main>
  );
}
