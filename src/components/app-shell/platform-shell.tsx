import Link from "next/link";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { platformRoutes } from "@/lib/routes";

const navItems = [
  ["Tổng quan", platformRoutes.dashboard],
  ["Nhà hàng", platformRoutes.restaurants],
  ["Gói dịch vụ", platformRoutes.plans],
  ["Tài khoản chủ quán", platformRoutes.owners],
  ["Hoạt động hệ thống", platformRoutes.activity],
  ["Cài đặt nền tảng", platformRoutes.settings]
] as const;

export function PlatformShell({
  children,
  title,
  action
}: {
  children: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-60 shrink-0 rounded-lg border bg-white p-3 shadow-sm md:block">
          <p className="px-3 py-2 text-sm font-semibold text-teal-700">Platform Admin</p>
          <nav className="mt-2 space-y-1">
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
              <p className="mt-1 text-sm text-slate-600">Quản trị SaaS đa nhà hàng</p>
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
