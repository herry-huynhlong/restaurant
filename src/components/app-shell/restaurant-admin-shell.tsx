import Link from "next/link";
import type { RestaurantRole } from "@prisma/client";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { restaurantRoutes } from "@/lib/routes";

export function RestaurantAdminShell({
  slug,
  restaurantName,
  role,
  children,
  title
}: {
  slug: string;
  restaurantName: string;
  role: RestaurantRole;
  children: React.ReactNode;
  title: string;
}) {
  const navItems = [
    ["Tổng quan", restaurantRoutes.admin(slug)],
    ["Menu", restaurantRoutes.adminMenu(slug)],
    ["Danh mục", restaurantRoutes.adminCategories(slug)],
    ["Khu vực & Bàn", restaurantRoutes.adminTables(slug)],
    ["Order", restaurantRoutes.adminOrders(slug)],
    ["Nhân viên", restaurantRoutes.adminStaff(slug)],
    ["Thanh toán", restaurantRoutes.adminPayments(slug)],
    ["Báo cáo", restaurantRoutes.adminReports(slug)],
    ["Cài đặt", restaurantRoutes.adminSettings(slug)]
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-60 shrink-0 rounded-lg border bg-white p-3 shadow-sm md:block">
          <p className="px-3 py-2 text-sm font-semibold text-teal-700">{restaurantName}</p>
          <p className="px-3 text-xs text-slate-500">Role: {role}</p>
          <nav className="mt-3 space-y-1">
            {navItems.map(([label, href]) => (
              <Link key={href} className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100" href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="mt-1 text-sm text-slate-600">{restaurantName} · {role}</p>
            </div>
            <SignOutButton />
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
