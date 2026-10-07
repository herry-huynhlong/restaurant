import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { prisma } from "@/lib/db/prisma";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { assignableRestaurantRoles, restaurantRoleLabels } from "@/lib/restaurant-role-labels";
import { getRecentNotifications } from "@/server/services/notification-service";
import {
  createStaffAction,
  resetStaffPasswordAction,
  toggleStaffActiveAction,
  updateStaffAction
} from "@/app/[rSlug]/admin/actions";

export default async function AdminStaffPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [staff, notifications] = await Promise.all([
    prisma.restaurantUser.findMany({
      where: { restaurantId: access.restaurant.id },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Nhân viên"
      userName={access.user.name}
      notifications={notifications}
    >
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />

      <form className="rounded-lg border bg-white p-4 shadow-sm" action={createStaffAction.bind(null, access.restaurant.slug)}>
        <h2 className="text-base font-semibold">+ Thêm nhân viên</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">
            Tên
            <input className="mt-1 h-10 w-full rounded-md border px-3" name="name" placeholder="Nguyễn Văn A" required />
          </label>
          <label className="text-sm font-medium">
            Email
            <input className="mt-1 h-10 w-full rounded-md border px-3" name="email" placeholder="a@abc.com" required type="email" />
          </label>
          <label className="text-sm font-medium">
            Số điện thoại
            <input className="mt-1 h-10 w-full rounded-md border px-3" name="phone" placeholder="Optional" />
          </label>
          <label className="text-sm font-medium">
            Vai trò
            <select className="mt-1 h-10 w-full rounded-md border px-3" name="role" defaultValue="WAITER">
              {assignableRestaurantRoles.map((role) => (
                <option key={role} value={role}>{restaurantRoleLabels[role]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Mật khẩu khởi tạo
            <input className="mt-1 h-10 w-full rounded-md border px-3" minLength={8} name="password" required type="password" />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input defaultChecked name="isActive" type="checkbox" />
            Active
          </label>
        </div>
        <button className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
          Tạo nhân viên
        </button>
      </form>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold">Danh sách nhân viên</h2>
        {staff.length ? (
          staff.map((membership) => {
            const isSelf = membership.userId === access.user.id;
            return (
              <article key={membership.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{membership.user.name}</h3>
                    <p className="text-sm text-slate-600">{membership.user.email}</p>
                    {membership.user.phone ? <p className="text-sm text-slate-600">{membership.user.phone}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{restaurantRoleLabels[membership.role]}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${membership.isActive && membership.user.isActive ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>
                      {membership.isActive && membership.user.isActive ? "Đang hoạt động" : "Ngừng sử dụng"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_280px_160px]">
                  <form className="grid gap-2 md:grid-cols-[1fr_160px_180px_110px_auto]" action={updateStaffAction.bind(null, access.restaurant.slug)}>
                    <input name="membershipId" type="hidden" value={membership.id} />
                    <input className="h-10 rounded-md border px-3" name="name" defaultValue={membership.user.name} required />
                    <input className="h-10 rounded-md border px-3" name="phone" defaultValue={membership.user.phone ?? ""} placeholder="SĐT" />
                    <select className="h-10 rounded-md border px-3" name="role" defaultValue={membership.role} disabled={isSelf}>
                      {assignableRestaurantRoles.map((role) => (
                        <option key={role} value={role}>{restaurantRoleLabels[role]}</option>
                      ))}
                    </select>
                    {isSelf ? <input name="role" type="hidden" value={membership.role} /> : null}
                    <label className="flex items-center gap-2 text-sm">
                      <input defaultChecked={membership.isActive && membership.user.isActive} disabled={isSelf} name="isActive" type="checkbox" />
                      Active
                    </label>
                    {isSelf ? <input name="isActive" type="hidden" value="true" /> : null}
                    <button className="rounded-md border px-3 py-2 text-sm font-semibold" type="submit">Sửa</button>
                  </form>

                  <form className="grid gap-2 md:grid-cols-[1fr_auto]" action={resetStaffPasswordAction.bind(null, access.restaurant.slug)}>
                    <input name="membershipId" type="hidden" value={membership.id} />
                    <input className="h-10 rounded-md border px-3" minLength={8} name="password" placeholder="Mật khẩu mới" required type="password" />
                    <button className="rounded-md border px-3 py-2 text-sm font-semibold" type="submit">Đổi mật khẩu</button>
                  </form>

                  <form action={toggleStaffActiveAction.bind(null, access.restaurant.slug)}>
                    <input name="membershipId" type="hidden" value={membership.id} />
                    <input name="isActive" type="hidden" value={membership.isActive && membership.user.isActive ? "false" : "true"} />
                    <ConfirmSubmitButton
                      className={`w-full rounded-md border px-3 py-2 text-sm font-semibold ${membership.isActive && membership.user.isActive ? "border-red-200 text-red-700" : "border-teal-200 text-teal-700"}`}
                      disabled={isSelf}
                      message={`${membership.isActive && membership.user.isActive ? "Ngừng sử dụng" : "Kích hoạt"} ${membership.user.name}?`}
                    >
                      {membership.isActive && membership.user.isActive ? "Ngừng sử dụng" : "Kích hoạt"}
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </article>
            );
          })
        ) : (
          <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">Chưa có nhân viên</h2>
            <p className="mt-2 text-sm text-slate-600">Tạo tài khoản đầu tiên để nhân viên đăng nhập đúng giao diện theo vai trò.</p>
          </section>
        )}
      </section>
    </RestaurantAdminShell>
  );
}
