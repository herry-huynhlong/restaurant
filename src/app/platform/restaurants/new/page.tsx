import { PlatformShell } from "@/components/app-shell/platform-shell";
import { BusinessPlanFields } from "@/components/platform/business-plan-fields";
import { CreateRestaurantSubmitButton, LogoUploadInput, RestaurantSlugField } from "@/components/platform/restaurant-form-controls";
import { TextField, SelectField } from "@/components/ui/form-fields";
import { requirePlatformAdmin } from "@/lib/rbac/guards";
import { createRestaurantAction } from "@/app/platform/restaurants/actions";

export default async function NewRestaurantPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  await requirePlatformAdmin();

  return (
    <PlatformShell title="Thêm nhà hàng">
      {searchParams?.error ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{searchParams.error}</p> : null}
      <form className="space-y-6 rounded-lg border bg-white p-5 shadow-sm" action={createRestaurantAction} encType="multipart/form-data">
        <FormSection title="Thông tin nhà hàng">
          <TextField label="Tên nhà hàng *" name="name" required />
          <RestaurantSlugField label="Slug *" name="slug" required />
          <LogoUploadField />
          <TextField label="Số điện thoại" name="phone" />
          <TextField label="Địa chỉ" name="address" />
          <TextField label="Timezone" name="timezone" defaultValue="Asia/Ho_Chi_Minh" required />
          <SelectField label="Ngôn ngữ mặc định" name="primaryLanguage" options={[["vi", "Tiếng Việt"], ["en", "English"]]} />
          <TextField label="Currency" name="currency" defaultValue="VND" required />
        </FormSection>

        <FormSection title="Owner">
          <TextField label="Tên chủ quán *" name="ownerName" required />
          <TextField label="Email owner *" name="ownerEmail" type="email" required />
          <TextField label="Password khởi tạo *" name="ownerPassword" type="password" required />
          <TextField label="Phone owner" name="ownerPhone" />
        </FormSection>

        <FormSection title="Gói dịch vụ và trạng thái">
          <BusinessPlanFields defaultBusinessType="RESTAURANT" defaultPlan="BASIC" />
          <TextField label="Ngày bắt đầu" name="subscriptionStart" type="date" />
          <TextField label="Ngày hết hạn" name="subscriptionEnd" type="date" />
          <SelectField label="Subscription status" name="subscriptionStatus" options={[["ACTIVE", "ACTIVE"], ["EXPIRED", "EXPIRED"], ["SUSPENDED", "SUSPENDED"]]} />
          <SelectField label="Status nhà hàng" name="status" options={[["ACTIVE", "ACTIVE"], ["SUSPENDED", "SUSPENDED"], ["INACTIVE", "INACTIVE"]]} />
        </FormSection>

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
