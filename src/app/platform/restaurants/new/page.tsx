import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { BusinessPlanFields } from "@/components/platform/business-plan-fields";
import { CreateRestaurantSubmitButton, LogoUploadInput, RestaurantSlugField } from "@/components/platform/restaurant-form-controls";
import { TextField, SelectField } from "@/components/ui/form-fields";
import { isPlatformOwnerRole, requirePlatformAdmin } from "@/lib/rbac/guards";
import { createRestaurantAction } from "@/app/platform/restaurants/actions";

export default async function NewRestaurantPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const user = await requirePlatformAdmin();
  const canManageSensitive = isPlatformOwnerRole(user.platformRole);

  return (
    <PlatformShell title="Thêm nhà hàng">
      <FeedbackBanner error={searchParams?.error} />
      <form className="space-y-6 rounded-lg border bg-white p-5 shadow-sm" action={createRestaurantAction} encType="multipart/form-data">
        <FormSection title="Thông tin nhà hàng">
          <TextField label="Tên nhà hàng *" name="name" required />
          <RestaurantSlugField label="Mã đường dẫn *" name="slug" required />
          <LogoUploadField />
          <TextField label="Số điện thoại" name="phone" />
          <TextField label="Địa chỉ" name="address" />
          <TextField label="Múi giờ" name="timezone" defaultValue="Asia/Ho_Chi_Minh" required />
          <SelectField label="Ngôn ngữ mặc định" name="primaryLanguage" options={[["vi", "Tiếng Việt"], ["en", "English"]]} />
          <TextField label="Đơn vị tiền tệ" name="currency" defaultValue="VND" required />
        </FormSection>

        <FormSection title="Chủ quán">
          <TextField label="Tên chủ quán *" name="ownerName" required />
          <TextField label="Email chủ quán *" name="ownerEmail" type="email" required />
          <TextField label="Mật khẩu khởi tạo *" name="ownerPassword" type="password" required />
          <TextField label="Số điện thoại chủ quán" name="ownerPhone" />
        </FormSection>

        {canManageSensitive ? (
          <FormSection title="Gói dịch vụ và trạng thái">
            <BusinessPlanFields defaultBusinessType="RESTAURANT" defaultPlan="BASIC" />
            <TextField label="Ngày bắt đầu" name="subscriptionStart" type="date" />
            <TextField label="Ngày hết hạn" name="subscriptionEnd" type="date" />
            <SelectField label="Trạng thái gói dịch vụ" name="subscriptionStatus" options={[["ACTIVE", "Đang hoạt động"], ["EXPIRED", "Hết hạn"], ["SUSPENDED", "Tạm ngừng"]]} />
            <SelectField label="Trạng thái nhà hàng" name="status" options={[["ACTIVE", "Đang hoạt động"], ["SUSPENDED", "Đã khóa"], ["INACTIVE", "Chưa hoạt động"]]} />
          </FormSection>
        ) : (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Nhà hàng do quản trị phụ tạo sẽ mặc định ở trạng thái Chưa hoạt động và gói BASIC. Chủ quản trị nền tảng sẽ kiểm tra trước khi mở sử dụng.
          </section>
        )}

        <CreateRestaurantSubmitButton />
      </form>
    </PlatformShell>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function LogoUploadField() {
  return (
    <label className="block text-sm font-medium">
      Logo nhà hàng
      <LogoUploadInput />
    </label>
  );
}
