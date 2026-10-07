import Link from "next/link";
import type { RestaurantRole } from "@prisma/client";
import { BarChart3, Bell, CreditCard, Grid3X3, Home, ListOrdered, Menu as MenuIcon, Settings, Users } from "lucide-react";
import type { Notification } from "@prisma/client";
import { InstallAppButton } from "@/components/app-shell/install-app-button";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { PushNotificationButton } from "@/components/app-shell/push-notification-button";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { restaurantRoutes } from "@/lib/routes";

export function RestaurantAdminShell({
  slug,
  restaurantName,
  role,
  children,
  title
  ,
  userName,
  notifications = []
}: {
  slug: string;
  restaurantName: string;
  role: RestaurantRole;
  children: React.ReactNode;
  title: string;
  userName?: string | null;
  notifications?: Notification[];
}) {
  const navItems = [
    ["Tổng quan", restaurantRoutes.admin(slug), Home],
    ["Menu", restaurantRoutes.adminMenu(slug), MenuIcon],
    ["Khu vực & Bàn", restaurantRoutes.adminTables(slug), Grid3X3],
    ["Order", restaurantRoutes.adminOrders(slug), ListOrdered],
    ["Nhân viên", restaurantRoutes.adminStaff(slug), Users],
    ["Thanh toán", restaurantRoutes.adminPayments(slug), CreditCard],
    ["Báo cáo", restaurantRoutes.adminReports(slug), BarChart3],
    ["Cài đặt", restaurantRoutes.adminSettings(slug), Settings]
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-64 shrink-0 rounded-lg border bg-white p-3 shadow-sm md:flex md:min-h-[calc(100vh-3rem)] md:flex-col">
          <p className="px-3 py-2 text-sm font-semibold text-teal-700">{restaurantName}</p>
          <p className="px-3 text-xs text-slate-500">Role: {role}</p>
          <nav className="mt-3 space-y-1">
            {navItems.map(([label, href, Icon]) => (
              <Link key={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100" href={href}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-2 border-t pt-3">
            <InstallAppButton />
            <PushNotificationButton slug={slug} compact />
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium">{userName ?? "User"}</p>
              <p className="text-xs text-slate-500">{role}</p>
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="mt-1 text-sm text-slate-600">{restaurantName} · {role}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <InstallAppButton compact />
              <PushNotificationButton slug={slug} compact />
              <NotificationBell slug={slug} notifications={notifications} />
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50">
                  {userName ?? role} ▼
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border bg-white p-3 shadow-lg">
                  <p className="text-sm font-semibold">{userName ?? "User"}</p>
                  <p className="mb-3 text-xs text-slate-500">{role}</p>
                  <InstallAppButton />
                  <div className="mt-2">
                    <PushNotificationButton slug={slug} compact />
                  </div>
                  <div className="mt-2">
                    <SignOutButton />
                  </div>
                </div>
              </details>
            </div>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
