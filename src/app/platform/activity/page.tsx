import { PlatformShell } from "@/components/app-shell/platform-shell";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { getPlatformAuditLogs } from "@/server/services/platform-service";

export default async function PlatformActivityPage() {
  await requirePlatformAdmin();
  const logs = await getPlatformAuditLogs();
  return (
    <PlatformShell title="Hoạt động hệ thống">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="space-y-2">
          {logs.map((log) => (
            <p key={log.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              {activityLabel(log.action)} · {log.restaurant?.name ?? "Nền tảng"} · {log.user?.email ?? "Hệ thống"}
            </p>
          ))}
        </div>
      </section>
    </PlatformShell>
  );
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
