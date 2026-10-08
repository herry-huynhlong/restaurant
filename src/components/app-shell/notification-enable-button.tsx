"use client";

import { BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";

type Status = "idle" | "enabled" | "denied" | "unsupported" | "error";

function supportsPushNotifications() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function getDeviceName() {
  const userAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = userAgentData.userAgentData?.platform ?? navigator.platform;
  return platform ? `Thiết bị ${platform}` : "Thiết bị nhân viên";
}

export function NotificationEnableButton({ slug }: { slug?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const subscribeCurrentDevice = useCallback(async () => {
    if (!slug || !supportsPushNotifications() || Notification.permission !== "granted") return false;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setMessage("Không thể bật thông báo. Vui lòng kiểm tra cấu hình thông báo của ứng dụng.");
      return null;
    }

    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const readyRegistration = await navigator.serviceWorker.ready;
    const existing = await readyRegistration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      }));

    if (process.env.NODE_ENV !== "production") {
      console.info("PUSH SUBSCRIPTION", {
        hasEndpoint: Boolean(subscription.endpoint),
        hasKeys: Boolean(subscription.toJSON().keys?.p256dh && subscription.toJSON().keys?.auth)
      });
    }

    const response = await fetch(`/api/restaurants/${slug}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...subscription.toJSON(),
        deviceName: getDeviceName()
      })
    });

    if (!response.ok) {
      throw new Error("push_subscribe_failed");
    }

    const data = await response.json().catch(() => ({})) as { subscriptionId?: string };
    return data.subscriptionId ?? null;
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    const soundEnabled = localStorage.getItem("notificationSoundEnabled") === "true";
    async function syncExistingPermission() {
      if ("Notification" in window && Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      if (!soundEnabled) return;

      if ("Notification" in window && Notification.permission === "granted" && slug) {
        try {
          const currentSubscriptionId = await subscribeCurrentDevice();
          if (currentSubscriptionId) {
            setSubscriptionId(currentSubscriptionId);
          }
        } catch {
          if (!cancelled) {
            setStatus("error");
            setMessage("Không thể bật thông báo. Vui lòng kiểm tra quyền thông báo của ứng dụng.");
          }
          return;
        }
      }

      if (!cancelled) setStatus("enabled");
    }

    void syncExistingPermission();
    return () => {
      cancelled = true;
    };
  }, [slug, subscribeCurrentDevice]);

  useEffect(() => {
    const enabled = localStorage.getItem("notificationSoundEnabled") === "true";
    if (enabled) {
      setStatus("enabled");
      return;
    }
    if ("Notification" in window && Notification.permission === "denied") {
      setStatus("denied");
    }
  }, []);

  async function enableNotifications() {
    setMessage(null);
    localStorage.setItem("notificationSoundEnabled", "true");
    window.dispatchEvent(new Event("notification-sound-enabled"));
    const audio = new Audio("/sounds/notification.wav");
    audio.preload = "auto";
    audio.volume = 0.05;
    await audio.play().catch(() => undefined);

    if (!("Notification" in window)) {
      setStatus("enabled");
      setMessage("Đã bật âm thanh trong app. Trình duyệt này không hỗ trợ thông báo hệ thống.");
      return;
    }

    const permission = Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => Notification.permission)
      : Notification.permission;

    if (permission === "denied") {
      setStatus("denied");
      setMessage("Âm thanh đã bật, nhưng thông báo hệ thống đang bị chặn trong cài đặt trình duyệt.");
      return;
    }

    if (permission !== "granted") {
      setStatus("enabled");
      setMessage("Đã bật âm thanh. Khi cần thông báo ngoài app, hãy cho phép notification trên điện thoại.");
      return;
    }

    if (!slug) {
      setStatus("enabled");
      return;
    }

    if (!supportsPushNotifications()) {
      setStatus("unsupported");
      setMessage("Đã bật âm thanh trong app. Trình duyệt này không hỗ trợ push notification.");
      return;
    }

    try {
      const currentSubscriptionId = await subscribeCurrentDevice();
      if (currentSubscriptionId) {
        setSubscriptionId(currentSubscriptionId);
      }
      setStatus("enabled");
      setMessage("Đã bật âm thanh và thông báo trên thiết bị này.");
    } catch {
      setStatus("error");
      setMessage("Không thể bật thông báo. Vui lòng kiểm tra quyền thông báo của ứng dụng.");
    }
  }

  async function sendTestNotification() {
    if (!slug) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/restaurants/${slug}/push/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId })
      });

      setMessage(response.ok
        ? "Đã gửi thông báo thử tới thiết bị này."
        : "Không gửi được thông báo thử. Vui lòng bấm bật thông báo lại.");
    } catch {
      setMessage("Không gửi được thông báo thử. Vui lòng kiểm tra kết nối.");
    }
  }

  const isEnabled = status === "enabled";
  const isBlocked = status === "denied";

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2">
        <button
          className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-slate-50 ${isEnabled ? "border-teal-200 bg-teal-50 text-teal-800" : isBlocked ? "border-red-200 bg-red-50 text-red-700" : "bg-white"}`}
          type="button"
          onClick={enableNotifications}
        >
          <BellRing className="h-4 w-4" />
          <span className="sm:hidden">{isEnabled ? "TB: Bật" : "Bật thông báo"}</span>
          <span className="hidden sm:inline">{isEnabled ? "Thông báo: Bật" : "Bật thông báo"}</span>
        </button>
        {isEnabled && slug ? (
          <button
            className="inline-flex h-10 items-center rounded-md border bg-white px-3 text-sm hover:bg-slate-50"
            type="button"
            onClick={sendTestNotification}
          >
            Gửi thử
          </button>
        ) : null}
      </div>
      {message ? (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-md border bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-lg">
          {message}
        </div>
      ) : null}
    </div>
  );
}
