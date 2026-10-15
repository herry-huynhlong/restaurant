"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { customerGreeting } from "@/lib/customer-name";
import { restaurantRoutes } from "@/lib/routes";

type CustomerLocale = "vi" | "en";

export function CustomerHeaderNav({
  slug,
  restaurantName,
  tableName,
  customerName,
  canUsePayment
}: {
  slug: string;
  restaurantName: string;
  tableName?: string;
  customerName?: string;
  canUsePayment: boolean;
}) {
  const storageKey = `customer_locale_${slug}`;
  const [locale, setLocale] = useState<CustomerLocale>("vi");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(storageKey);
    if (savedLocale === "en") setLocale("en");
  }, [storageKey]);

  function selectLocale(nextLocale: CustomerLocale) {
    setLocale(nextLocale);
    window.localStorage.setItem(storageKey, nextLocale);
  }

  const labels = locale === "en"
    ? { table: "Table", menu: "Menu", orders: "Ordered", payment: "Payment" }
    : { table: "Bàn", menu: "Menu", orders: "Đã gọi", payment: "Thanh toán" };
  const navColumns = canUsePayment ? "grid-cols-3" : "grid-cols-2";

  return (
    <>
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{restaurantName}</h1>
            {tableName ? <p className="text-sm text-slate-600">{labels.table} {tableName}</p> : null}
            <p className="text-sm text-teal-700">{customerGreeting(customerName, locale)}</p>
          </div>
          <div aria-label="Ngôn ngữ" className="flex shrink-0 rounded-md border p-0.5 text-sm">
            <button className={`rounded px-2 py-1 font-medium ${locale === "vi" ? "bg-teal-700 text-white" : "text-slate-600"}`} type="button" onClick={() => selectLocale("vi")}>VI</button>
            <button className={`rounded px-2 py-1 font-medium ${locale === "en" ? "bg-teal-700 text-white" : "text-slate-600"}`} type="button" onClick={() => selectLocale("en")}>EN</button>
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)]">
        <div className={`mx-auto grid max-w-md ${navColumns} text-center text-xs`}>
          <Link className="px-2 py-3" href={restaurantRoutes.menu(slug)}>{labels.menu}</Link>
          <Link className="px-2 py-3" href={restaurantRoutes.orders(slug)}>{labels.orders}</Link>
          {canUsePayment ? <Link className="px-2 py-3" href={restaurantRoutes.payment(slug)}>{labels.payment}</Link> : null}
        </div>
      </nav>
    </>
  );
}
