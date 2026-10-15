"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BackupJobRefresher({ jobId, status }: { jobId?: string; status?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!jobId) return;

    if (status === "SUCCESS") {
      router.replace("/platform/storage?success=" + encodeURIComponent("Đã sao lưu dữ liệu thành công."));
      return;
    }

    if (status === "FAILED") {
      router.replace("/platform/storage?error=" + encodeURIComponent("Không thể hoàn tất sao lưu. Vui lòng kiểm tra dịch vụ sao lưu."));
      return;
    }

    if (status !== "QUEUED" && status !== "RUNNING") return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [jobId, router, status]);

  return null;
}
