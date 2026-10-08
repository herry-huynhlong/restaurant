"use client";

import { BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";

type Status = "idle" | "enabled" | "denied";

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

  const subscribeCurrentDevice = useCallback(async () => {
    if (!slug || !supportsPushNotifications() || Notification.permission !== "granted") return false;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return false;
    }

    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const readyRegistration = await navigator.serviceWorker.ready;
    const existing = await readyRegistration.pushManager.getSubscription();
    console.info("CURRENT PUSH SUB", existing ? {
      endpointSuffix: existing.endpoint.slice(-18),
      hasEndpoint: Boolean(existing.endpoint),
      hasKeys: Boolean(existing.toJSON().keys?.p256dh && existing.toJSON().keys?.auth)
    } : null);
    const subscription =
      existing ??
      (await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      }));

    console.info("PUSH SUBSCRIPTION READY", {
      endpointSuffix: subscription.endpoint.slice(-18),
      hasEndpoint: Boolean(subscription.endpoint),
      hasKeys: Boolean(subscription.toJSON().keys?.p256dh && subscription.toJSON().keys?.auth)
    });

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

    return true;
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    const enabled = localStorage.getItem("notificationEnabled") === "true" || localStorage.getItem("notificationSoundEnabled") === "true";
    if (enabled) {
      localStorage.setItem("notificationEnabled", "true");
      localStorage.setItem("notificationSoundEnabled", "true");
    }
    async function syncExistingPermission() {
      if ("Notification" in window && Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      if (!enabled) {
        setStatus("idle");
        return;
      }

      if ("Notification" in window && Notification.permission === "granted" && slug) {
        try {
          await subscribeCurrentDevice();
        } catch {
          // Keep the user's preference on; in-app sound still works even if system push cannot subscribe.
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
    const enabled = localStorage.getItem("notificationEnabled") === "true" || localStorage.getItem("notificationSoundEnabled") === "true";
    if (enabled) {
      localStorage.setItem("notificationEnabled", "true");
      localStorage.setItem("notificationSoundEnabled", "true");
      setStatus("enabled");
      return;
    }
    if ("Notification" in window && Notification.permission === "denied") {
      setStatus("denied");
    }
  }, []);

  async function enableNotifications() {
    localStorage.setItem("notificationEnabled", "true");
    localStorage.setItem("notificationSoundEnabled", "true");
    window.dispatchEvent(new Event("notification-sound-enabled"));
    const audio = new Audio("/sounds/notification.wav");
    audio.preload = "auto";
    audio.volume = 0.05;
    await audio.play().catch(() => undefined);

    if (!("Notification" in window)) {
      setStatus("enabled");
      return;
    }

    const permission = Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => Notification.permission)
      : Notification.permission;

    if (permission === "denied") {
      setStatus("denied");
      return;
    }

    if (permission !== "granted") {
      setStatus("enabled");
      return;
    }

    if (!slug) {
      setStatus("enabled");
      return;
    }

    if (!supportsPushNotifications()) {
      setStatus("enabled");
      return;
    }

    try {
      await subscribeCurrentDevice();
      setStatus("enabled");
    } catch {
      setStatus("enabled");
    }
  }

  async function disableNotifications() {
    localStorage.setItem("notificationEnabled", "false");
    localStorage.setItem("notificationSoundEnabled", "false");
    window.dispatchEvent(new Event("notification-sound-enabled"));
    setStatus("idle");

    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (slug && subscription) {
          await fetch(`/api/restaurants/${slug}/push/subscribe`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint })
          }).catch(() => undefined);
        }
        await subscription?.unsubscribe();
      }
    } catch {
      // Local preference still disables in-app sound and foreground notifications.
    }
  }

  const isEnabled = status === "enabled";
  const isBlocked = status === "denied";
  const label = isEnabled ? "Thông báo: Bật" : isBlocked ? "Thông báo bị chặn" : "Thông báo: Tắt";

  return (
    <button
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm hover:bg-slate-50 ${isEnabled ? "border-teal-200 bg-teal-50 text-teal-800" : isBlocked ? "border-red-200 bg-red-50 text-red-700" : "bg-white"}`}
      type="button"
      onClick={isEnabled ? disableNotifications : enableNotifications}
    >
      <BellRing className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}
