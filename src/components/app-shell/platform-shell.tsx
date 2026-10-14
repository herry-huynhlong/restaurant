import Link from "next/link";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { PlatformMobileMenu } from "@/components/app-shell/platform-mobile-menu";
import { PendingSubscriptionBadge } from "@/components/platform/pending-subscription-badge";
import { productBrand } from "@/lib/brand";
import { platformRoutes } from "@/lib/routes";
import { getPendingSubscriptionRequestCount } from "@/server/services/platform-service";

const navItems = [
  ["Tổng quan", platformRoutes.dashboard],
  ["Nhà hàng", platformRoutes.restaurants],
  ["Gói dịch vụ", platformRoutes.plans],
  ["Tài khoản chủ quán", platformRoutes.owners],
  ["Tài nguyên & Sao lưu", platformRoutes.storage],
  ["Hoạt động hệ thống", platformRoutes.activity],
  ["Cài đặt nền tảng", platformRoutes.settings]
] as const;

export async function PlatformShell({
  children,
  title,
  action,
  subtitle = productBrand.platformSubtitle
}: {
  children: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  subtitle?: string;
}) {
  const pendingSubscriptionRequestCount = await getPendingSubscriptionRequestCount();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-60 shrink-0 rounded-lg border bg-white p-3 shadow-sm md:block">
          <p className="px-3 py-2 text-sm font-semibold text-teal-700">{productBrand.adminName}</p>
          <nav className="mt-2 space-y-1">
            {navItems.map(([label, href]) => (
              <Link key={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100" href={href}>
                <span>{label}</span>
                {href === platformRoutes.restaurants ? <PendingSubscriptionBadge initialCount={pendingSubscriptionRequestCount} /> : null}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <PlatformMobileMenu pendingSubscriptionRequestCount={pendingSubscriptionRequestCount} />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {action}
              <SignOutButton />
            </div>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
