import { Building2, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { requirePlatformOwner } from "@/lib/rbac/guards";
import { changePlatformAdminPasswordAction, updateSubscriptionPaymentConfigAction } from "@/app/platform/settings/actions";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { ActionFormEffects } from "@/components/ui/action-form-effects";
import { getPlatformSubscriptionPaymentConfig, supportedVietQrBanks } from "@/server/services/platform-subscription-payment-config-service";

export default async function PlatformSettingsPage({
  searchParams
}: {
  searchParams: { success?: string; error?: string };
}) {
  const [user, paymentConfig] = await Promise.all([requirePlatformOwner(), getPlatformSubscriptionPaymentConfig()]);

  return (
    <PlatformShell title="Cài đặt nền tảng">
      <FeedbackBanner success={searchParams.success} error={searchParams.error} />
      <ActionFormEffects success={searchParams.success} />

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-teal-800">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Tài khoản quản trị nền tảng</h2>
            <p className="mt-1 text-sm text-slate-500">
              Quản lý thông tin đăng nhập của tài khoản quản trị nền tảng đang sử dụng.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(360px,1.2fr)]">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 font-semibold text-white">
                {(user.name ?? user.email ?? "A").trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{user.name || "Quản trị viên nền tảng"}</p>
                <p className="truncate text-sm text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border bg-white px-3 py-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <UserCog className="h-4 w-4 text-teal-700" />
                Quyền hiện tại
              </div>
              <p className="mt-1 text-slate-500">Chủ quản trị nền tảng</p>
            </div>
          </div>

          <form className="rounded-2xl border bg-white p-4" action={changePlatformAdminPasswordAction}>
            <div className="flex items-center gap-2 text-teal-800">
              <KeyRound className="h-5 w-5" />
              <h3 className="font-semibold">Đổi mật khẩu đăng nhập</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Mật khẩu mới dùng cho trang đăng nhập quản trị nền tảng. Không ảnh hưởng mật khẩu chủ quán.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                Email đăng nhập
                <input className="mt-2 h-11 w-full rounded-md border bg-slate-50 px-3 text-sm text-slate-600" type="email" value={user.email ?? ""} readOnly />
              </label>

              <label className="block text-sm font-medium sm:col-span-2">
                Mật khẩu hiện tại
                <input className="mt-2 h-11 w-full rounded-md border px-3 text-sm" name="currentPassword" type="password" autoComplete="current-password" required />
              </label>

              <label className="block text-sm font-medium">
                Mật khẩu mới
                <input className="mt-2 h-11 w-full rounded-md border px-3 text-sm" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
              </label>

              <label className="block text-sm font-medium">
                Xác nhận mật khẩu mới
                <input className="mt-2 h-11 w-full rounded-md border px-3 text-sm" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
              </label>
            </div>

            <PendingSubmitButton className="mt-5 inline-flex h-11 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800" pendingLabel="Đang đổi...">
              Đổi mật khẩu
            </PendingSubmitButton>
          </form>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-teal-800">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Ngân hàng nhận tiền gói dịch vụ</h2>
            <p className="mt-1 text-sm text-slate-500">Chỉ dùng cho thanh toán đăng ký và gia hạn QuánPilot. Không ảnh hưởng tài khoản nhận tiền hóa đơn của từng cửa hàng.</p>
          </div>
        </div>

        <form className="mt-5 max-w-2xl" action={updateSubscriptionPaymentConfigAction}>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border bg-slate-50 px-3 text-sm font-semibold text-slate-800">
            <input className="h-4 w-4 accent-teal-700" defaultChecked={paymentConfig?.isEnabled ?? false} name="isEnabled" type="checkbox" />
            Cho phép tạo QR thanh toán gói dịch vụ
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Ngân hàng
              <select className="mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm" defaultValue={paymentConfig?.bankCode ?? ""} name="bankCode">
                <option value="">Chọn ngân hàng</option>
                {supportedVietQrBanks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Số tài khoản
              <input className="mt-2 h-11 w-full rounded-md border px-3 text-sm" defaultValue={paymentConfig?.accountNumber ?? ""} inputMode="numeric" name="accountNumber" placeholder="Chỉ nhập chữ số" />
            </label>
            <label className="block text-sm font-medium sm:col-span-2">
              Tên chủ tài khoản
              <input className="mt-2 h-11 w-full rounded-md border px-3 text-sm" defaultValue={paymentConfig?.accountName ?? ""} name="accountName" placeholder="Theo thông tin ngân hàng" />
            </label>
          </div>

          {paymentConfig?.isEnabled ? <p className="mt-3 text-sm text-teal-800">Đang hoạt động · Phiên bản cấu hình {paymentConfig.version}. Các lệnh đã tạo vẫn giữ thông tin ngân hàng tại thời điểm tạo.</p> : <p className="mt-3 text-sm text-amber-800">Đang tắt. Chủ quán sẽ không thể tạo lệnh thanh toán subscription mới.</p>}

          <PendingSubmitButton className="mt-5 inline-flex h-11 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800" pendingLabel="Đang lưu...">
            Lưu cấu hình thanh toán
          </PendingSubmitButton>
        </form>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5 text-sm text-slate-600 shadow-sm">
        Các thiết lập chung khác sẽ được bổ sung khi cần.
      </section>
    </PlatformShell>
  );
}
