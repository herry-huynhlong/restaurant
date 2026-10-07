"use client";

import { useEffect, useRef, useState } from "react";

type NotificationState = {
  unreadCount: number;
  latestNotificationId: string | null;
  latestCreatedAt: string | null;
};

export function OpsLiveRefresher({ slug }: { slug: string }) {
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const latestIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const response = await fetch(`/api/restaurants/${slug}/notifications/state`, { cache: "no-store" });
        if (!response.ok) throw new Error("state_failed");
        const data = (await response.json()) as NotificationState;
        setStatus("live");

        if (data.latestNotificationId && data.latestNotificationId !== latestIdRef.current) {
          latestIdRef.current = data.latestNotificationId;
        }
      } catch {
        setStatus("reconnecting");
      }
    }

    tick();
    const interval = window.setInterval(() => {
      if (!cancelled) void tick();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [slug]);

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${status === "live" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
      {status === "live" ? "Live" : "Đang kết nối lại"}
    </span>
  );
}
