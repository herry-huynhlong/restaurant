import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { getRecentNotifications } from "@/server/services/notification-service";
import {
  createCategoryAction,
  deleteOrDeactivateCategoryAction,
  updateCategoryAction
} from "@/app/[rSlug]/admin/actions";

export default async function CategoriesPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [categories, notifications] = await Promise.all([
    prisma.category.findMany({
      where: { restaurantId: access.restaurant.id },
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: "asc" }, { nameVi: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Danh mục" userName={access.user.name} notifications={notifications}>
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <form className="mb-6 rounded-lg border bg-white p-4 shadow-sm" action={createCategoryAction.bind(null, access.restaurant.slug)}>
        <h2 className="text-base font-semibold">+ Tạo danh mục</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_120px_auto_auto]">
          <input className="h-10 rounded-md border px-3" name="nameVi" placeholder="Tên tiếng Việt *" required />
          <input className="h-10 rounded-md border px-3" name="nameEn" placeholder="English" />
          <input className="h-10 rounded-md border px-3" min="0" name="sortOrder" placeholder="Sort" type="number" />
          <label className="flex items-center gap-2 text-sm"><input defaultChecked name="isActive" type="checkbox" /> Active</label>
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tạo danh mục</button>
        </div>
      </form>

      {categories.length === 0 ? (
        <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Chưa có danh mục</h2>
          <p className="mt-2 text-sm text-slate-600">Tạo danh mục đầu tiên để nhóm các món ăn.</p>
        </section>
      ) : (
        <section className="overflow-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {["Tên VI", "Tên EN", "Sort", "Status", "Số món", "Action"].map((item) => <th key={item} className="px-3 py-3 font-medium">{item}</th>)}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-t align-top">
                  <td colSpan={6} className="px-3 py-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <form className="grid gap-2 md:grid-cols-[1fr_1fr_100px_auto_auto]" action={updateCategoryAction.bind(null, access.restaurant.slug)}>
                        <input name="categoryId" type="hidden" value={category.id} />
                        <input className="h-9 rounded-md border px-3" name="nameVi" defaultValue={category.nameVi} required />
                        <input className="h-9 rounded-md border px-3" name="nameEn" defaultValue={category.nameEn ?? ""} />
                        <input className="h-9 rounded-md border px-3" name="sortOrder" type="number" defaultValue={category.sortOrder} />
                        <label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={category.isActive} /> Active</label>
                        <button className="rounded-md border px-3 text-sm" type="submit">Lưu</button>
                      </form>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600">{category._count.products} món</span>
                        <form action={deleteOrDeactivateCategoryAction.bind(null, access.restaurant.slug)}>
                          <input name="categoryId" type="hidden" value={category.id} />
                          <ConfirmSubmitButton className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700" message={`Xóa hoặc tắt danh mục ${category.nameVi}?`}>
                            Xóa / Tắt
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </RestaurantAdminShell>
  );
}
