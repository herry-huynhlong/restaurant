"use client";

import { useEffect, useState } from "react";

export function PendingSubscriptionBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let active = true;

    async function refreshCount() {
      try {
        const response = await fetch("/api/platform/subscription-requests/pending-count", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { count?: number };
        if (active && typeof data.count === "number") {
          setCount(data.count);
        }
      } catch {
        // Keep the last known badge count if the lightweight refresh fails.
      }
    }

    const interval = window.setInterval(refreshCount, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshCount();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
