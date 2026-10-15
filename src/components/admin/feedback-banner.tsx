"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { sanitizeFeedbackMessage } from "@/lib/safe-user-message";

export function FeedbackBanner({ success, error }: { success?: string; error?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeError = sanitizeFeedbackMessage(error, "Không thể hoàn tất thao tác. Vui lòng thử lại.");
  const safeSuccess = safeError ? undefined : sanitizeFeedbackMessage(success, "Đã lưu thay đổi.");
  const [visible, setVisible] = useState(Boolean(safeSuccess || safeError));

  useEffect(() => {
    setVisible(Boolean(safeSuccess || safeError));
    if (!safeSuccess || safeError) return;

    const timer = window.setTimeout(() => {
      setVisible(false);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("success");
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [pathname, router, safeError, safeSuccess, searchParams]);

  if (!visible || (!safeSuccess && !safeError)) return null;
  return (
    <div
      aria-live={safeError ? "assertive" : "polite"}
      className={`fixed left-4 right-4 top-4 z-[80] flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl sm:left-auto sm:max-w-md ${safeError ? "border-red-200 bg-red-50 text-red-800" : "border-teal-200 bg-white text-teal-900"}`}
      role={safeError ? "alert" : "status"}
    >
      <span className="min-w-0 flex-1">{safeError ?? safeSuccess}</span>
      <button
        aria-label="Đóng thông báo"
        className="shrink-0 rounded px-1 text-lg leading-none opacity-70 hover:opacity-100"
        type="button"
        onClick={() => setVisible(false)}
      >
        ×
      </button>
    </div>
  );
}
