import { ShieldCheck, UserCog } from "lucide-react";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { createPlatformSubAdminAction, resetPlatformSubAdminPasswordAction, updatePlatformSubAdminAction } from "./actions";

export default async function PlatformAdminsPage({
  searchParams
}: {
  searchParams?: { success?: string; error?: string };
}) {
  await requirePlatformOwner();
  const admins = await prisma.user.findMany({
    where: {
      platformRole: { in: ["PLATFORM_OWNER", "PLATFORM_ADMIN", "PLATFORM_SUB_ADMIN"] }
    },
    orderBy: [{ platformRole: "asc" }, { createdAt: "asc" }]
  });

  return (
    <PlatformShell title="Quản trị viên" subtitle="Quản lý tài khoản truy cập hệ thống QuánPilot Admin.">
      <FeedbackBanner success={searchParams?.success} error={searchParams?.error} />

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-teal-800">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Thêm quản trị phụ</h2>
            <p className="mt-1 text-sm text-slate-500">Quản trị phụ hỗ trợ vận hành nhà hàng nhưng không được khóa/xóa, đổi gói, xác nhận thanh toán hoặc cấu hình sao lưu.</p>
          </div>
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-2" action={createPlatformSubAdminAction}>
          <Field label="Họ tên">
            <input className="h-10 w-full rounded-md border px-3" name="name" required />
          </Field>
          <Field label="Email đăng nhập">
            <input className="h-10 w-full rounded-md border px-3" name="email" type="email" required />
          </Field>
          <Field label="Số điện thoại">
            <input className="h-10 w-full rounded-md border px-3" name="phone" />
          </Field>
          <Field label="Mật khẩu khởi tạo">
            <input className="h-10 w-full rounded-md border px-3" name="password" type="password" minLength={8} required />
          </Field>
          <div className="md:col-span-2">
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
              Tạo quản trị phụ
            </button>
          </div>
        </form>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Danh sách quản trị viên</h2>
        <div className="mt-4 space-y-3">
          {admins.map((admin) => {
            const isSubAdmin = admin.platformRole === "PLATFORM_SUB_ADMIN";
            return (
              <article key={admin.id} className="rounded-xl border bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <UserCog className="h-4 w-4 text-teal-700" />
                      <h3 className="font-semibold text-slate-950">{admin.name}</h3>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${admin.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {admin.isActive ? "Đang hoạt động" : "Đã khóa"}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-sm text-slate-600">{admin.email}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{platformRoleLabel(admin.platformRole)}</p>
                  </div>
                  {isSubAdmin ? (
                    <details className="w-full lg:w-[560px]">
                      <summary className="cursor-pointer list-none rounded-md border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100">Chỉnh sửa</summary>
                      <div className="mt-3 rounded-xl border bg-white p-3">
                        <form className="grid gap-3 sm:grid-cols-2" action={updatePlatformSubAdminAction}>
                          <input name="userId" type="hidden" value={admin.id} />
                          <Field label="Họ tên">
                            <input className="h-10 w-full rounded-md border px-3" name="name" defaultValue={admin.name} required />
                          </Field>
                          <Field label="Email đăng nhập">
                            <input className="h-10 w-full rounded-md border px-3" name="email" type="email" defaultValue={admin.email} required />
                          </Field>
                          <Field label="Số điện thoại">
                            <input className="h-10 w-full rounded-md border px-3" name="phone" defaultValue={admin.phone ?? ""} />
                          </Field>
                          <label className="flex items-center gap-2 self-end text-sm font-medium">
                            <input defaultChecked={admin.isActive} name="isActive" type="checkbox" />
                            Tài khoản đang hoạt động
                          </label>
                          <div className="sm:col-span-2">
                            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" type="submit">Lưu thay đổi</button>
                          </div>
                        </form>
                        <form className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-[1fr_auto]" action={resetPlatformSubAdminPasswordAction}>
                          <input name="userId" type="hidden" value={admin.id} />
                          <Field label="Mật khẩu mới">
                            <input className="h-10 w-full rounded-md border px-3" name="password" type="password" minLength={8} required />
                          </Field>
                          <button className="self-end rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" type="submit">Đặt lại mật khẩu</button>
                        </form>
                      </div>
                    </details>
                  ) : (
                    <span className="rounded-md border bg-white px-3 py-2 text-sm font-semibold text-slate-500">Chủ quản trị</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </PlatformShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function platformRoleLabel(role: string) {
  if (role === "PLATFORM_SUB_ADMIN") return "Quản trị phụ";
  return "Chủ quản trị nền tảng";
}
