import { Plus } from "lucide-react";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { TablesLivePanel } from "@/components/admin/tables-live-panel";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { hasPlanFeature } from "@/lib/plan/features";
import { createAreaAction, createTableAction } from "@/app/[rSlug]/admin/actions";
import { prisma } from "@/lib/db/prisma";
import { getRecentNotifications } from "@/server/services/notification-service";
import { getAdminTablesState } from "@/server/services/table-state-service";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getLatestPaidPaymentSummariesByTable } from "@/server/services/payment-detail-service";
import styles from './creation-forms.module.css';

export default async function TablesPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string; table?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const [areas, notifications, tableState, products, latestPaidPayments] = await Promise.all([
    prisma.area.findMany({
      where: { restaurantId: access.restaurant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id),
    getAdminTablesState(access.restaurant.id, access.restaurant.slug, baseUrl),
    prisma.product.findMany({
      where: {
        restaurantId: access.restaurant.id,
        isActive: true
      },
      orderBy: [{ isFeatured: "desc" }, { nameVi: "asc" }],
      select: {
        id: true,
        menuType: true,
        nameVi: true,
        descriptionVi: true,
        price: true,
        imageUrl: true,
        isSoldOut: true
      }
    }),
    getLatestPaidPaymentSummariesByTable(access.restaurant.id)
  ]);

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Khu vực & Bàn"
      userName={access.user.name}
      notifications={notifications}
      plan={access.restaurant.plan}
      planEntitlement={access.restaurant.planEntitlement}
      businessType={access.restaurant.businessType}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />

      <section className={styles.grid} aria-label="Tạo khu vực và bàn">
        <form className={styles.card} action={createAreaAction.bind(null, access.restaurant.slug)}>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Tạo khu vực</h2>
          <div className={`${styles.fields} ${styles.areaFields}`}>
            <label className={styles.field}>Tên khu vực<input name="name" placeholder="Tên khu vực, ví dụ Khu A" required /></label>
            <PendingSubmitButton className={styles.submit} pendingLabel="Đang tạo...">Tạo khu vực</PendingSubmitButton>
          </div>
        </form>

        <form className={styles.card} action={createTableAction.bind(null, access.restaurant.slug)}>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4" /> Tạo bàn</h2>
          <div className={`${styles.fields} ${styles.tableFields}`}>
            <label className={styles.field}>Tên bàn<input name="name" placeholder="Tên bàn, ví dụ A01" required /></label>
            <label className={styles.field}>Khu vực<select name="areaId" required>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select></label>
            <PendingSubmitButton className={styles.submit} pendingLabel="Đang tạo...">Tạo bàn</PendingSubmitButton>
          </div>
        </form>
      </section>

      <TablesLivePanel
        slug={access.restaurant.slug}
        restaurantName={access.restaurant.name}
        cashierName={access.user.name}
        canUsePayment={hasPlanFeature(access.restaurant.plan, "PAYMENT_CONFIRM", access.restaurant.businessType, access.restaurant.planEntitlement)}
        products={products}
        initialState={tableState}
        initialSelectedTableId={searchParams?.table}
        initialPaidPayments={latestPaidPayments}
      />
    </RestaurantAdminShell>
  );
}
