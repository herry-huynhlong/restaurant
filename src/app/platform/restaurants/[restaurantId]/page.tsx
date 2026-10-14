import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock3,
  Edit3,
  FileClock,
  Hash,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  ShieldAlert,
  Store,
  Timer,
  Users,
  Utensils,
  type LucideIcon
} from "lucide-react";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PlatformRestaurantActions } from "@/components/platform/restaurant-row-actions";
import { productBrand } from "@/lib/brand";
import { isPlatformOwnerRole, requirePlatformAdmin } from "@/lib/rbac/guards";
import { platformRoutes } from "@/lib/routes";
import { getBusinessTypeLabel } from "@/lib/business-type";
import { restaurantStatusLabel, subscriptionStatusLabel } from "@/lib/platform/restaurant-status";
import { planDisplayLabel } from "@/lib/plan/features";
import { getRoleLabel } from "@/lib/restaurant-role-labels";
import { servedUploadUrl } from "@/lib/upload-url";
import { getPlatformRestaurantDetail } from "@/server/services/platform-service";
import { changePlanAction, extendSubscriptionAction } from "@/app/platform/restaurants/actions";

export default async function RestaurantDetailPage({
  params,
  searchParams
}: {
  params: { restaurantId: string };
  searchParams?: { error?: string; success?: string };
}) {
  const user = await requirePlatformAdmin();
  const restaurant = await getPlatformRestaurantDetail(params.restaurantId);

  if (!restaurant) {
    notFound();
  }

  const ownerMembership = restaurant.users.find((membership) => membership.role === "OWNER");
  const staffMemberships = restaurant.users.filter((membership) => membership.role !== "OWNER");
  const logoUrl = servedUploadUrl(restaurant.settings?.logoUrl ?? restaurant.logoUrl);
  const daysRemaining = getDaysRemaining(restaurant.subscriptionEnd);
  const isExpiringSoon = typeof daysRemaining === "number" && daysRemaining >= 0 && daysRemaining <= 14;
  const isExpired = typeof daysRemaining === "number" && daysRemaining < 0;
  const isDeleted = restaurant.status === "DELETED";
  const planLabel = planDisplayLabel(restaurant.plan, restaurant.planEntitlement);
  const canManageSensitive = isPlatformOwnerRole(user.platformRole);

  return (
    <PlatformShell title="Chi tiết nhà hàng">
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link className="hover:text-teal-700" href={platformRoutes.dashboard}>{productBrand.adminName}</Link>
        <span>/</span>
        <Link className="hover:text-teal-700" href={platformRoutes.restaurants}>Nhà hàng</Link>
        <span>/</span>
        <span className="font-medium text-slate-800">Chi tiết</span>
      </div>

      <section className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm">
        <div className="border-b border-teal-100 bg-gradient-to-br from-teal-800 via-teal-700 to-slate-900 px-5 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <RestaurantAvatar name={restaurant.name} logoUrl={logoUrl} />
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge className={statusBadgeClass(restaurant.status)}>{restaurantStatusLabel(restaurant.status)}</Badge>
                  <Badge className={planBadgeClass(restaurant.plan)}>{planLabel}</Badge>
                  <Badge className="border-white/20 bg-white/10 text-white">{getBusinessTypeLabel(restaurant.businessType)}</Badge>
                </div>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{restaurant.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-teal-50">
                  <span className="inline-flex items-center gap-1.5"><Hash className="h-4 w-4" /> Mã đường dẫn: {restaurant.slug}</span>
                  <span className="inline-flex items-center gap-1.5"><Store className="h-4 w-4" /> {getBusinessTypeLabel(restaurant.businessType)}</span>
                  <span className="inline-flex items-center gap-1.5"><ReceiptText className="h-4 w-4" /> {subscriptionStatusLabel(restaurant.subscriptionStatus)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-teal-800 shadow-sm hover:bg-teal-50" href={platformRoutes.restaurantEdit(restaurant.id)}>
                <Edit3 className="h-4 w-4" />
                Chỉnh sửa
              </Link>
              <Link className="inline-flex items-center gap-2 rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10" href={platformRoutes.restaurants}>
                <ArrowLeft className="h-4 w-4" />
                Danh sách
              </Link>
            </div>
          </div>
        </div>

        {(isExpiringSoon || isExpired || isDeleted) ? (
          <div className={`flex items-start gap-3 px-5 py-4 text-sm sm:px-7 ${isExpired || isDeleted ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {isDeleted
                ? "Nhà hàng này đang ở trạng thái đã xóa. Dữ liệu lịch sử được giữ lại và chỉ quản trị viên nền tảng có thể khôi phục."
                : isExpired
                  ? "Gói dịch vụ đã hết hạn. Hãy gia hạn để tránh gián đoạn vận hành."
                  : `Gói dịch vụ còn ${daysRemaining} ngày. Nên gia hạn sớm để duy trì hoạt động ổn định.`}
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={BadgeCheck} label="Trạng thái nhà hàng" value={restaurantStatusLabel(restaurant.status)} tone={restaurant.status === "ACTIVE" ? "green" : restaurant.status === "DELETED" ? "red" : "amber"} />
        <MetricCard icon={ReceiptText} label="Gói dịch vụ" value={planLabel} tone={restaurant.plan === "PRO" || restaurant.plan === "TRAIN" && restaurant.planEntitlement === "PRO" ? "champagne" : "neutral"} />
        <MetricCard icon={CalendarClock} label="Ngày hết hạn" value={formatDate(restaurant.subscriptionEnd)} tone={isExpired ? "red" : isExpiringSoon ? "amber" : "neutral"} />
        <MetricCard icon={Timer} label="Số ngày còn lại" value={formatDaysRemaining(daysRemaining)} tone={isExpired ? "red" : isExpiringSoon ? "amber" : "green"} />
        <MetricCard icon={Utensils} label="Tổng bàn" value={restaurant._count.tables} tone="neutral" />
        <MetricCard icon={Users} label="Tổng nhân viên" value={restaurant._count.users} tone="neutral" />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        {canManageSensitive ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Gói dịch vụ & Gia hạn</h2>
              <p className="mt-1 text-sm text-slate-500">Quản lý gói dịch vụ, hạn sử dụng và trạng thái sử dụng.</p>
            </div>
            <Badge className={planBadgeClass(restaurant.plan)}>{planLabel}</Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniInfo label="Ngày bắt đầu" value={formatDate(restaurant.subscriptionStart)} />
            <MiniInfo label="Ngày hết hạn" value={formatDate(restaurant.subscriptionEnd)} />
            <MiniInfo label="Còn lại" value={formatDaysRemaining(daysRemaining)} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form className="rounded-xl border border-slate-200 bg-slate-50 p-4" action={changePlanAction}>
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <input name="returnTo" type="hidden" value={platformRoutes.restaurantDetail(restaurant.id)} />
              <label className="block text-sm font-medium">
                Chọn gói mới
                <select className="mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100" name="plan" defaultValue={restaurant.businessType === "DRINK_SHOP" ? "BASIC" : restaurant.plan === "PRO" ? "PRO" : "BASIC"} disabled={restaurant.businessType === "DRINK_SHOP"}>
                  <option value="BASIC">BASIC</option>
                  {restaurant.businessType !== "DRINK_SHOP" ? <option value="PRO">PRO</option> : null}
                </select>
              </label>
              {restaurant.businessType === "DRINK_SHOP" ? <input name="plan" type="hidden" value="BASIC" /> : null}
              <button className="mt-3 inline-flex h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
                Đổi gói
              </button>
            </form>

            <form className="rounded-xl border border-slate-200 bg-slate-50 p-4" action={extendSubscriptionAction}>
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <label className="block text-sm font-medium">
                Chọn ngày gia hạn
                <input className="mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm" name="subscriptionEnd" type="date" />
              </label>
              <input name="plan" type="hidden" value={restaurant.businessType === "DRINK_SHOP" ? "BASIC" : restaurant.plan === "PRO" ? "PRO" : "BASIC"} />
              <button className="mt-3 inline-flex h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100" type="submit">
                Gia hạn
              </button>
            </form>
          </div>
        </section>
        ) : (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Gói dịch vụ & Gia hạn</h2>
              <p className="mt-1 text-sm text-slate-500">Thông tin gói hiện tại của nhà hàng.</p>
            </div>
            <Badge className={planBadgeClass(restaurant.plan)}>{planLabel}</Badge>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniInfo label="Ngày bắt đầu" value={formatDate(restaurant.subscriptionStart)} />
            <MiniInfo label="Ngày hết hạn" value={formatDate(restaurant.subscriptionEnd)} />
            <MiniInfo label="Còn lại" value={formatDaysRemaining(daysRemaining)} />
          </div>
        </section>
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Thông tin nhà hàng</h2>
          <div className="mt-4 grid gap-3">
            <InfoRow icon={Building2} label="Tên nhà hàng" value={restaurant.name} />
            <InfoRow icon={Hash} label="Mã đường dẫn" value={restaurant.slug} monospace />
            <InfoRow icon={Store} label="Loại hình" value={getBusinessTypeLabel(restaurant.businessType)} />
            <InfoRow icon={Phone} label="Số điện thoại" value={restaurant.settings?.phone} />
            <InfoRow icon={MapPin} label="Địa chỉ" value={restaurant.settings?.address} />
            <InfoRow icon={Clock3} label="Múi giờ" value={restaurant.settings?.timezone} />
            <InfoRow icon={Users} label="Chủ quán" value={ownerMembership?.user.name} />
            <InfoRow icon={Mail} label="Email chủ quán" value={ownerMembership?.user.email} />
          </div>
        </section>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
          <h2 className="text-lg font-semibold">Chủ quán & Nhân viên</h2>
              <p className="mt-1 text-sm text-slate-500">{staffMemberships.length} nhân viên ngoài chủ quán</p>
            </div>
          </div>

          {ownerMembership ? (
            <article className="mt-4 flex items-center gap-3 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
              <InitialAvatar name={ownerMembership.user.name} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{ownerMembership.user.name}</p>
                <p className="truncate text-sm text-slate-600">{ownerMembership.user.email}</p>
                <p className="mt-1 text-xs font-semibold text-teal-700">{getRoleLabel(ownerMembership.role)}</p>
              </div>
            </article>
          ) : (
            <EmptyText text="Chưa có tài khoản chủ quán." />
          )}

          <div className="mt-4 space-y-2">
            {staffMemberships.length ? staffMemberships.slice(0, 8).map((membership) => (
              <article key={membership.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <InitialAvatar name={membership.user.name} compact />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{membership.user.name}</p>
                    <p className="truncate text-xs text-slate-500">{membership.user.email}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{getRoleLabel(membership.role)}</span>
              </article>
            )) : <EmptyText text="Chưa có nhân viên." />}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Bàn & Khu vực</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {restaurant.tables.length ? restaurant.tables.slice(0, 12).map((table) => (
              <div key={table.id} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
                <p className="font-semibold">{table.name}</p>
                <p className="mt-1 text-xs text-slate-500">{table.area.name} · {tableStatusLabel(table.status)}</p>
              </div>
            )) : <EmptyText text="Chưa có bàn." />}
          </div>
        </section>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Nhật ký hoạt động</h2>
        <div className="mt-5 space-y-4">
          {restaurant.auditLogs.length ? restaurant.auditLogs.map((log) => (
            <article key={log.id} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${auditTone(log.action)}`}>
                  <FileClock className="h-4 w-4" />
                </span>
                <span className="mt-2 h-full w-px bg-slate-200" />
              </div>
              <div className="min-w-0 flex-1 rounded-xl border bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">{activityLabel(log.action)}</p>
                  <time className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</time>
                </div>
                <p className="mt-1 text-sm text-slate-600">Người thực hiện: {log.user?.email ?? "Hệ thống"}</p>
              </div>
            </article>
          )) : <EmptyText text="Chưa có nhật ký hoạt động." />}
        </div>
      </section>

      {canManageSensitive ? (
      <section className="mt-5 rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-red-800">
              <ShieldAlert className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Khu vực thao tác nhạy cảm</h2>
            </div>
            <p className="mt-2 text-sm text-red-800">
              Khóa nhà hàng sẽ chặn toàn bộ chủ quán, nhân viên và khách. Xóa nhà hàng cần xác nhận mã đường dẫn và mặc định chỉ đánh dấu đã xóa để bảo toàn dữ liệu lịch sử.
            </p>
          </div>
          <PlatformRestaurantActions
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            restaurantSlug={restaurant.slug}
            status={restaurant.status}
            plan={restaurant.plan}
            planEntitlement={restaurant.planEntitlement}
            businessType={restaurant.businessType}
            returnTo={platformRoutes.restaurantDetail(restaurant.id)}
            showPlanAction={false}
            showResetPasswordAction={false}
          />
        </div>
      </section>
      ) : null}

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Thao tác thông thường</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50" href={platformRoutes.restaurantEdit(restaurant.id)}>
            <Edit3 className="h-4 w-4" />
            Chỉnh sửa
          </Link>
          <PlatformRestaurantActions
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            restaurantSlug={restaurant.slug}
            status={restaurant.status}
            plan={restaurant.plan}
            planEntitlement={restaurant.planEntitlement}
            businessType={restaurant.businessType}
            returnTo={platformRoutes.restaurantDetail(restaurant.id)}
            showStatusAction={false}
            showPlanAction={false}
            showDeleteAction={false}
          />
        </div>
      </section>
    </PlatformShell>
  );
}

function RestaurantAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/15 text-2xl font-bold text-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logoUrl ? <img alt={`Logo ${name}`} className="h-full w-full object-cover" src={logoUrl} /> : getInitial(name)}
    </div>
  );
}

