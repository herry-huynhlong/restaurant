"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NotificationState = {
  unreadCount: number;
  latestNotificationId: string | null;
  latestCreatedAt: string | null;
};

function playTing() {
  if (typeof window === "undefined" || localStorage.getItem("notificationSoundEnabled") !== "true") return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.38);
}

export function OpsLiveRefresher({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const latestIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const response = await fetch(`/api/restaurants/${slug}/notifications/state`, { cache: "no-store" });
        if (!response.ok) throw new Error("state_failed");
        const data = (await response.json()) as NotificationState;
        setStatus("live");

        if (!initializedRef.current) {
          latestIdRef.current = data.latestNotificationId;
          initializedRef.current = true;
          return;
        }

        if (data.latestNotificationId && data.latestNotificationId !== latestIdRef.current) {
          latestIdRef.current = data.latestNotificationId;
          playTing();
          router.refresh();
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
  }, [router, slug]);

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${status === "live" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
      {status === "live" ? "Live" : "Đang kết nối lại"}
    </span>
  );
}
