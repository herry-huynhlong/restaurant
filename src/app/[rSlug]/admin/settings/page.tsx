import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { InstallAppButton } from "@/components/app-shell/install-app-button";
import { SoundUnlockButton } from "@/components/app-shell/sound-unlock-button";
import { PushNotificationButton } from "@/components/app-shell/push-notification-button";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { getRecentNotifications } from "@/server/services/notification-service";
import { updateRestaurantSettingsAction } from "@/app/[rSlug]/admin/actions";

export default async function SettingsPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [restaurant, notifications] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: access.restaurant.id },
      include: { settings: true }
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  if (!restaurant) return null;
  const settings = restaurant.settings;

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Cài đặt" userName={access.user.name} notifications={notifications} plan={access.restaurant.plan}>
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <form className="space-y-6" action={updateRestaurantSettingsAction.bind(null, access.restaurant.slug)}>
        <SettingsSection title="Thông tin quán">
          <Text name="restaurantName" label="Tên quán" defaultValue={settings?.restaurantName ?? restaurant.name} required />
          <Text name="logoUrl" label="Logo URL" defaultValue={settings?.logoUrl ?? restaurant.logoUrl} />
          <Text name="address" label="Địa chỉ" defaultValue={settings?.address} />
          <Text name="phone" label="Số điện thoại" defaultValue={settings?.phone} />
          <Text name="timezone" label="Timezone" defaultValue={settings?.timezone ?? "Asia/Ho_Chi_Minh"} required />
          <Text name="currency" label="Currency" defaultValue={settings?.currency ?? "VND"} required />
        </SettingsSection>

        <SettingsSection title="Giao diện">
          <Text name="primaryColor" label="Primary Color" type="color" defaultValue={settings?.primaryColor ?? "#0f766e"} required />
          <div className="rounded-md border p-4">
            <p className="text-sm text-slate-600">Preview button</p>
            <button className="mt-2 rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: settings?.primaryColor ?? "#0f766e" }} type="button">
              Gọi món
            </button>
          </div>
        </SettingsSection>

        <SettingsSection title="Ngôn ngữ">
          <label className="block text-sm font-medium">
            Ngôn ngữ mặc định
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3" name="primaryLanguage" defaultValue={settings?.primaryLanguage ?? "vi"}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="rounded-md border p-4 text-sm text-slate-600">Customer luôn có switch VI | EN. Nếu tên EN trống, UI fallback về tên VI.</div>
        </SettingsSection>

        <SettingsSection title="Thanh toán">
          <Check name="cashEnabled" label="Cash enabled" defaultChecked={settings?.cashEnabled ?? true} />
          <Check name="qrPaymentEnabled" label="QR payment enabled" defaultChecked={settings?.qrPaymentEnabled ?? true} />
          <Text name="bankName" label="Bank name" defaultValue={settings?.bankName} />
          <Text name="bankCode" label="Bank code" defaultValue={settings?.bankCode} />
          <Text name="accountNumber" label="Account number" defaultValue={settings?.accountNumber} />
          <Text name="accountHolder" label="Account holder" defaultValue={settings?.accountHolder} />
          <Text name="paymentQrImage" label="QR image URL" defaultValue={settings?.paymentQrImage} />
        </SettingsSection>

        <SettingsSection title="Hóa đơn & Thuế">
          <Text name="invoiceBusinessName" label="Tên doanh nghiệp / tên quán" defaultValue={settings?.invoiceBusinessName ?? settings?.restaurantName ?? restaurant.name} />
          <Text name="invoiceDisplayName" label="Tên hiển thị trên hóa đơn" defaultValue={settings?.invoiceDisplayName ?? settings?.restaurantName ?? restaurant.name} />
          <Text name="invoiceTaxCode" label="Mã số thuế" defaultValue={settings?.invoiceTaxCode} />
          <Text name="invoiceEmail" label="Email hóa đơn" type="email" defaultValue={settings?.invoiceEmail} />
          <Check name="taxEnabled" label="Áp dụng thuế" defaultChecked={settings?.taxEnabled ?? false} />
          <Text name="taxRate" label="Thuế suất (%)" type="number" step="0.01" min="0" max="100" defaultValue={settings?.taxRate ? String(settings.taxRate) : "0"} />
        </SettingsSection>

        <SettingsSection title="Thông báo">
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Thông báo đẩy</p>
            <PushNotificationButton slug={access.restaurant.slug} />
          </div>
          <Check name="notificationSoundEnabled" label="Âm thanh thông báo ON/OFF" defaultChecked={settings?.notificationSoundEnabled ?? true} />
          <Check name="notifyNewOrder" label="Thông báo order mới" defaultChecked={settings?.notifyNewOrder ?? true} />
          <Check name="notifyServiceRequest" label="Thông báo khách gọi nhân viên" defaultChecked={settings?.notifyServiceRequest ?? true} />
          <Check name="notifyPaymentRequest" label="Thông báo yêu cầu thanh toán" defaultChecked={settings?.notifyPaymentRequest ?? true} />
          <SoundUnlockButton />
        </SettingsSection>

        <SettingsSection title="Ứng dụng">
          <div className="rounded-md border p-4">
            <h3 className="font-semibold">Cài đặt ứng dụng</h3>
            <p className="mt-1 text-sm text-slate-600">Cài ứng dụng lên thiết bị để mở nhanh như app.</p>
            <div className="mt-3"><InstallAppButton compact /></div>
          </div>
        </SettingsSection>

        <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" type="submit">
          Lưu cài đặt
        </button>
      </form>
    </RestaurantAdminShell>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Text({ label, name, defaultValue, type = "text", required = false, step, min, max }: { label: string; name: string; defaultValue?: string | null; type?: string; required?: boolean; step?: string; min?: string; max?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input className="mt-1 h-10 w-full rounded-md border px-3" name={name} type={type} defaultValue={defaultValue ?? ""} required={required} step={step} min={min} max={max} />
    </label>
  );
}

function Check({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
