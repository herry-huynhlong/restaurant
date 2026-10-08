import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { OrdersByTableBoard } from "@/components/admin/orders-by-table-board";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { getRecentNotifications } from "@/server/services/notification-service";
import { getActiveTableOrders } from "@/server/services/order-board-service";

export default async function AdminOrdersPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [tables, notifications] = await Promise.all([
    getActiveTableOrders(access.restaurant.id),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Order theo bàn"
      userName={access.user.name}
      notifications={notifications}
      plan={access.restaurant.plan}
    >
      <OrdersByTableBoard slug={access.restaurant.slug} initialTables={tables} />
    </RestaurantAdminShell>
  );
}
