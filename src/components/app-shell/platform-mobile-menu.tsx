"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Building2, CreditCard, Home, Menu, Settings, UserRoundCog, X } from "lucide-react";
import { productBrand } from "@/lib/brand";
import { platformRoutes } from "@/lib/routes";

const navItems = [
  { label: "Tổng quan", href: platformRoutes.dashboard, Icon: Home },
  { label: "Nhà hàng", href: platformRoutes.restaurants, Icon: Building2 },
  { label: "Gói dịch vụ", href: platformRoutes.plans, Icon: CreditCard },
  { label: "Tài khoản chủ quán", href: platformRoutes.owners, Icon: UserRoundCog },
  { label: "Hoạt động hệ thống", href: platformRoutes.activity, Icon: Activity },
  { label: "Cài đặt nền tảng", href: platformRoutes.settings, Icon: Settings }
];

export function PlatformMobileMenu() {
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
        aria-label={`Mở menu ${productBrand.adminName}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={`Menu ${productBrand.adminName}`}>
          <button
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/45"
            type="button"
            aria-label={`Đóng menu ${productBrand.adminName}`}
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[min(20rem,86vw)] flex-col overflow-y-auto bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-teal-700">{productBrand.adminName}</p>
                <p className="mt-1 text-sm text-slate-500">{productBrand.platformSubtitle}</p>
              </div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white hover:bg-slate-50"
                type="button"
                aria-label={`Đóng menu ${productBrand.adminName}`}
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="mt-5 space-y-1">
              {navItems.map(({ label, href, Icon }) => (
                <Link
                  key={href}
                  className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-slate-900 hover:bg-slate-100"
                  href={href}
                  onClick={() => setOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
