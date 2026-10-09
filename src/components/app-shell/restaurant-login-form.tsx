"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { normalizeUsername } from "@/lib/username";

export function RestaurantLoginForm({ slug, initialError }: { slug: string; initialError?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState(initialError ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setPageError(null);

    const formData = new FormData(event.currentTarget);
    const username = normalizeUsername(String(formData.get("username") ?? ""));
    const password = String(formData.get("password") ?? "");
    const callbackUrl = searchParams.get("callbackUrl") ?? "/post-login";

    const result = await signIn("credentials", {
      restaurantSlug: slug,
      username,
      password,
      redirect: false,
      callbackUrl
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Tên đăng nhập hoặc mật khẩu không đúng.");
      return;
    }

    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Tên đăng nhập / Email
        <input
          className="mt-1 h-11 w-full rounded-md border px-3 outline-none focus:border-teal-600"
          name="username"
          type="text"
          title="Nhập email chủ quán hoặc username nhân viên."
          autoComplete="username"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Mật khẩu
        <input
          className="mt-1 h-11 w-full rounded-md border px-3 outline-none focus:border-teal-600"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {pageError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pageError}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        className="h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </form>
  );
}
