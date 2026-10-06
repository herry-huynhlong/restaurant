import Link from "next/link";
import { restaurantRoutes } from "@/lib/routes";

export function CustomerShell({
  slug,
  restaurantName,
  tableName,
  customerName,
  children
}: {
  slug: string;
  restaurantName: string;
  tableName?: string;
  customerName?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold">{restaurantName}</h1>
            {tableName ? <p className="text-sm text-slate-600">Bàn {tableName}</p> : null}
            {customerName ? <p className="text-sm text-teal-700">Xin chào, {customerName}</p> : null}
          </div>
          <div className="flex rounded-md border text-sm">
            <span className="px-2 py-1 font-medium">VI</span>
            <span className="border-l px-2 py-1">EN</span>
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-md px-4 py-6">{children}</section>
      <nav className="fixed inset-x-0 bottom-0 border-t bg-white">
        <div className="mx-auto grid max-w-md grid-cols-4 text-center text-xs">
          <Link className="px-2 py-3" href={restaurantRoutes.menu(slug)}>Menu</Link>
          <Link className="px-2 py-3" href={restaurantRoutes.orders(slug)}>Đã gọi</Link>
          <Link className="px-2 py-3" href={restaurantRoutes.welcome(slug)}>Gọi NV</Link>
          <Link className="px-2 py-3" href={restaurantRoutes.cart(slug)}>Giỏ hàng</Link>
        </div>
      </nav>
    </main>
  );
}
