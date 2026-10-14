import Link from "next/link";
import type { RestaurantRole } from "@prisma/client";
import { BarChart3, CreditCard, Grid3X3, Home, ListOrdered, Menu as MenuIcon, Settings, Store, Trophy, Users } from "lucide-react";
import type { Notification } from "@prisma/client";
import { InstallAppButton } from "@/components/app-shell/install-app-button";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { NotificationAudioUnlocker } from "@/components/app-shell/notification-audio-unlocker";
import { NotificationEnableButton } from "@/components/app-shell/notification-enable-button";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { AdminMobileMenu, type AdminMobileNavIcon } from "@/components/app-shell/admin-mobile-menu";
import { hasPlanFeature, planDisplayLabel } from "@/lib/plan/features";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { restaurantRoutes } from "@/lib/routes";

type AdminNavItem = {
  label: string;
  href: string;
  Icon: typeof Home;
  icon: AdminMobileNavIcon;
};

export function RestaurantAdminShell({
  slug,
  restaurantName,
  role,
  children,
  title,
  userName,
  notifications = [],
  plan = "BASIC",
  planEntitlement = "BASIC",
  businessType = "RESTAURANT",
  logoUrl
}: {
  slug: string;
  restaurantName: string;
  role: RestaurantRole;
  children: React.ReactNode;
  title: string;
  userName?: string | null;
  notifications?: Notification[];
  plan?: string | null;
  planEntitlement?: string | null;
  businessType?: string | null;
  logoUrl?: string | null;
}) {
  const roleLabel = getRoleLabel(role);
  const planLabel = planDisplayLabel(plan, planEntitlement);
  const effectivePlanTone = plan === "PRO" || plan === "TRAIN" && planEntitlement === "PRO" ? "PRO" : "BASIC";
  const planBadgeClass = effectivePlanTone === "PRO"
    ? "border-amber-200 bg-[#fff8e7] text-amber-900"
    : "border-slate-200 bg-slate-50 text-slate-700";
  const displayUserName = userName?.trim() || roleLabel;
  const reportNavItems: AdminNavItem[] = hasPlanFeature(plan, "REPORTS", businessType, planEntitlement)
    ? [{ label: "Báo cáo", href: restaurantRoutes.adminReports(slug), Icon: BarChart3, icon: "reports" }]
    : [];
  const navItems: AdminNavItem[] = [
    { label: "Tổng quan", href: restaurantRoutes.admin(slug), Icon: Home, icon: "home" },
    { label: "Menu", href: restaurantRoutes.adminMenu(slug), Icon: MenuIcon, icon: "menu" },
    { label: "Khu vực & Bàn", href: restaurantRoutes.adminTables(slug), Icon: Grid3X3, icon: "tables" },
    { label: "Order", href: restaurantRoutes.adminOrders(slug), Icon: ListOrdered, icon: "orders" },
    { label: "Nhân viên", href: restaurantRoutes.adminStaff(slug), Icon: Users, icon: "staff" },
    { label: "Top món", href: restaurantRoutes.adminTopItems(slug), Icon: Trophy, icon: "top-items" },
    ...reportNavItems,
    { label: "Đăng ký gói", href: restaurantRoutes.adminSubscription(slug), Icon: CreditCard, icon: "settings" },
    { label: "Cài đặt", href: restaurantRoutes.adminSettings(slug), Icon: Settings, icon: "settings" }
  ];
  const mobileNavItems = navItems.map(({ label, href, icon }) => ({ label, href, icon }));

  return (
    <main className="min-h-screen bg-slate-50">
      <NotificationAudioUnlocker />
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border bg-white p-3 shadow-sm md:flex md:min-h-[calc(100vh-3rem)] md:flex-col">
          <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-teal-700 text-base font-semibold text-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logoUrl ? <img alt={`Logo ${restaurantName}`} className="h-full w-full object-cover" src={logoUrl} /> : <Store className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-teal-900">{restaurantName}</p>
                <p className="mt-0.5 text-xs text-slate-600">{roleLabel}</p>
              </div>
            </div>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${planBadgeClass}`}>
              {planLabel}
            </span>
          </div>
          <nav className="mt-3 space-y-1">
            {navItems.map(({ label, href, Icon }) => {
              const isActive = title === label || (title === "Tổng quan kinh doanh" && label === "Tổng quan");

              return (
                <Link
                  key={href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-l-4 border-teal-700 bg-teal-50 text-teal-900"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                  href={href}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-2 border-t pt-3">
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium">{displayUserName}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <AdminMobileMenu
                restaurantName={restaurantName}
                roleLabel={roleLabel}
                planLabel={planLabel}
                planBadgeClass={planBadgeClass}
                userName={displayUserName}
                items={mobileNavItems}
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="mt-1 text-sm text-slate-600">{restaurantName} · {roleLabel}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <InstallAppButton compact />
              <NotificationEnableButton slug={slug} />
              <NotificationBell slug={slug} notifications={notifications} />
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50">
                  {displayUserName} ▼
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border bg-white p-3 shadow-lg">
                  <p className="text-sm font-semibold">{displayUserName}</p>
                  <p className="mb-3 text-xs text-slate-500">{roleLabel}</p>
                  <SignOutButton />
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
