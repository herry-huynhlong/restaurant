import type { RestaurantRole } from "@prisma/client";
import QRCode from "qrcode";
import Image from "next/image";
import { headers } from "next/headers";
import { ChefHat, ChevronDown, Clock3, MonitorSmartphone, Pencil, Receipt, Smartphone, UserCog, Users, type LucideIcon } from "lucide-react";
import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { CopyLoginLinkButton, StaffDirectoryFilters, StaffPageInteractions, StaffSubmitButton } from "@/components/admin/staff-page-interactions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { prisma } from "@/lib/db/prisma";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { departmentLoginRolesForPlan } from "@/lib/plan/features";
import { assignableRestaurantRolesForPlan, restaurantRoleLabels } from "@/lib/restaurant-role-labels";
import { sanitizeFeedbackMessage } from "@/lib/safe-user-message";
import { getRecentNotifications } from "@/server/services/notification-service";
import {
  createStaffAction,
  deleteStaffAccountAction,
  resetStaffPasswordAction,
  revokeStaffDeviceSessionAction,
  updateStaffAction
} from "@/app/[rSlug]/admin/actions";

const departmentLabels: Record<"MANAGER" | "WAITER" | "KITCHEN" | "CASHIER", { title: string; description: string }> = {
  MANAGER: { title: "Quản lý", description: "Dành cho người điều hành cửa hàng." },
  WAITER: { title: "Phục vụ", description: "Dành cho nhân viên phục vụ bàn." },
  KITCHEN: { title: "Bếp", description: "Dành cho bộ phận bếp." },
  CASHIER: { title: "Thu ngân", description: "Dành cho quầy thu ngân." }
};

const staffRoleOrder: RestaurantRole[] = ["MANAGER", "WAITER", "KITCHEN", "CASHIER"];
const staffGroupTitles: Record<RestaurantRole, string> = {
  OWNER: "Chủ quán",
  WAITER: "Phục vụ",
  KITCHEN: "Bếp / Pha chế",
  CASHIER: "Thu ngân",
  MANAGER: "Quản lý"
};
const staffRoleStyles: Record<RestaurantRole, { Icon: LucideIcon; icon: string; accent: string; marker: string }> = {
  OWNER: {
    Icon: UserCog,
    icon: "border-teal-100 bg-teal-50 text-teal-700",
    accent: "text-teal-800",
    marker: "border-l-teal-600"
  },
  MANAGER: {
    Icon: UserCog,
    icon: "border-teal-100 bg-teal-50 text-teal-700",
    accent: "text-teal-800",
    marker: "border-l-teal-600"
  },
  WAITER: {
    Icon: Users,
    icon: "border-sky-100 bg-sky-50 text-sky-700",
    accent: "text-sky-800",
    marker: "border-l-sky-500"
  },
  KITCHEN: {
    Icon: ChefHat,
    icon: "border-amber-100 bg-amber-50 text-amber-700",
    accent: "text-amber-800",
    marker: "border-l-amber-500"
  },
  CASHIER: {
    Icon: Receipt,
    icon: "border-emerald-100 bg-emerald-50 text-emerald-700",
    accent: "text-emerald-800",
    marker: "border-l-emerald-500"
  }
};
const staffStatusRank = { WORKING: 0, OFF_SHIFT: 1, LOCKED: 2 };

type StaffStatus = keyof typeof staffStatusRank;
type StaffViewModel = {
  id: string;
  userId: string;
  name: string;
  username: string;
  phone: string;
  role: RestaurantRole;
  accountActive: boolean;
  status: StaffStatus;
  devices: StaffDeviceViewModel[];
};
type StaffDeviceViewModel = {
  id: string;
  name: string;
  operatorName: string;
  onShift: boolean;
  isActive: boolean;
  revokedAt: Date | null;
  lastSeenAt: Date;
};

