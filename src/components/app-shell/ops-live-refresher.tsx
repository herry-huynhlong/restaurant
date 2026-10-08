"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStaffDeviceId, isDeviceOnShift } from "@/lib/staff-device";

type NotificationState = {
  unreadCount: number;
  latestNotificationId: string | null;
  latestCreatedAt: string | null;
};

export function OpsLiveRefresher({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const [onShift, setOnShift] = useState(true);
  const latestIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    setOnShift(isDeviceOnShift(slug));
    function handleShift(event: Event) {
      const detail = (event as CustomEvent<{ slug?: string; onShift?: boolean }>).detail;
      if (detail?.slug === slug && typeof detail.onShift === "boolean") {
        setOnShift(detail.onShift);
      }
    }
    window.addEventListener("staff-shift-changed", handleShift);
    return () => window.removeEventListener("staff-shift-changed", handleShift);
  }, [slug]);

  useEffect(() => {
    if (!onShift) {
      setStatus("live");
      return;
    }

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
        const response = await fetch(`/api/restaurants/${slug}/notifications/state?deviceId=${encodeURIComponent(getStaffDeviceId())}`, { cache: "no-store" });
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
      eventSource = new EventSource(`/api/restaurants/${slug}/notifications/stream?deviceId=${encodeURIComponent(getStaffDeviceId())}`);
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
  }, [onShift, router, slug]);

  if (status === "live") return null;

  return (
    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
      Đang kết nối lại
    </span>
  );
}
