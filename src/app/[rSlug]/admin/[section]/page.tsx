import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRestaurantAccess } from "@/lib/rbac/guards";

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
  const title = titles[params.section] ?? "Admin";

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title={title}>
      <EmptyState title={`${title} chưa có dữ liệu`} description="Route đã sẵn sàng, chức năng chi tiết sẽ được triển khai ở phase tương ứng." />
    </RestaurantAdminShell>
  );
}
