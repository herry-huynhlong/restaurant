import { notFound } from "next/navigation";
import { PlatformShell } from "@/components/app-shell/platform-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { BusinessPlanFields } from "@/components/platform/business-plan-fields";
import { LogoUploadInput } from "@/components/platform/restaurant-form-controls";
import { TextField, SelectField } from "@/components/ui/form-fields";
import { isPlatformOwnerRole, requirePlatformAdmin } from "@/lib/rbac/guards";
import { servedUploadUrl } from "@/lib/upload-url";
import { getPlatformRestaurantDetail } from "@/server/services/platform-service";
import { updateRestaurantAction } from "@/app/platform/restaurants/actions";

export default async function EditRestaurantPage({
  params,
  searchParams
}: {
  params: { restaurantId: string };
  searchParams?: { error?: string };
}) {
  const user = await requirePlatformAdmin();
  const restaurant = await getPlatformRestaurantDetail(params.restaurantId);

  if (!restaurant) {
    notFound();
  }

  if (restaurant.status === "DELETED") {
    return (
      <PlatformShell title={`Chỉnh sửa ${restaurant.name}`}>
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Nhà hàng này đã xóa mềm. Hãy khôi phục nhà hàng trong danh sách Đã xóa trước khi chỉnh sửa.
        </section>
      </PlatformShell>
    );
  }
  const canManageSensitive = isPlatformOwnerRole(user.platformRole);

  return (
    <PlatformShell title={`Chỉnh sửa ${restaurant.name}`}>
      <FeedbackBanner error={searchParams?.error} />
      <form className="space-y-6 rounded-lg border bg-white p-5 shadow-sm" action={updateRestaurantAction} encType="multipart/form-data">
        <input name="restaurantId" type="hidden" value={restaurant.id} />
        <input name="existingLogoUrl" type="hidden" value={restaurant.logoUrl ?? ""} />
        <section>
          <h2 className="text-base font-semibold">Thông tin nhà hàng</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <TextField label="Tên nhà hàng *" name="name" defaultValue={restaurant.name} required />
            <TextField label="Mã đường dẫn *" name="slug" defaultValue={restaurant.slug} required />
            <LogoUploadField currentLogoUrl={servedUploadUrl(restaurant.logoUrl)} />
            <TextField label="Số điện thoại" name="phone" defaultValue={restaurant.settings?.phone} />
            <TextField label="Địa chỉ" name="address" defaultValue={restaurant.settings?.address} />
            <TextField label="Múi giờ" name="timezone" defaultValue={restaurant.settings?.timezone ?? "Asia/Ho_Chi_Minh"} required />
            <SelectField label="Ngôn ngữ mặc định" name="primaryLanguage" defaultValue={restaurant.settings?.primaryLanguage} options={[["vi", "Tiếng Việt"], ["en", "English"]]} />
            <TextField label="Đơn vị tiền tệ" name="currency" defaultValue={restaurant.settings?.currency ?? "VND"} required />
          </div>
        </section>
        {canManageSensitive ? (
          <section>
            <h2 className="text-base font-semibold">Gói dịch vụ</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <BusinessPlanFields defaultBusinessType={restaurant.businessType} defaultPlan={restaurant.plan} defaultPlanEntitlement={restaurant.planEntitlement} />
              <TextField label="Ngày bắt đầu" name="subscriptionStart" type="date" defaultValue={toDateInput(restaurant.subscriptionStart)} />
              <TextField label="Ngày hết hạn" name="subscriptionEnd" type="date" defaultValue={toDateInput(restaurant.subscriptionEnd)} />
              <SelectField label="Trạng thái gói dịch vụ" name="subscriptionStatus" defaultValue={restaurant.subscriptionStatus} options={[["ACTIVE", "Đang hoạt động"], ["EXPIRED", "Đã hết hạn"], ["SUSPENDED", "Tạm ngưng"]]} />
              <SelectField label="Trạng thái nhà hàng" name="status" defaultValue={restaurant.status} options={[["ACTIVE", "Đang hoạt động"], ["SUSPENDED", "Đã khóa"], ["INACTIVE", "Chưa hoạt động"]]} />
            </div>
          </section>
        ) : null}
        <PendingSubmitButton className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" pendingLabel="Đang lưu...">Lưu thay đổi</PendingSubmitButton>
      </form>
    </PlatformShell>
  );
}

function toDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function LogoUploadField({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  return (
    <label className="block text-sm font-medium">
      Logo nhà hàng
      <LogoUploadInput />
      {currentLogoUrl ? (
        <span className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Logo hiện tại" className="h-8 w-8 rounded border object-cover" src={currentLogoUrl} />
          Đang dùng logo hiện tại. Tải ảnh mới để thay đổi.
        </span>
      ) : null}
    </label>
  );
}
