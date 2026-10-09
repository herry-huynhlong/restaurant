import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";

const titles: Record<string, string> = {
  menu: "Menu",
  categories: "Danh mục",
  tables: "Khu vực & Bàn",
  areas: "Khu vực",
  orders: "Order",
  staff: "Nhân viên",
  payments: "Thanh toán",
  reports: "Báo cáo",
  settings: "Cài đặt"
};

export default async function RestaurantAdminSectionPage({
  params
}: {
  params: { rSlug: string; section: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  if (params.section === "payments") requireRestaurantFeature(access, "CASHIER_FLOW");
  if (params.section === "reports") requireRestaurantFeature(access, "ADVANCED_REPORTS");
  const title = titles[params.section] ?? "Admin";

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title={title} plan={access.restaurant.plan} businessType={access.restaurant.businessType}>
      <EmptyState title={`${title} chưa có dữ liệu`} description="Khu vực này hiện chưa phát sinh dữ liệu để hiển thị." />
    </RestaurantAdminShell>
  );
}
