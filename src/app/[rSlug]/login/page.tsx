import { notFound } from "next/navigation";
import { RestaurantLoginForm } from "@/components/app-shell/restaurant-login-form";
import { prisma } from "@/lib/db/prisma";

const roleLoginLabels: Record<string, string> = {
  WAITER: "phục vụ",
  KITCHEN: "bếp",
  CASHIER: "thu ngân",
  MANAGER: "quản lý",
  OWNER: "chủ quán"
};

export default async function RestaurantLoginPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { role?: string };
}) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.rSlug },
    select: { name: true, slug: true, status: true }
  });

  if (!restaurant) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-teal-700">{restaurant.name}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Đăng nhập {roleLoginLabels[searchParams?.role ?? ""] ?? "nhân viên"}</h1>
          <p className="mt-2 text-sm text-slate-600">Dùng tên đăng nhập do chủ quán hoặc quản lý tạo.</p>
        </div>
        {restaurant.status === "ACTIVE" ? (
          <RestaurantLoginForm slug={restaurant.slug} />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Nhà hàng hiện đang bị khóa. Vui lòng liên hệ quản trị hệ thống.
          </div>
        )}
      </section>
    </main>
  );
}
