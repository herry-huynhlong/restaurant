"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteSimpleProductAction, updateSimpleProductFlagsAction } from "@/app/[rSlug]/admin/actions";
import { formatVnd, parseVndInteger } from "@/lib/money";
import type { SimpleMenuType } from "@/server/services/simple-menu-service";

type Product = {
  id: string;
  categoryId: string;
  menuType: SimpleMenuType;
  nameVi: string;
  descriptionVi: string | null;
  imageUrl: string | null;
  price: number;
  isActive: boolean;
  isSoldOut: boolean;
  isFeatured: boolean;
};

type Toast = {
  type: "success" | "error";
  message: string;
};

const menuTypeLabels: Record<SimpleMenuType, string> = {
  MAIN: "Món chính",
  EXTRA: "Món thêm",
  DRINK: "Nước"
};

const menuTypeOptions: Array<[SimpleMenuType, string]> = [
  ["MAIN", "Món chính"],
  ["EXTRA", "Món thêm"],
  ["DRINK", "Nước"]
];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

function isMenuType(value: unknown): value is SimpleMenuType {
  return value === "MAIN" || value === "EXTRA" || value === "DRINK";
}

function normalizeProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Product>;
  if (!value.id || !value.nameVi) return null;

  return {
    id: String(value.id),
    categoryId: String(value.categoryId ?? ""),
    menuType: isMenuType(value.menuType) ? value.menuType : "MAIN",
    nameVi: String(value.nameVi),
    descriptionVi: value.descriptionVi ? String(value.descriptionVi) : null,
    imageUrl: value.imageUrl ? String(value.imageUrl) : null,
    price: Number(value.price ?? 0),
    isActive: Boolean(value.isActive),
    isSoldOut: Boolean(value.isSoldOut),
    isFeatured: Boolean(value.isFeatured)
  };
}

function logFormData(label: string, formData: FormData) {
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      console.log(label, key, { name: value.name, type: value.type, size: value.size });
    } else {
      console.log(label, key, value);
    }
  }
}

function resultErrorMessage(result: unknown, fallback: string) {
  const value = result && typeof result === "object" ? result as { code?: string; error?: string; fieldErrors?: Record<string, string[] | undefined> } : null;
  const fieldMessages = value?.fieldErrors ? Object.values(value.fieldErrors).flat().filter(Boolean) : [];
  const detail = fieldMessages.length ? fieldMessages.join(" ") : value?.error;
  return value?.code ? `${detail ?? fallback} [${value.code}]` : detail ?? fallback;
}

async function saveProductRequest(slug: string, formData: FormData, mode: "create" | "update") {
  const response = await fetch(`/api/restaurants/${slug}/admin/menu`, {
    method: mode === "create" ? "POST" : "PATCH",
    body: formData
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  console.log(mode === "create" ? "CREATE MENU RESPONSE" : "SAVE MENU RESPONSE", {
    status: response.status,
    body: data
  });

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 5MB.");
    }
    throw new Error(resultErrorMessage(data, `Request failed (${response.status})`));
  }

  return data as { ok: true; product: unknown; message?: string };
}

function formatPriceInput(value: string | number) {
  const numericValue = typeof value === "number" ? value : parseVndInteger(value);
  return numericValue ? numericValue.toLocaleString("vi-VN") : "";
}

