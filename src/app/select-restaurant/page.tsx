import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireAuthenticatedUser } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";

export default async function SelectRestaurantPage() {
  const user = await requireAuthenticatedUser();
  const memberships = await prisma.restaurantUser.findMany({
    where: { userId: user.id, isActive: true },
    include: { restaurant: true },
    orderBy: { createdAt: "asc" }
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-xl rounded-lg border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Chọn nhà hàng</h1>
        <div className="mt-4 space-y-2">
          {memberships.map((membership) => (
            <Link
              key={membership.id}
              className="block rounded-md border px-4 py-3 text-sm hover:bg-slate-50"
              href={membership.role === "WAITER" ? restaurantRoutes.staff(membership.restaurant.slug) : membership.role === "KITCHEN" ? restaurantRoutes.kitchen(membership.restaurant.slug) : membership.role === "CASHIER" ? restaurantRoutes.cashier(membership.restaurant.slug) : restaurantRoutes.admin(membership.restaurant.slug)}
            >
              {membership.restaurant.name} · {membership.role}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
