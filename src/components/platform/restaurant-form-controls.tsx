"use client";

import { useFormStatus } from "react-dom";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

function slugifyInput(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function RestaurantSlugField({
  label,
  name,
  required = false,
  defaultValue
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string | null;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
        name={name}
        type="text"
        defaultValue={defaultValue ?? ""}
        required={required}
        onInput={(event) => {
          event.currentTarget.value = slugifyInput(event.currentTarget.value);
        }}
      />
    </label>
  );
}

export function CreateRestaurantSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
      onClick={() => {
        console.log("CREATE RESTAURANT SUBMIT");
      }}
    >
      {pending ? "Đang tạo..." : "Tạo nhà hàng"}
    </button>
  );
}

export function LogoUploadInput() {
  return (
    <input
      className="mt-1 h-10 w-full rounded-md border px-3 py-2 outline-none focus:border-teal-600"
      name="logoFile"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        if (!allowedImageTypes.includes(file.type)) {
          event.currentTarget.value = "";
          window.alert("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.");
          return;
        }
        if (file.size > MAX_IMAGE_SIZE) {
          event.currentTarget.value = "";
          window.alert("Ảnh tối đa 5MB.");
        }
      }}
    />
  );
}
