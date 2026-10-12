import Link from "next/link";
import { ArrowUpRight, BarChart3, Grid3X3, ListOrdered, Menu as MenuIcon, Sparkles, Store, Trophy, Users } from "lucide-react";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { DashboardLiveOverview } from "@/components/admin/dashboard-live-overview";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { formatInTimeZone } from "@/lib/period";
import { hasPlanFeature } from "@/lib/plan/features";
import { restaurantStatusLabel } from "@/lib/platform/restaurant-status";
import { servedUploadUrl } from "@/lib/upload-url";
import { getRestaurantAdminOverview } from "@/server/services/restaurant-service";

export default async function RestaurantAdminPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const overview = await getRestaurantAdminOverview(access.restaurant.id);
  const logoUrl = servedUploadUrl(overview.restaurant?.logoUrl ?? null);
  const timeZone = overview.restaurant?.timeZone ?? "Asia/Ho_Chi_Minh";
  const todayLabel = formatInTimeZone(new Date(), timeZone, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const quickActions = [
    { label: "Thêm món mới", description: "Cập nhật menu bán hàng", href: restaurantRoutes.adminMenu(access.restaurant.slug), Icon: MenuIcon },
    { label: "Tạo bàn", description: "Quản lý khu vực và QR bàn", href: restaurantRoutes.adminTables(access.restaurant.slug), Icon: Grid3X3 },
    { label: "Xem đơn hàng", description: "Theo dõi order theo bàn", href: restaurantRoutes.adminOrders(access.restaurant.slug), Icon: ListOrdered },
    { label: "Quản lý nhân viên", description: "Tài khoản, ca làm và thiết bị", href: restaurantRoutes.adminStaff(access.restaurant.slug), Icon: Users },
    { label: "Top món", description: "Món bán chạy và doanh thu", href: restaurantRoutes.adminTopItems(access.restaurant.slug), Icon: Trophy },
    ...(hasPlanFeature(access.restaurant.plan, "REPORTS", access.restaurant.businessType)
      ? [{ label: "Xem báo cáo", description: "Doanh thu và giao dịch", href: restaurantRoutes.adminReports(access.restaurant.slug), Icon: BarChart3 }]
      : [])
  ];

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Tổng quan kinh doanh"
      userName={access.user.name}
      plan={access.restaurant.plan}
      businessType={access.restaurant.businessType}
      logoUrl={logoUrl}
    >
      <section className="mb-5 overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-teal-800 via-teal-700 to-slate-950 px-5 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/15 text-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logoUrl ? <img alt={`Logo ${access.restaurant.name}`} className="h-full w-full object-cover" src={logoUrl} /> : <Store className="h-8 w-8" />}
              </div>
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {restaurantStatusLabel(access.restaurant.status)}
                  </span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${access.restaurant.plan === "PRO" ? "border-amber-200 bg-[#fff8e7] text-amber-900" : "border-white/20 bg-white/10 text-white"}`}>
                    {access.restaurant.plan === "PRO" ? "PRO" : "BASIC"}
                  </span>
                </div>
                <p className="text-sm font-medium text-teal-50">{todayLabel}</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-normal sm:text-4xl">{access.restaurant.name}</h1>
                <p className="mt-2 max-w-2xl text-sm text-teal-50">Trung tâm điều hành doanh thu, bàn, đơn hàng và hoạt động trong ngày.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-teal-50">
                <Sparkles className="h-4 w-4" />
                Tổng quan realtime
              </div>
              <p className="mt-2 text-xs text-teal-50">Dữ liệu tự cập nhật định kỳ, không cần F5.</p>
            </div>
          </div>
        </div>
      </section>

      <DashboardLiveOverview slug={access.restaurant.slug} initialOverview={overview} />

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Thao tác nhanh</h2>
            <p className="mt-1 text-sm text-slate-500">Các việc chủ quán thường dùng trong vận hành hằng ngày.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map(({ label, description, href, Icon }) => (
            <Link key={href} className="group rounded-2xl border bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-teal-200 hover:bg-teal-50/60 hover:shadow-sm" href={href}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-100 bg-white text-teal-800">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-teal-700" />
              </div>
              <p className="mt-4 font-semibold text-slate-950">{label}</p>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </RestaurantAdminShell>
  );
}