export function SimpleMenuManager({ slug, initialProducts }: { slug: string; initialProducts: Product[] }) {
  const [products, setProducts] = useState(() => initialProducts.map(normalizeProduct).filter((product): product is Product => Boolean(product)));
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);

  function showToast(nextToast: Toast) {
    setToast(nextToast);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  function upsertProduct(product: Product) {
    setProducts((current) => {
      const safeCurrent = Array.isArray(current) ? current : [];
      const exists = safeCurrent.some((item) => item.id === product.id);
      return exists
        ? safeCurrent.map((item) => (item.id === product.id ? product : item))
        : [product, ...safeCurrent];
    });
  }

  function removeProduct(productId: string) {
    setProducts((current) => (Array.isArray(current) ? current : []).filter((item) => item.id !== productId));
  }

  const groupedProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    return menuTypeOptions.map(([type, label]) => ({
      type,
      label,
      products: safeProducts.filter((product) => product.menuType === type)
    }));
  }, [products]);

  return (
    <section className="space-y-5">
      {toast ? (
        <div className={`fixed right-4 top-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg ${toast.type === "success" ? "bg-teal-700 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      ) : null}

      <NewProductCard slug={slug} onSaved={upsertProduct} onToast={showToast} />

      {products.length === 0 ? (
        <section className="rounded-lg border bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Chưa có món ăn</h2>
          <p className="mt-2 text-sm text-slate-600">Tạo món đầu tiên bằng form phía trên.</p>
        </section>
      ) : (
        groupedProducts.map((group) => group.products.length ? (
          <section key={group.type} className="space-y-3">
            <h2 className="text-base font-semibold">{group.label}</h2>
            <div className="space-y-3">
              {group.products.map((product) => (
                <ProductCard
                  key={product.id}
                  slug={slug}
                  product={product}
                  onDeleted={removeProduct}
                  onSaved={upsertProduct}
                  onToast={showToast}
                />
              ))}
            </div>
          </section>
        ) : null)
      )}
    </section>
  );
}

function NewProductCard({
  slug,
  onSaved,
  onToast
}: {
  slug: string;
  onSaved: (product: Product) => void;
  onToast: (toast: Toast) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        logFormData("CREATE MENU FORMDATA", formData);
        const result = await saveProductRequest(slug, formData, "create");

        const product = normalizeProduct(result.product);
        if (!product) {
          console.error("CREATE MENU RESPONSE INVALID", result);
          onToast({ type: "error", message: "Server đã lưu nhưng trả dữ liệu món không hợp lệ." });
          return;
        }

        onSaved(product);
        onToast({ type: "success", message: result.message ?? `Đã tạo món ${product.nameVi}.` });
        formRef.current?.reset();
        setPreviewUrl(null);
        setPrice("");
      } catch (error) {
        console.error("CREATE MENU ITEM FRONTEND ERROR", error);
        onToast({ type: "error", message: error instanceof Error ? error.message : "Không thể tạo món." });
      }
    });
  }

  return (
    <form ref={formRef} className="rounded-lg border bg-white p-4 shadow-sm" action={submit}>
      <h2 className="text-base font-semibold">+ Thêm món</h2>
      <ProductFields
        previewUrl={previewUrl}
        price={price}
        onImagePreview={setPreviewUrl}
        onPriceChange={setPrice}
        onToast={onToast}
      />
      <button className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit" disabled={isPending}>
        {isPending ? "Đang tạo..." : "Tạo món"}
      </button>
    </form>
  );
}

function ProductCard({
  slug,
  product,
  onSaved,
  onDeleted,
  onToast
}: {
  slug: string;
  product: Product;
  onSaved: (product: Product) => void;
  onDeleted: (productId: string) => void;
  onToast: (toast: Toast) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(product.imageUrl);
  const [price, setPrice] = useState(formatPriceInput(product.price));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPreviewUrl(product.imageUrl);
    setPrice(formatPriceInput(product.price));
  }, [product.imageUrl, product.price]);

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        logFormData("SAVE MENU FORMDATA", formData);
        const result = await saveProductRequest(slug, formData, "update");

        const nextProduct = normalizeProduct(result.product);
        if (!nextProduct) {
          console.error("SAVE MENU RESPONSE INVALID", result);
          onToast({ type: "error", message: "Server đã lưu nhưng trả dữ liệu món không hợp lệ." });
          return;
        }

        setPreviewUrl(nextProduct.imageUrl);
        setPrice(formatPriceInput(nextProduct.price));
        onSaved(nextProduct);
        onToast({ type: "success", message: result.message ?? `Đã cập nhật món ${nextProduct.nameVi}.` });
      } catch (error) {
        console.error("SAVE MENU ITEM ERROR", error);
        onToast({ type: "error", message: error instanceof Error ? error.message : "Không thể lưu món." });
      }
    });
  }

  function updateFlag(flags: { isActive?: boolean; isSoldOut?: boolean; isFeatured?: boolean }) {
    const optimisticProduct = { ...product, ...flags };
    onSaved(optimisticProduct);
    startTransition(async () => {
      try {
        const result = await updateSimpleProductFlagsAction(slug, product.id, flags);
        if (!result?.ok) {
          onSaved(product);
          onToast({ type: "error", message: resultErrorMessage(result, "Không thể cập nhật trạng thái món.") });
          return;
        }

        const nextProduct = normalizeProduct(result.product);
        if (!nextProduct) {
          console.error("UPDATE MENU FLAGS RESPONSE INVALID", result);
          onSaved(product);
          onToast({ type: "error", message: "Server trả dữ liệu trạng thái không hợp lệ." });
          return;
        }

        onSaved(nextProduct);
        onToast({ type: "success", message: result.message ?? `Đã cập nhật ${nextProduct.nameVi}.` });
      } catch (error) {
        onSaved(product);
        console.error("UPDATE MENU FLAGS ERROR", error);
        onToast({ type: "error", message: error instanceof Error ? error.message : "Không thể cập nhật trạng thái món." });
      }
    });
  }

  function deleteProduct() {
    if (!window.confirm(`Xóa hoặc ngừng bán món ${product.nameVi}?`)) return;
    startTransition(async () => {
      try {
        const result = await deleteSimpleProductAction(slug, product.id);
        if (!result?.ok) {
          onToast({ type: "error", message: resultErrorMessage(result, "Không thể xóa món.") });
          return;
        }
        if (result.deleted) {
          onDeleted(product.id);
        } else {
          const nextProduct = normalizeProduct(result.product);
          if (!nextProduct) {
            console.error("DELETE MENU RESPONSE INVALID", result);
            onToast({ type: "error", message: "Server trả dữ liệu món không hợp lệ." });
            return;
          }
          onSaved(nextProduct);
        }
        onToast({ type: "success", message: result.message ?? `Đã xóa món ${product.nameVi}.` });
      } catch (error) {
        console.error("DELETE MENU ITEM ERROR", error);
        onToast({ type: "error", message: error instanceof Error ? error.message : "Không thể xóa món." });
      }
    });
  }

  return (
    <article className="rounded-lg border bg-white p-4 shadow-sm">
      <form action={submit} className="grid gap-4 md:grid-cols-[128px_1fr]">
        <input name="productId" type="hidden" value={product.id} />
        <input name="existingImageUrl" type="hidden" value={product.imageUrl ?? ""} />
        <ProductImagePicker previewUrl={previewUrl} onImagePreview={setPreviewUrl} onToast={onToast} />
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{product.nameVi || "Món chưa đặt tên"}</h3>
              <p className="text-sm text-slate-600">{formatVnd(Number(product.price ?? 0))} · {menuTypeLabels[product.menuType] ?? "Món chính"}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${product.isActive && !product.isSoldOut ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>
              {!product.isActive ? "Ngừng bán" : product.isSoldOut ? "Hết món" : "Đang bán"}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <TextInput label="Tên món" name="nameVi" defaultValue={product.nameVi} required />
            <PriceInput value={price} onChange={setPrice} />
            <MenuTypeSelect defaultValue={product.menuType} />
          </div>
          <textarea className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-teal-600" name="descriptionVi" placeholder="Mô tả ngắn" defaultValue={product.descriptionVi ?? ""} />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Check name="isActive" label="Đang bán" defaultChecked={product.isActive} onChange={(checked) => updateFlag({ isActive: checked })} />
            <Check name="isSoldOut" label="Hết món" defaultChecked={product.isSoldOut} onChange={(checked) => updateFlag({ isSoldOut: checked })} />
            <Check name="isFeatured" label="Nổi bật" defaultChecked={product.isFeatured} onChange={(checked) => updateFlag({ isFeatured: checked })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit" disabled={isPending}>
              {isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
            <button className="rounded-md border px-4 py-2 text-sm font-semibold" type="button" onClick={() => updateFlag({ isSoldOut: !product.isSoldOut })} disabled={isPending}>
              {product.isSoldOut ? "Đánh dấu còn món" : "Đánh dấu hết món"}
            </button>
            <button className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700" type="button" onClick={deleteProduct} disabled={isPending}>
              Xóa món
            </button>
          </div>
        </div>
      </form>
    </article>
  );
}

function ProductFields({
  previewUrl,
  price,
  onImagePreview,
  onPriceChange,
  onToast
}: {
  previewUrl: string | null;
  price: string;
  onImagePreview: (value: string | null) => void;
  onPriceChange: (value: string) => void;
  onToast: (toast: Toast) => void;
}) {
  return (
    <div className="mt-3 grid gap-4 md:grid-cols-[128px_1fr]">
      <ProductImagePicker previewUrl={previewUrl} onImagePreview={onImagePreview} onToast={onToast} />
      <div className="grid gap-3 lg:grid-cols-3">
        <TextInput label="Tên món" name="nameVi" required />
        <PriceInput value={price} onChange={onPriceChange} />
        <MenuTypeSelect />
        <div className="lg:col-span-3">
          <textarea className="min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-teal-600" name="descriptionVi" placeholder="Mô tả ngắn" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm lg:col-span-3">
          <label><input className="mr-2" name="isActive" type="checkbox" defaultChecked />Đang bán</label>
          <label><input className="mr-2" name="isSoldOut" type="checkbox" />Hết món</label>
          <label><input className="mr-2" name="isFeatured" type="checkbox" />Nổi bật</label>
        </div>
      </div>
    </div>
  );
}

function ProductImagePicker({
  previewUrl,
  onImagePreview,
  onToast
}: {
  previewUrl: string | null;
  onImagePreview: (value: string | null) => void;
  onToast: (toast: Toast) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      Ảnh món
      <span className="mt-1 flex aspect-square w-32 items-center justify-center overflow-hidden rounded-md border bg-slate-50 text-xs text-slate-500">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {previewUrl ? <img alt="Ảnh món" className="h-full w-full object-cover" src={previewUrl} /> : "Chưa có ảnh"}
      </span>
      <input
        className="mt-2 block w-full text-xs"
        name="imageFile"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) {
            onImagePreview(null);
            return;
          }

          console.log("IMAGE SELECTED", {
            name: file.name,
            type: file.type,
            size: file.size,
            sizeMB: file.size / 1024 / 1024
          });

          if (!allowedImageTypes.includes(file.type)) {
            event.currentTarget.value = "";
            onImagePreview(null);
            onToast({ type: "error", message: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP." });
            return;
          }

          if (file.size > MAX_IMAGE_SIZE) {
            event.currentTarget.value = "";
            onImagePreview(null);
            onToast({ type: "error", message: "Ảnh phải nhỏ hơn 5MB." });
            return;
          }

          onImagePreview(URL.createObjectURL(file));
        }}
      />
    </label>
  );
}

function TextInput({ label, name, defaultValue, required = false }: { label: string; name: string; defaultValue?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600" name={name} defaultValue={defaultValue ?? ""} required={required} />
    </label>
  );
}

function PriceInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      Giá
      <input
        className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
        name="price"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(formatPriceInput(event.target.value))}
        required
      />
    </label>
  );
}

function MenuTypeSelect({ defaultValue = "MAIN" }: { defaultValue?: SimpleMenuType }) {
  return (
    <label className="block text-sm font-medium">
      Loại món
      <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 outline-none focus:border-teal-600" name="menuType" defaultValue={defaultValue}>
        {menuTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function Check({ name, label, defaultChecked, onChange }: { name: string; label: string; defaultChecked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label>
      <input className="mr-2" name={name} type="checkbox" checked={defaultChecked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
