import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { getRestaurantPostLoginPath } from "@/server/services/auth-redirect-service";
import { RestaurantLoginForm } from "@/components/app-shell/restaurant-login-form";
import { prisma } from "@/lib/db/prisma";
import type { Metadata } from "next";
import { staffPwaContext } from "@/lib/tenant-pwa";
import { buildTenantPwaMetadata, getTenantPwaBranding } from "@/server/services/tenant-pwa-service";

export async function generateMetadata({ params, searchParams }: {
  params: { rSlug: string }; searchParams?: { role?: string };
}): Promise<Metadata> {
  const branding = await getTenantPwaBranding(params.rSlug);
  if (!branding) notFound();
  return buildTenantPwaMetadata(branding, staffPwaContext(searchParams?.role));
}

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
  searchParams?: { role?: string; error?: string; pwa?: string };
}) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.rSlug },
    select: { name: true, slug: true, status: true }
  });

  if (!restaurant) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const path = await getRestaurantPostLoginPath(session.user.id, restaurant.slug);
    if (path !== "/unauthorized") redirect(path);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-teal-700">{restaurant.name}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Đăng nhập {roleLoginLabels[searchParams?.role ?? ""] ?? "nhân viên"}</h1>
          <p className="mt-2 text-sm text-slate-600">{searchParams?.role === "OWNER" ? "Sử dụng email và mật khẩu tài khoản chủ quán của bạn." : "Dùng tên đăng nhập do chủ quán hoặc quản lý tạo."}</p>
        </div>
        {searchParams?.pwa === "1" ? (
          <p className="mb-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
            Phiên đăng nhập chưa có hoặc đã hết hạn trên ứng dụng này. Vui lòng đăng nhập lại bằng tài khoản được cấp; không cần quét lại QR.
          </p>
        ) : null}
        {restaurant.status === "ACTIVE" ? (
          <RestaurantLoginForm slug={restaurant.slug} initialError={searchParams?.error} />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Nhà hàng hiện đang bị khóa. Vui lòng liên hệ quản trị hệ thống.
          </div>
        )}
      </section>
    </main>
  );
}
