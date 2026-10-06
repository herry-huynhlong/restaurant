import { RestaurantAdminShell } from "@/components/app-shell/restaurant-admin-shell";
import { FeedbackBanner } from "@/components/admin/feedback-banner";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { requireRestaurantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/db/prisma";
import { formatVnd } from "@/lib/money";
import { getRecentNotifications } from "@/server/services/notification-service";
import {
  createProductAction,
  deleteOrDeactivateProductAction,
  toggleSoldOutAction,
  updateProductAction
} from "@/app/[rSlug]/admin/actions";

export default async function MenuPage({
  params,
  searchParams
}: {
  params: { rSlug: string };
  searchParams?: { error?: string; success?: string };
}) {
  const access = await requireRestaurantAccess(params.rSlug, ["OWNER", "MANAGER"]);
  const [categories, products, notifications] = await Promise.all([
    prisma.category.findMany({ where: { restaurantId: access.restaurant.id }, orderBy: [{ sortOrder: "asc" }, { nameVi: "asc" }] }),
    prisma.product.findMany({
      where: { restaurantId: access.restaurant.id },
      include: { category: true, optionGroups: { include: { items: true } } },
      orderBy: [{ sortOrder: "asc" }, { nameVi: "asc" }]
    }),
    getRecentNotifications(access.restaurant.id, access.user.id)
  ]);

  return (
    <RestaurantAdminShell slug={access.restaurant.slug} restaurantName={access.restaurant.name} role={access.membership.role} title="Menu" userName={access.user.name} notifications={notifications}>
      <FeedbackBanner error={searchParams?.error} success={searchParams?.success} />
      <ProductForm slug={access.restaurant.slug} categories={categories} />

      {products.length === 0 ? (
        <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Chưa có món ăn</h2>
          <p className="mt-2 text-sm text-slate-600">Tạo món đầu tiên sau khi đã có danh mục.</p>
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          {products.map((product) => (
            <article key={product.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[96px_1fr]">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-xs text-slate-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {product.imageUrl ? <img alt={product.nameVi} className="h-full w-full object-cover" src={product.imageUrl} /> : "No image"}
                </div>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{product.nameVi}</h2>
                      <p className="text-sm text-slate-600">{product.nameEn || product.nameVi} · {product.category.nameVi}</p>
                      <p className="mt-1 font-semibold text-teal-700">{formatVnd(product.price)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-1">{product.isActive ? "Đang bán" : "Tắt"}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1">{product.isSoldOut ? "Hết món" : "Còn món"}</span>
                      {product.isFeatured ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">Nổi bật</span> : null}
                    </div>
                  </div>
                  <ProductEditForm slug={access.restaurant.slug} categories={categories} product={product} />
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </RestaurantAdminShell>
  );
}

function ProductForm({ slug, categories }: { slug: string; categories: Array<{ id: string; nameVi: string }> }) {
  return (
    <form className="rounded-lg border bg-white p-4 shadow-sm" action={createProductAction.bind(null, slug)} encType="multipart/form-data">
      <h2 className="text-base font-semibold">+ Thêm món</h2>
      <ProductFields categories={categories} />
      <button className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit" disabled={categories.length === 0}>
        Tạo món
      </button>
    </form>
  );
}

function ProductEditForm({ slug, categories, product }: { slug: string; categories: Array<{ id: string; nameVi: string }>; product: any }) {
  const firstGroup = product.optionGroups[0];
  return (
    <div className="mt-4 border-t pt-4">
      <form action={updateProductAction.bind(null, slug)} encType="multipart/form-data">
        <input name="productId" type="hidden" value={product.id} />
        <ProductFields categories={categories} product={product} firstGroup={firstGroup} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">Lưu món</button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={toggleSoldOutAction.bind(null, slug)}>
          <input name="productId" type="hidden" value={product.id} />
          <input name="isSoldOut" type="hidden" value={product.isSoldOut ? "false" : "true"} />
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">{product.isSoldOut ? "Đánh dấu còn món" : "Đánh dấu hết món"}</button>
        </form>
        <form action={deleteOrDeactivateProductAction.bind(null, slug)}>
          <input name="productId" type="hidden" value={product.id} />
          <ConfirmSubmitButton className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700" message={`Xóa hoặc ngừng bán món ${product.nameVi}?`}>
            Xóa món
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

function ProductFields({ categories, product, firstGroup }: { categories: Array<{ id: string; nameVi: string }>; product?: any; firstGroup?: any }) {
  return (
    <>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          Ảnh món
          <input className="mt-1 h-10 w-full rounded-md border px-3 py-2" name="imageFile" type="file" accept="image/*" />
        </label>
        <input className="h-10 rounded-md border px-3" name="imageUrl" placeholder="Hoặc ảnh URL" defaultValue={product?.imageUrl ?? ""} />
        <input className="h-10 rounded-md border px-3" name="nameVi" placeholder="Tên món tiếng Việt *" defaultValue={product?.nameVi ?? ""} required />
        <input className="h-10 rounded-md border px-3" name="nameEn" placeholder="Tên món tiếng Anh" defaultValue={product?.nameEn ?? ""} />
        <textarea className="min-h-20 rounded-md border px-3 py-2" name="descriptionVi" placeholder="Mô tả tiếng Việt" defaultValue={product?.descriptionVi ?? ""} />
        <textarea className="min-h-20 rounded-md border px-3 py-2" name="descriptionEn" placeholder="Mô tả tiếng Anh" defaultValue={product?.descriptionEn ?? ""} />
        <select className="h-10 rounded-md border bg-white px-3" name="categoryId" defaultValue={product?.categoryId ?? categories[0]?.id} required>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.nameVi}</option>)}
        </select>
        <input className="h-10 rounded-md border px-3" name="price" placeholder="Giá VND *" defaultValue={product?.price ?? ""} inputMode="numeric" required />
        <input className="h-10 rounded-md border px-3" name="sortOrder" placeholder="Sort" type="number" defaultValue={product?.sortOrder ?? 0} />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label><input className="mr-2" name="isFeatured" type="checkbox" defaultChecked={product?.isFeatured ?? false} />Nổi bật</label>
          <label><input className="mr-2" name="isSoldOut" type="checkbox" defaultChecked={product?.isSoldOut ?? false} />Hết món</label>
          <label><input className="mr-2" name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} />Đang bán</label>
        </div>
      </div>
      <details className="mt-4 rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Nhóm lựa chọn / option</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input className="h-10 rounded-md border px-3" name="optionGroupNameVi" placeholder="Tên nhóm VI, ví dụ Size" defaultValue={firstGroup?.nameVi ?? ""} />
          <input className="h-10 rounded-md border px-3" name="optionGroupNameEn" placeholder="Tên nhóm EN" defaultValue={firstGroup?.nameEn ?? ""} />
          <select className="h-10 rounded-md border bg-white px-3" name="optionSelectionType" defaultValue={firstGroup?.selectionType ?? "SINGLE"}>
            <option value="SINGLE">SINGLE</option>
            <option value="MULTI">MULTIPLE</option>
          </select>
          <label className="flex items-center gap-2 text-sm"><input name="optionIsRequired" type="checkbox" defaultChecked={firstGroup?.isRequired ?? false} />Bắt buộc</label>
          <input className="h-10 rounded-md border px-3" name="optionMinSelect" placeholder="Min" type="number" defaultValue={firstGroup?.minSelect ?? 0} />
          <input className="h-10 rounded-md border px-3" name="optionMaxSelect" placeholder="Max" type="number" defaultValue={firstGroup?.maxSelect ?? 1} />
          {[0, 1, 2].map((index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <input className="h-10 rounded-md border px-3" name={`optionItem${index + 1}NameVi`} placeholder={`Option ${index + 1}`} defaultValue={firstGroup?.items[index]?.nameVi ?? ""} />
              <input className="h-10 rounded-md border px-3" name={`optionItem${index + 1}Price`} placeholder="+ giá" defaultValue={firstGroup?.items[index]?.priceDelta ?? ""} />
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
