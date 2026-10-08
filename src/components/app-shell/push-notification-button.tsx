"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";

type Status = "checking" | "unsupported" | "denied" | "idle" | "enabled" | "error";

function unlockNotificationAudio() {
  localStorage.setItem("notificationSoundEnabled", "true");
  const audio = new Audio("/sounds/notification.wav");
  audio.volume = 0.05;
  return audio.play().catch(() => undefined);
}

export function PushNotificationButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    setStatus(Notification.permission === "granted" ? "idle" : "idle");
  }, []);

  async function enablePush() {
    setMessage(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus("unsupported");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("denied");
        setMessage("Bạn cần bật lại notification trong cài đặt trình duyệt/hệ thống.");
        return;
      }
      if (permission !== "granted") {
        setStatus("idle");
        return;
      }

      await unlockNotificationAudio();

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setStatus("error");
        setMessage("Thông báo trong app vẫn hoạt động. Thông báo hệ thống chưa được cấu hình.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));

      const response = await fetch(`/api/restaurants/${slug}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { subscriptionId: string };
      setSubscriptionId(data.subscriptionId);
      setStatus("enabled");
      setMessage("Đã bật thông báo đẩy và âm thanh ting ting cho thiết bị này.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Không thể bật thông báo đẩy.");
    }
  }

  async function testPush() {
    setMessage(null);
    const response = await fetch(`/api/restaurants/${slug}/push/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId })
    });
    setMessage(response.ok ? "Đã gửi thông báo thử." : "Không gửi được thông báo thử.");
  }

  const label =
    status === "enabled" ? "Thông báo hệ thống đã bật" : status === "unsupported" ? "Không hỗ trợ thông báo hệ thống" : status === "denied" ? "Thông báo hệ thống bị chặn" : "Bật thông báo hệ thống";
  const canShowTestButton = process.env.NODE_ENV !== "production";

  return (
    <div className={compact ? "relative" : "space-y-2"}>
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={enablePush}
          disabled={status === "unsupported" || status === "denied"}
        >
          <BellRing className="h-4 w-4" />
          {label}
        </button>
        {status === "enabled" && canShowTestButton ? (
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={testPush}>
            Gửi thông báo thử
          </button>
        ) : null}
      </div>
      {message ? <p className="max-w-md text-xs text-slate-600">{message}</p> : null}
      {status === "denied" ? (
        <p className="max-w-md text-xs text-red-600">
          Notification đang bị chặn. Hãy mở cài đặt site/browser và cho phép thông báo.
        </p>
      ) : null}
      {status === "unsupported" ? (
        <p className="max-w-md text-xs text-slate-600">
          Trình duyệt hoặc chế độ hiện tại không hỗ trợ Service Worker Push API.
        </p>
      ) : null}
    </div>
  );
}
