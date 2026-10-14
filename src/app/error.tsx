"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("APP ROUTE ERROR", {
      message: error.message,
      digest: error.digest
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Có lỗi xảy ra</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Không thể tải trang</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Hệ thống chưa thể hoàn tất yêu cầu lúc này. Vui lòng thử lại sau vài giây.
        </p>
        <button
          className="mt-5 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          type="button"
          onClick={reset}
        >
          Thử lại
        </button>
      </section>
    </main>
  );
}
