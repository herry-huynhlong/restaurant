"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NotificationState = {
  unreadCount: number;
  latestNotificationId: string | null;
  latestCreatedAt: string | null;
};

export function OpsLiveRefresher({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const latestIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | null = null;

    function refreshSoon() {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        router.refresh();
      }, 250);
    }

    async function tick() {
      try {
        const response = await fetch(`/api/restaurants/${slug}/notifications/state`, { cache: "no-store" });
        if (!response.ok) throw new Error("state_failed");
        const data = (await response.json()) as NotificationState;
        setStatus("live");

        if (data.latestNotificationId && data.latestNotificationId !== latestIdRef.current) {
          latestIdRef.current = data.latestNotificationId;
          if (initializedRef.current) refreshSoon();
        }
        initializedRef.current = true;
      } catch {
        setStatus("reconnecting");
      }
    }

    tick();
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/restaurants/${slug}/notifications/stream`);
      eventSource.addEventListener("notification", () => {
        setStatus("live");
        void tick();
        refreshSoon();
      });
      eventSource.onerror = () => setStatus("reconnecting");
      eventSource.onopen = () => setStatus("live");
    } catch {
      setStatus("reconnecting");
    }
    const interval = window.setInterval(() => {
      if (!cancelled) void tick();
    }, 5000);

    return () => {
      cancelled = true;
      eventSource?.close();
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.clearInterval(interval);
    };
  }, [router, slug]);

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${status === "live" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
      {status === "live" ? "Live" : "Đang kết nối lại"}
    </span>
  );
}