function InitialAvatar({ name, compact = false }: { name: string | null; compact?: boolean }) {
  return (
    <div className={`${compact ? "h-9 w-9 text-sm" : "h-12 w-12 text-base"} flex shrink-0 items-center justify-center rounded-full bg-teal-700 font-semibold text-white`}>
      {getInitial(name ?? "")}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string | number; tone: "green" | "amber" | "red" | "champagne" | "neutral" }) {
  const styles = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
    champagne: "border-amber-100 bg-[#fff7df] text-amber-800",
    neutral: "border-slate-100 bg-slate-50 text-slate-700"
  }[tone];

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${styles}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p>
    </article>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, monospace = false }: { icon: LucideIcon; label: string; value?: string | null; monospace?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-slate-50 px-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 break-words text-sm font-semibold text-slate-900 ${monospace ? "font-mono" : ""}`}>{value || "Chưa cập nhật"}</p>
      </div>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">{text}</p>;
}

function statusBadgeClass(status: string) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "DELETED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "SUSPENDED") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function planBadgeClass(plan: string) {
  if (plan === "PRO") return "border-amber-200 bg-[#fff7df] text-amber-900";
  if (plan === "BASIC") return "border-teal-200 bg-teal-50 text-teal-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function auditTone(action: string) {
  if (action.includes("DELETED") || action.includes("SUSPENDED")) return "bg-red-50 text-red-700";
  if (action.includes("RESTORED") || action.includes("ACTIVATED") || action.includes("CREATED")) return "bg-emerald-50 text-emerald-700";
  if (action.includes("PLAN") || action.includes("SUBSCRIPTION")) return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    RESTAURANT_CREATED: "Tạo nhà hàng",
    RESTAURANT_UPDATED: "Cập nhật nhà hàng",
    RESTAURANT_STATUS_CHANGED: "Đổi trạng thái nhà hàng",
    RESTAURANT_SOFT_DELETED: "Xóa nhà hàng",
    RESTAURANT_RESTORED: "Khôi phục nhà hàng",
    RESTAURANT_PERMANENT_DELETE_REQUESTED: "Xóa vĩnh viễn nhà hàng",
    SUBSCRIPTION_EXTENDED: "Gia hạn gói dịch vụ",
    SUBSCRIPTION_REQUEST_CONFIRMED: "Xác nhận yêu cầu gói dịch vụ",
    SUBSCRIPTION_REQUEST_CREATED: "Tạo yêu cầu gói dịch vụ",
    SUBSCRIPTION_REQUEST_REJECTED: "Từ chối yêu cầu gói dịch vụ",
    SUBSCRIPTION_UPGRADED: "Nâng cấp gói dịch vụ",
    PLAN_CHANGED: "Đổi gói dịch vụ",
    OWNER_PASSWORD_RESET: "Đặt lại mật khẩu chủ quán",
    OWNER_UPDATED: "Cập nhật tài khoản chủ quán",
    OWNER_NAME_UPDATED: "Cập nhật họ tên chủ quán",
    ADMIN_PASSWORD_RESET: "Đặt lại mật khẩu chủ quán",
    PLATFORM_ADMIN_PASSWORD_CHANGED: "Đổi mật khẩu quản trị nền tảng",
    PLATFORM_SUB_ADMIN_CREATED: "Tạo quản trị phụ",
    PLATFORM_SUB_ADMIN_UPDATED: "Cập nhật quản trị phụ",
    PLATFORM_SUB_ADMIN_PASSWORD_RESET: "Đặt lại mật khẩu quản trị phụ",
    PLAN_PERMISSION_MATRIX_CONFIRMED: "Xác nhận quyền lợi gói dịch vụ"
  };

  return labels[action] ?? "Cập nhật hệ thống";
}

function tableStatusLabel(status: string) {
  const labels: Record<string, string> = {
    AVAILABLE: "Đang trống",
    OCCUPIED: "Đang phục vụ",
    PAYMENT_REQUESTED: "Chờ thanh toán",
    DISABLED: "Ngừng sử dụng"
  };

  return labels[status] ?? "Đang cập nhật";
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "N";
}

function getDaysRemaining(date: Date | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function formatDaysRemaining(days: number | null) {
  if (days === null) return "Chưa cập nhật";
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return "Hết hạn hôm nay";
  return `${days} ngày`;
}

function formatDate(date: Date | null) {
  return date ? new Intl.DateTimeFormat("vi-VN").format(date) : "Chưa cập nhật";
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