export default async function AdminStaffPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const assignableRoles = assignableRestaurantRolesForPlan(access.restaurant.plan, access.restaurant.businessType, access.restaurant.planEntitlement);
  const departmentRoles = [
    ...(assignableRoles.includes("MANAGER") ? ["MANAGER" as const] : []),
    ...departmentLoginRolesForPlan(access.restaurant.plan, access.restaurant.businessType, access.restaurant.planEntitlement)
  ];
  const departmentAccess = departmentRoles.map((role) => ({
    role,
    ...departmentLabels[role as "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER"]
  }));
  const origin = getRequestOrigin();
  const loginAccessRows = await Promise.all(departmentAccess.map(async (item) => {
    const url = `${origin}/${access.restaurant.slug}/login?role=${item.role}`;
    return {
      ...item,
      url,
      qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 112 })
    };
  }));
  const [staffMemberships, notifications] = await Promise.all([
    prisma.restaurantUser.findMany({
      where: {
        restaurantId: access.restaurant.id,
        role: { in: assignableRoles }
      },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);
  const staffUserIds = staffMemberships.map((membership) => membership.userId);
  const deviceSessions = staffUserIds.length
    ? await prisma.staffDeviceSession.findMany({
        where: {
          restaurantId: access.restaurant.id,
          userId: { in: staffUserIds }
        },
        orderBy: [{ isActive: "desc" }, { onShift: "desc" }, { lastSeenAt: "desc" }],
        take: 200
      })
    : [];
  const deviceSessionsByUserId = new Map<string, typeof deviceSessions>();
  for (const session of deviceSessions) {
    const list = deviceSessionsByUserId.get(session.userId) ?? [];
    list.push(session);
    deviceSessionsByUserId.set(session.userId, list);
  }
  const staffRows: StaffViewModel[] = staffMemberships.map((membership) => {
    const username = membership.username ?? membership.user.email.split("@")[0];
    const name = membership.user.name.trim() || username;
    const devices = (deviceSessionsByUserId.get(membership.userId) ?? []).map((session) => ({
      id: session.id,
      name: session.deviceName ?? "Không rõ thiết bị",
      operatorName: session.operatorName ?? name,
      onShift: session.onShift,
      isActive: session.isActive,
      revokedAt: session.revokedAt,
      lastSeenAt: session.lastSeenAt
    }));
    const accountActive = membership.isActive && membership.user.isActive;
    const isWorking = accountActive && devices.some((device) => device.isActive && device.onShift && !device.revokedAt);
    const status: StaffStatus = !accountActive ? "LOCKED" : isWorking ? "WORKING" : "OFF_SHIFT";
    return {
      id: membership.id,
      userId: membership.userId,
      name,
      username,
      phone: membership.user.phone ?? "",
      role: membership.role,
      accountActive,
      status,
      devices
    };
  }).sort(compareStaffRows);
  const groupedStaff = staffRoleOrder
    .filter((role) => assignableRoles.includes(role))
    .map((role) => ({
      role,
      title: staffGroupTitles[role],
      rows: staffRows.filter((row) => row.role === role)
    }));
  const safeError = sanitizeFeedbackMessage(searchParams?.error, "Không thể hoàn tất thao tác. Vui lòng thử lại.");
  const safeSuccess = safeError ? undefined : sanitizeFeedbackMessage(searchParams?.success, "Đã cập nhật thông tin nhân viên.");
  const totalWorking = staffRows.filter((row) => row.status === "WORKING").length;
  const totalActiveDevices = staffRows.reduce((total, row) => total + row.devices.filter((device) => device.isActive && !device.revokedAt).length, 0);

  return (
    <RestaurantAdminShell
      slug={access.restaurant.slug}
      restaurantName={access.restaurant.name}
      role={access.membership.role}
      title="Nhân viên"
      userName={access.user.name}
      notifications={notifications}
      plan={access.restaurant.plan}
      planEntitlement={access.restaurant.planEntitlement}
      businessType={access.restaurant.businessType}
    >
      <StaffPageInteractions error={safeError} success={safeSuccess} />

      <details data-staff-panel className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer list-none text-base font-semibold">
          <span className="inline-flex items-center gap-2">Mã đăng nhập theo bộ phận <span className="text-xs font-medium text-slate-500">(bấm để mở)</span></span>
        </summary>
        <div className="mt-4 grid gap-3">
          {loginAccessRows.map((item) => (
            <article key={item.role} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[112px_minmax(0,1fr)]">
              <Image className="h-28 w-28 rounded-md border bg-white" src={item.qrDataUrl} alt={`QR đăng nhập ${item.title}`} width={112} height={112} unoptimized />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.description}</p>
                  </div>
                  <a className="rounded-md border px-3 py-2 text-sm font-semibold" href={item.url} target="_blank" rel="noreferrer">
                    Mở liên kết
                  </a>
                  <CopyLoginLinkButton url={item.url} />
                </div>
                <p className="mt-3 break-all rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{item.url}</p>
              </div>
            </article>
          ))}
        </div>
      </details>

      <details data-staff-panel className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer list-none text-base font-semibold">
          <span className="inline-flex items-center gap-2">+ Thêm nhân viên <span className="text-xs font-medium text-slate-500">(bấm để mở)</span></span>
        </summary>
        <form action={createStaffAction.bind(null, access.restaurant.slug)}>
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
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>{restaurantRoleLabels[role]}</option>
                ))}
              </select>
            </Field>
            <Field label="Mật khẩu khởi tạo">
              <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" minLength={8} name="password" required type="password" />
            </Field>
          </div>
          <StaffSubmitButton className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" pendingLabel="Đang tạo...">
            Tạo nhân viên
          </StaffSubmitButton>
        </form>
      </details>

      <section className="mt-6 space-y-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Nhân sự</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">Quản lý đội ngũ</h2>
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <StaffMetricCard icon={Users} label="Tổng nhân viên" value={staffRows.length} helper="Không bao gồm chủ quán" tone="teal" />
          <StaffMetricCard icon={Clock3} label="Đang trong ca" value={totalWorking} helper="Có phiên làm việc hợp lệ" tone="blue" />
          <StaffMetricCard icon={Smartphone} label="Thiết bị đang hoạt động" value={totalActiveDevices} helper="Thiết bị chưa bị khóa" tone="amber" />
        </section>

        <StaffDirectoryFilters />

        {staffRows.length ? groupedStaff.map((group) => {
          const roleStyle = staffRoleStyles[group.role];
          const DepartmentIcon = roleStyle.Icon;
          const workingCount = group.rows.filter((row) => row.status === "WORKING").length;
          return (
            <details key={group.role} className={`group rounded-lg border border-l-4 bg-white shadow-sm ${roleStyle.marker}`} data-staff-group open>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${roleStyle.icon}`}>
                    <DepartmentIcon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className={`truncate text-sm font-bold uppercase tracking-wide ${roleStyle.accent}`}>{group.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {group.rows.length} nhân viên
                      {workingCount > 0 ? ` · ${workingCount} đang trong ca` : " · Không có ai trong ca"}
                    </p>
                  </div>
                </div>
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>

              <div className="border-t">
                <div className="hidden grid-cols-[minmax(220px,1.5fr)_120px_120px_minmax(150px,0.9fr)_auto] items-center gap-4 bg-slate-50/80 px-4 py-2 text-xs font-semibold uppercase text-slate-500 xl:grid">
                  <span>Nhân viên</span>
                  <span>Trạng thái</span>
                  <span>Thiết bị</span>
                  <span>Hoạt động gần nhất</span>
                  <span className="text-right">Thao tác</span>
                </div>
                {group.rows.length ? (
                  <div className="divide-y divide-slate-100">
                    {group.rows.map((staff) => (
                      <StaffRow
                        key={staff.id}
                        staff={staff}
                        slug={access.restaurant.slug}
                        assignableRoles={assignableRoles}
                        isSelf={staff.userId === access.user.id}
                      />
                    ))}
                  </div>
                ) : null}
                <p
                  data-staff-group-empty
                  hidden={group.rows.length > 0}
                  className="m-4 rounded-md border border-dashed bg-slate-50 px-4 py-5 text-center text-sm text-slate-500"
                >
                  {group.rows.length ? "Không có nhân sự phù hợp bộ lọc." : "Chưa có nhân sự trong bộ phận này."}
                </p>
              </div>
            </details>
          );
        }) : (
          <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">Chưa có nhân viên</h2>
            <p className="mt-2 text-sm text-slate-600">Tạo tài khoản đầu tiên để nhân viên đăng nhập đúng giao diện theo vai trò.</p>
          </section>
        )}
      </section>
    </RestaurantAdminShell>
  );
}

function StaffRow({
  staff,
  slug,
  assignableRoles,
  isSelf,
}: {
  staff: StaffViewModel;
  slug: string;
  assignableRoles: RestaurantRole[];
  isSelf: boolean;
}) {
  const canEditRole = !isSelf;
  const activeDevices = staff.devices.filter((device) => device.isActive && !device.revokedAt);
  const roleStyle = staffRoleStyles[staff.role];

  return (
    <article
      className="relative grid gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/80 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_120px_120px_minmax(150px,0.9fr)_auto] xl:items-center xl:gap-4"
      data-staff-card
      data-staff-name={normalizeForFilter(staff.name)}
      data-staff-username={normalizeForFilter(staff.username)}
      data-staff-status={staff.status}
    >
      <div className="flex min-w-0 items-center gap-3 sm:col-span-2 xl:col-span-1">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${roleStyle.icon}`}>
          {staffInitials(staff.name)}
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{staff.name}</h4>
          <p className="mt-0.5 truncate text-xs text-slate-500">@{staff.username}</p>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400 xl:hidden">Trạng thái</p>
        <StatusBadge status={staff.status} />
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400 xl:hidden">Thiết bị</p>
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Smartphone className="h-4 w-4 text-slate-400" />
          {activeDevices.length} hoạt động
        </p>
        {staff.devices.length > activeDevices.length ? <p className="mt-0.5 text-xs text-slate-400">{staff.devices.length} đã đăng nhập</p> : null}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400 xl:hidden">Hoạt động gần nhất</p>
        <p className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          <Clock3 className="h-4 w-4 text-slate-400" />
          {lastSeenSummary(staff.devices)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 sm:col-span-2 sm:justify-end xl:col-span-1">
        <details className="w-full sm:w-auto" data-staff-panel>
          <summary className="inline-flex w-full cursor-pointer list-none items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white sm:w-auto">
            <Pencil className="h-4 w-4" />
            Chỉnh sửa
          </summary>
          <div className="mt-2 w-full rounded-lg border bg-white p-3 shadow-lg sm:w-[520px] xl:absolute xl:right-4 xl:z-20">
            <EditStaffForms staff={staff} slug={slug} assignableRoles={assignableRoles} canEditRole={canEditRole} isSelf={isSelf} />
          </div>
        </details>
        {staff.devices.length > 0 ? (
          <details className="w-full sm:w-auto" data-staff-panel>
            <summary className="inline-flex w-full cursor-pointer list-none items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 sm:w-auto">
              <MonitorSmartphone className="h-4 w-4" />
              Xem thiết bị
            </summary>
            <div className="xl:absolute xl:right-4 xl:z-20">
              <DeviceList slug={slug} staffName={staff.name} devices={staff.devices} />
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function EditStaffForms({
  staff,
  slug,
  assignableRoles,
  canEditRole,
  isSelf
}: {
  staff: StaffViewModel;
  slug: string;
  assignableRoles: RestaurantRole[];
  canEditRole: boolean;
  isSelf: boolean;
}) {
  return (
    <div>
      <form className="grid gap-3" action={updateStaffAction.bind(null, slug)}>
        <input name="membershipId" type="hidden" value={staff.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tên">
            <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="name" defaultValue={staff.name} required />
          </Field>
          <Field label="Tên đăng nhập">
            <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="username" defaultValue={staff.username} pattern="[a-z0-9_-]{3,30}" required />
          </Field>
          <Field label="SĐT">
            <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="phone" defaultValue={staff.phone} />
          </Field>
          <Field label="Vai trò">
            <select className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" name="role" defaultValue={staff.role} disabled={!canEditRole}>
              {assignableRoles.map((role) => (
                <option key={role} value={role}>{restaurantRoleLabels[role]}</option>
              ))}
            </select>
          </Field>
        </div>
        {!canEditRole ? <input name="role" type="hidden" value={staff.role} /> : null}
        <label className="flex items-center gap-2 text-sm">
          <input defaultChecked={staff.accountActive} disabled={isSelf} name="isActive" type="checkbox" />
          Tài khoản đang hoạt động
        </label>
        {isSelf ? <input name="isActive" type="hidden" value="true" /> : null}
        <StaffSubmitButton className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang lưu...">
          Lưu thay đổi
        </StaffSubmitButton>
      </form>

      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]" action={resetStaffPasswordAction.bind(null, slug)}>
        <input name="membershipId" type="hidden" value={staff.id} />
        <Field label="Mật khẩu mới">
          <input className="h-10 w-full min-w-0 rounded-md border px-3 outline-none focus:border-teal-600 disabled:bg-slate-100" minLength={8} name="password" placeholder="Mật khẩu mới" required type="password" />
        </Field>
        <StaffSubmitButton className="self-end rounded-md border px-3 py-2 text-sm font-semibold" pendingLabel="Đang đổi...">Đổi mật khẩu</StaffSubmitButton>
      </form>

      <div className="mt-4 border-t pt-3">
        <form action={deleteStaffAccountAction.bind(null, slug)}>
          <input name="membershipId" type="hidden" value={staff.id} />
          <ConfirmSubmitButton
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            disabled={isSelf}
            message="Xóa tài khoản nhân viên này?"
            description="Tài khoản sẽ không thể đăng nhập lại. Các lịch sử order, món đã nhận, ca làm việc và audit liên quan vẫn được giữ."
          >
            Xóa tài khoản
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

function DeviceList({ slug, staffName, devices }: { slug: string; staffName: string; devices: StaffDeviceViewModel[] }) {
  return (
    <div className="mt-2 max-h-[70vh] w-full overflow-y-auto rounded-2xl border bg-white p-3 shadow-sm lg:w-[460px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-semibold text-slate-950">Thiết bị của {staffName}</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{devices.length} thiết bị</span>
      </div>
      <div className="space-y-2">
        {devices.map((device) => (
          <DeviceLine key={device.id} slug={slug} staffName={staffName} device={device} forceAction />
        ))}
      </div>
    </div>
  );
}

function DeviceLine({
  slug,
  staffName,
  device,
  forceAction
}: {
  slug: string;
  staffName: string;
  device: StaffDeviceViewModel;
  forceAction?: boolean;
}) {
  const canRevoke = device.isActive && !device.revokedAt;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{device.name}</p>
        <p className="mt-1 truncate text-xs text-slate-700">
          Người dùng: <span className="font-semibold text-slate-900">{device.operatorName}</span>
        </p>
        <p className="text-xs text-slate-500">{deviceStatusLabel(device)} · {formatTime(device.lastSeenAt)}</p>
      </div>
      {canRevoke && forceAction ? <RevokeDeviceForm slug={slug} device={device} staffName={device.operatorName || staffName} /> : null}
    </div>
  );
}

function RevokeDeviceForm({ slug, device, staffName, compact }: { slug: string; device: StaffDeviceViewModel; staffName: string; compact?: boolean }) {
  return (
    <form action={revokeStaffDeviceSessionAction.bind(null, slug)}>
      <input name="deviceSessionId" type="hidden" value={device.id} />
      <ConfirmSubmitButton
        className={`${compact ? "" : "w-full"} rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50`}
        message={`Khóa thiết bị của ${staffName}? Thiết bị này sẽ bị đăng xuất và không thể tiếp tục sử dụng phiên hiện tại.`}
      >
        Khóa thiết bị
      </ConfirmSubmitButton>
    </form>
  );
}

function StatusBadge({ status }: { status: StaffStatus }) {
  const styles: Record<StaffStatus, string> = {
    WORKING: "bg-teal-50 text-teal-700",
    OFF_SHIFT: "bg-amber-50 text-amber-700",
    LOCKED: "bg-slate-100 text-slate-500"
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}>{staffStatusLabel(status)}</span>;
}

function compareStaffRows(a: StaffViewModel, b: StaffViewModel) {
  const statusDiff = staffStatusRank[a.status] - staffStatusRank[b.status];
  if (statusDiff !== 0) return statusDiff;
  return a.name.localeCompare(b.name, "vi");
}

function getRequestOrigin() {
  const headerList = headers();
  const host = headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  return process.env.NEXTAUTH_URL ?? (host ? `${protocol}://${host}` : "http://localhost:3000");
}

function staffStatusLabel(status: StaffStatus) {
  if (status === "WORKING") return "Đang làm";
  if (status === "LOCKED") return "Đã khóa";
  return "Ngoài ca";
}

function deviceStatusLabel(device: StaffDeviceViewModel) {
  if (device.revokedAt || !device.isActive) return "Đã khóa";
  return device.onShift ? "Trong ca" : "Ngoài ca";
}

function StaffMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  helper: string;
  tone: "teal" | "blue" | "amber";
}) {
  const styles = {
    teal: "border-teal-100 bg-teal-50 text-teal-700",
    blue: "border-sky-100 bg-sky-50 text-sky-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700"
  }[tone];

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${styles}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className="text-xs text-slate-500">{helper}</p>
        </div>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-normal text-slate-950">{value}</p>
    </article>
  );
}

function lastSeenSummary(devices: StaffDeviceViewModel[]) {
  const latest = devices[0]?.lastSeenAt;
  return latest ? formatTime(latest) : "Chưa có";
}

function staffInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const selectedParts = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return selectedParts.map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(value);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function normalizeForFilter(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
