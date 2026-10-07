"use client";

import { useFormStatus } from "react-dom";

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
