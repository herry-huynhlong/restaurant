"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReportsAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(interval);
  }, [router]);

  return <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">Live</span>;
}
