import type { RestaurantRole } from "@prisma/client";
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

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <form action={createStaffAction.bind(null, access.restaurant.slug)}>
          <h2 className="text-base font-semibold">+ Thêm nhân viên</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Tên">
              <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="name" placeholder="Nguyễn Văn A" required />
            </Field>
            <Field label="Tên đăng nhập">
              <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="username" pattern="[a-z0-9_-]{3,30}" placeholder="waiter01" required />
            </Field>
            <Field label="Số điện thoại">
              <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="phone" placeholder="Optional" />
            </Field>
            <Field label="Vai trò">
              <select className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="role" defaultValue="WAITER">
                {assignableRestaurantRoles.map((role) => (
                  <option key={role} value={role}>{restaurantRoleLabels[role]}</option>
                ))}
              </select>
            </Field>
            <Field label="Mật khẩu khởi tạo">
              <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" minLength={8} name="password" required type="password" />
            </Field>
          </div>
          <button className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
            Tạo nhân viên
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Danh sách nhân viên</h2>
        {staff.length ? (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {staff.map((membership) => {
              const isSelf = membership.userId === access.user.id;
              const isEnabled = membership.isActive && membership.user.isActive;
              const username = membership.username ?? membership.user.email.split("@")[0];
              const roleOptions = membership.role === "OWNER" ? ["OWNER" as RestaurantRole] : assignableRestaurantRoles;
              const canEditRole = !isSelf && membership.role !== "OWNER";
              const canToggle = !isSelf && membership.role !== "OWNER";

              return (
                <article key={membership.id} className="min-w-0 rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">{membership.user.name}</h3>
                      <p className="text-sm font-medium text-slate-700">{restaurantRoleLabels[membership.role]}</p>
                      <p className="mt-1 break-all text-sm text-slate-600">Tên đăng nhập: <span className="font-semibold">@{username}</span></p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isEnabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>
                      {isEnabled ? "Đang hoạt động" : "Ngừng sử dụng"}
                    </span>
                  </div>

                  <details className="mt-4 rounded-md border">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold hover:bg-slate-50">Chỉnh sửa</summary>
                    <div className="border-t p-3">
                      <form className="grid gap-3" action={updateStaffAction.bind(null, access.restaurant.slug)}>
                        <input name="membershipId" type="hidden" value={membership.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Tên">
                            <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="name" defaultValue={membership.user.name} required />
                          </Field>
                          <Field label="Tên đăng nhập">
                            <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="username" defaultValue={username} pattern="[a-z0-9_-]{3,30}" required />
                          </Field>
                          <Field label="SĐT">
                            <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="phone" defaultValue={membership.user.phone ?? ""} />
                          </Field>
                          <Field label="Vai trò">
                            <select className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="role" defaultValue={membership.role} disabled={!canEditRole}>
                              {roleOptions.map((role) => (
                                <option key={role} value={role}>{restaurantRoleLabels[role]}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        {!canEditRole ? <input name="role" type="hidden" value={membership.role} /> : null}
                        <label className="flex items-center gap-2 text-sm">
                          <input defaultChecked={isEnabled} disabled={isSelf} name="isActive" type="checkbox" />
                          Active
                        </label>
                        {isSelf ? <input name="isActive" type="hidden" value="true" /> : null}
                        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="submit">
                          Lưu thay đổi
                        </button>
                      </form>

                      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]" action={resetStaffPasswordAction.bind(null, access.restaurant.slug)}>
                        <input name="membershipId" type="hidden" value={membership.id} />
                        <Field label="Mật khẩu mới">
                          <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" minLength={8} name="password" placeholder="Mật khẩu mới" required type="password" />
                        </Field>
                        <button className="self-end rounded-md border px-3 py-2 text-sm font-semibold" type="submit">Đổi mật khẩu</button>
                      </form>

                      <form className="mt-3" action={toggleStaffActiveAction.bind(null, access.restaurant.slug)}>
                        <input name="membershipId" type="hidden" value={membership.id} />
                        <input name="isActive" type="hidden" value={isEnabled ? "false" : "true"} />
                        <ConfirmSubmitButton
                          className={`w-full rounded-md border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${isEnabled ? "border-red-200 text-red-700" : "border-teal-200 text-teal-700"}`}
                          disabled={!canToggle}
                          message={`${isEnabled ? "Ngừng sử dụng" : "Kích hoạt"} ${membership.user.name}?`}
                        >
                          {isEnabled ? "Ngừng sử dụng" : "Kích hoạt"}
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="mt-3 rounded-lg border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">Chưa có nhân viên</h2>
            <p className="mt-2 text-sm text-slate-600">Tạo tài khoản đầu tiên để nhân viên đăng nhập đúng giao diện theo vai trò.</p>
          </section>
        )}
      </section>
    </RestaurantAdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
