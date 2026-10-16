import { AppHeader } from "@/components/app-shell/app-header";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { BillHistoryButton } from "@/components/admin/payment-report-table";
import { CashierWorkspace } from "@/components/cashier/cashier-workspace";
import { prisma } from "@/lib/db/prisma";
import { requireRestaurantAccess, requireRestaurantFeature } from "@/lib/rbac/guards";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { servedUploadUrl } from "@/lib/upload-url";
import { getCashierState } from "@/server/services/cashier-state-service";
import { getRecentNotifications } from "@/server/services/notification-service";
import { requireActiveStaffDeviceSession } from "@/server/services/staff-device-session-service";

export default async function CashierPage({ params }: { params: { rSlug: string } }) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER", "CASHIER"]);
  requireRestaurantFeature(access, "CASHIER_FLOW");
  await requireActiveStaffDeviceSession({
    restaurantId: access.restaurant.id,
    restaurantSlug: access.restaurant.slug,
    userId: access.user.id,
    role: access.membership.role,
    nextPath: `/${access.restaurant.slug}/cashier`
  });

  const [cashierState, notifications, tables] = await Promise.all([
    getCashierState(access.restaurant.id),
    getRecentNotifications(access.restaurant.id, access.user.id),
    prisma.restaurantTable.findMany({
      where: { restaurantId: access.restaurant.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    })
  ]);
  const settings = cashierState.settings;

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        title="Thu ngân"
        subtitle={`${access.restaurant.name} · ${getRoleLabel(access.membership.role)}`}
        notificationSlug={access.restaurant.slug}
        enableShiftControls={access.membership.role === "CASHIER"}
        actions={
          <NotificationBell slug={access.restaurant.slug} notifications={notifications} />
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
        <CashierWorkspace
          slug={access.restaurant.slug}
          cashierName={access.user.name ?? null}
          sessions={cashierState.sessions}
          initialSummary={cashierState.summary}
          settings={{
            restaurantName: access.restaurant.name,
            invoiceBusinessName: settings?.invoiceBusinessName ?? null,
            invoiceTaxCode: settings?.invoiceTaxCode ?? null,
            invoiceAddress: settings?.invoiceAddress ?? settings?.address ?? null,
            invoicePhone: settings?.invoicePhone ?? settings?.phone ?? null,
            invoiceEmail: settings?.invoiceEmail ?? null,
            cashEnabled: settings?.cashEnabled ?? true,
            qrPaymentEnabled: settings?.qrPaymentEnabled ?? false,
            paymentQrImage: servedUploadUrl(settings?.paymentQrImage) ?? null,
            bankName: settings?.bankName ?? null,
            bankCode: settings?.bankCode ?? null,
            accountNumber: settings?.accountNumber ?? null,
            accountHolder: settings?.accountHolder ?? null,
            paymentTransferContent: settings?.paymentTransferContent ?? null
          }}
        />

        <section className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Tra cứu</p>
            <h2 className="mt-1 text-lg font-semibold">Bill thanh toán gần đây</h2>
            <p className="mt-1 text-sm text-slate-500">Lịch sử mặc định được thu gọn; mở khi cần xem chi tiết hoặc in lại.</p>
          </div>
          <BillHistoryButton slug={access.restaurant.slug} tables={tables} />
        </section>
      </div>
    </main>
  );
}
