import type { RestaurantRole } from "@prisma/client";
import QRCode from "qrcode";
import Image from "next/image";
import { headers } from "next/headers";
import { ChefHat, Clock3, Receipt, Smartphone, UserCog, Users, type LucideIcon } from "lucide-react";
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
const staffRoleStyles: Record<RestaurantRole, { Icon: LucideIcon; shell: string; icon: string; accent: string }> = {
  OWNER: {
    Icon: UserCog,
    shell: "border-teal-100 bg-teal-50/70",
    icon: "bg-teal-700 text-white",
    accent: "text-teal-800"
  },
  MANAGER: {
    Icon: UserCog,
    shell: "border-teal-100 bg-teal-50/70",
    icon: "bg-teal-700 text-white",
    accent: "text-teal-800"
  },
  WAITER: {
    Icon: Users,
    shell: "border-sky-100 bg-sky-50/70",
    icon: "bg-sky-600 text-white",
    accent: "text-sky-800"
  },
  KITCHEN: {
    Icon: ChefHat,
    shell: "border-amber-100 bg-amber-50/70",
    icon: "bg-amber-600 text-white",
    accent: "text-amber-800"
  },
  CASHIER: {
    Icon: Receipt,
    shell: "border-emerald-100 bg-emerald-50/70",
    icon: "bg-emerald-600 text-white",
    accent: "text-emerald-800"
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

        {staffRows.length ? groupedStaff.map((group) => (
          <section key={group.role} className={`space-y-3 rounded-2xl border p-4 ${staffRoleStyles[group.role].shell}`} data-staff-group>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${staffRoleStyles[group.role].icon}`}>
                  {(() => {
                    const Icon = staffRoleStyles[group.role].Icon;
                    return <Icon className="h-5 w-5" />;
                  })()}
                </span>
                <div>
                  <h3 className={`text-sm font-bold uppercase tracking-wide ${staffRoleStyles[group.role].accent}`}>{group.title}</h3>
                  <p className="text-xs text-slate-500">{restaurantRoleLabels[group.role]}</p>
                </div>
              </div>
              <span className="rounded-full border bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">{group.rows.length} nhân viên</span>
            </div>
            {group.rows.length ? (
              <div className="space-y-3">
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
            ) : (
              <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-slate-500">Chưa có nhân sự trong bộ phận này.</p>
            )}
            <p data-staff-group-empty hidden className="rounded-lg border border-dashed bg-white p-4 text-sm text-slate-500">Không có nhân sự phù hợp bộ lọc.</p>
          </section>
        )) : (
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
  const RoleIcon = roleStyle.Icon;

  return (
    <article
      className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-md"
      data-staff-card
      data-staff-name={normalizeForFilter(staff.name)}
      data-staff-username={normalizeForFilter(staff.username)}
      data-staff-status={staff.status}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${roleStyle.icon}`}>
            <RoleIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-base font-semibold text-slate-950">{staff.name}</h4>
              <StatusBadge status={staff.status} />
            </div>
            <p className="mt-1 text-sm font-medium text-slate-700">{restaurantRoleLabels[staff.role]}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
              <span className="rounded-full bg-slate-100 px-2.5 py-1">@{staff.username}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1">{activeDevices.length} thiết bị hoạt động</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1">Gần nhất: {lastSeenSummary(staff.devices)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <details data-staff-panel>
            <summary className="cursor-pointer list-none rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">Chỉnh sửa</summary>
            <div className="mt-2 w-full rounded-lg border bg-white p-3 shadow-sm lg:w-[520px]">
              <EditStaffForms staff={staff} slug={slug} assignableRoles={assignableRoles} canEditRole={canEditRole} isSelf={isSelf} />
            </div>
          </details>
          {staff.devices.length > 0 ? (
            <details data-staff-panel>
              <summary className="cursor-pointer list-none rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50">Xem thiết bị</summary>
              <DeviceList slug={slug} staffName={staff.name} devices={staff.devices} />
            </details>
          ) : null}
        </div>
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
        <p className="text-xs text-slate-500">{deviceStatusLabel(device)} · {formatTime(device.lastSeenAt)}</p>
      </div>
      {canRevoke && forceAction ? <RevokeDeviceForm slug={slug} device={device} staffName={staffName} /> : null}
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
