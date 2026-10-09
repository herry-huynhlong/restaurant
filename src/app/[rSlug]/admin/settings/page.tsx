import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { PushNotificationButton } from "@/components/app-shell/push-notification-button";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { SettingsImageUpload } from "@/components/admin/settings-image-upload";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { servedUploadUrl } from "@/lib/upload-url";
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
  const logoUrl = servedUploadUrl(settings?.logoUrl ?? restaurant.logoUrl);
  const paymentQrUrl = servedUploadUrl(settings?.paymentQrImage);
  const notificationEnabled = settings
    ? settings.notifyNewOrder || settings.notifyServiceRequest || settings.notifyPaymentRequest
    : true;

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Cài đặt" userName={access.user.name} notifications={notifications} plan={access.restaurant.plan} businessType={access.restaurant.businessType}>
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <form className="space-y-6" action={updateRestaurantSettingsAction.bind(null, access.restaurant.slug)} encType="multipart/form-data">
        <SettingsSection title="Thông tin quán">
          <Text name="restaurantName" label="Tên quán" defaultValue={settings?.restaurantName ?? restaurant.name} required />
          <SettingsImageUpload name="logoFile" label="Logo quán" currentUrl={logoUrl} />
          <Text name="address" label="Địa chỉ" defaultValue={settings?.address} />
          <Text name="phone" label="Số điện thoại" defaultValue={settings?.phone} />
          <Text name="timezone" label="Timezone" defaultValue={settings?.timezone ?? "Asia/Ho_Chi_Minh"} required />
          <Text name="currency" label="Currency" defaultValue={settings?.currency ?? "VND"} required />
        </SettingsSection>

        <SettingsSection title="Ngôn ngữ">
          <label className="block text-sm font-medium">
            Ngôn ngữ mặc định
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3" name="primaryLanguage" defaultValue={settings?.primaryLanguage ?? "vi"}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="rounded-md border p-4 text-sm text-slate-600">Ngôn ngữ mặc định của quán.</div>
        </SettingsSection>

        <SettingsSection title="Thanh toán">
          <Check name="cashEnabled" label="Tiền mặt" defaultChecked={settings?.cashEnabled ?? true} />
          <Check name="qrPaymentEnabled" label="Mã QR" defaultChecked={settings?.qrPaymentEnabled ?? true} />
          <div className="md:col-span-2">
            <SettingsImageUpload name="paymentQrFile" label="Ảnh mã QR thanh toán" currentUrl={paymentQrUrl} previewClassName="h-32 w-32" />
          </div>
        </SettingsSection>

        <SettingsSection title="Thông báo">
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Cho phép thông báo trên thiết bị này</p>
            <PushNotificationButton slug={access.restaurant.slug} />
          </div>
          <Check name="notificationEnabled" label="Thông báo hệ thống" defaultChecked={notificationEnabled} />
          <Check name="notificationSoundEnabled" label="Âm thanh" defaultChecked={settings?.notificationSoundEnabled ?? true} />
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
