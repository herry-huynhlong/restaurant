"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Grid3X3, Home, ListOrdered, Menu, Settings, Trophy, Users, X } from "lucide-react";

export type AdminMobileNavIcon = "home" | "menu" | "tables" | "orders" | "staff" | "top-items" | "reports" | "settings";

export type AdminMobileNavItem = {
  label: string;
  href: string;
  icon: AdminMobileNavIcon;
};

const icons: Record<AdminMobileNavIcon, typeof Home> = {
  home: Home,
  menu: Menu,
  tables: Grid3X3,
  orders: ListOrdered,
  staff: Users,
  "top-items": Trophy,
  reports: BarChart3,
  settings: Settings
};

export function AdminMobileMenu({
  restaurantName,
  roleLabel,
  planLabel,
  planBadgeClass,
  userName,
  items
}: {
  restaurantName: string;
  roleLabel: string;
  planLabel: string;
  planBadgeClass: string;
  userName: string;
  items: AdminMobileNavItem[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-white text-slate-900 shadow-sm hover:bg-slate-50 md:hidden"
        type="button"
        aria-label="Mở menu quản trị"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu quản trị">
          <button
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/45"
            type="button"
            aria-label="Đóng menu quản trị"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[min(20rem,86vw)] flex-col overflow-y-auto bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-teal-700">{restaurantName}</p>
                <p className="mt-1 text-sm text-slate-600">{roleLabel}</p>
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${planBadgeClass}`}>
                  {planLabel}
                </span>
              </div>
              <button
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white hover:bg-slate-50"
                type="button"
                aria-label="Đóng menu quản trị"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="mt-5 space-y-1">
              {items.map((item) => {
                const Icon = icons[item.icon];
                return (
                  <Link
                    key={item.href}
                    className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-slate-900 hover:bg-slate-100"
                    href={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto border-t pt-4">
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <p className="truncate font-medium">{userName}</p>
                <p className="text-xs text-slate-500">{roleLabel}</p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
