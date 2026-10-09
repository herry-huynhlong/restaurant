import { redirect } from "next/navigation";
import { StaffDeviceSetupForm } from "@/components/app-shell/staff-device-setup-form";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { restaurantRoutes } from "@/lib/routes";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { getActiveStaffDeviceSession, getRoleHomePath, getStaffDeviceIdCookie, isStaffDeviceRole } from "@/server/services/staff-device-session-service";

export default async function StaffDeviceSetupPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { next?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["WAITER", "KITCHEN", "CASHIER"]);
  if (!isStaffDeviceRole(access.membership.role)) {
    redirect(restaurantRoutes.admin(access.restaurant.slug));
  }

  const defaultNext = getRoleHomePath(access.restaurant.slug, access.membership.role);
  const next = searchParams?.next?.startsWith(`/${access.restaurant.slug}/`) ? searchParams.next : defaultNext;
  const deviceId = getStaffDeviceIdCookie();
  const deviceSession = await getActiveStaffDeviceSession({
    restaurantId: access.restaurant.id,
    userId: access.user.id,
    deviceId
  });

  if (deviceSession?.operatorName && deviceSession.isActive && !deviceSession.revokedAt) {
    redirect(next);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-teal-700">{access.restaurant.name}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Nhập họ tên của bạn</h1>
          <p className="mt-2 text-sm text-slate-600">{getRoleLabel(access.membership.role)} · dùng để quản lý ai đang cầm thiết bị này.</p>
        </div>
        <StaffDeviceSetupForm slug={access.restaurant.slug} defaultNext={next} />
      </section>
    </main>
  );
}
