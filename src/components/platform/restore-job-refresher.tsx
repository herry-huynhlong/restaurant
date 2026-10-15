"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const activeStatuses = new Set(["QUEUED", "VERIFYING", "PREPARING", "RESTORING", "VALIDATING"]);

export function RestoreJobRefresher({ jobId, status }: { jobId?: string; status?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!jobId) return;
    if (status === "SUCCESS") {
      router.replace("/platform/storage?success=" + encodeURIComponent("Đã khôi phục dữ liệu thành công."));
      return;
    }
    if (status === "FAILED") {
      router.replace("/platform/storage?error=" + encodeURIComponent("Khôi phục chưa thành công. Dữ liệu trước thao tác đã được phục hồi."));
      return;
    }
    if (status === "NEEDS_INTERVENTION") {
      router.replace("/platform/storage?error=" + encodeURIComponent("Quá trình khôi phục cần được kiểm tra thủ công."));
      return;
    }
    if (!status || !activeStatuses.has(status)) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [jobId, router, status]);

  return null;
}
