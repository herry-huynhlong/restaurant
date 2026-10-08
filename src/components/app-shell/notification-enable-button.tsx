"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";

type Status = "idle" | "enabled" | "denied";

export function NotificationEnableButton() {
  const [status, setStatus] = useState<Status>("idle");

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
    localStorage.setItem("notificationSoundEnabled", "true");
    window.dispatchEvent(new Event("notification-sound-enabled"));
    const audio = new Audio("/sounds/notification.wav");
    audio.preload = "auto";
    audio.volume = 0.05;
    await audio.play().catch(() => undefined);

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => undefined);
    }

    setStatus("enabled");
  }

  const isEnabled = status === "enabled";

  return (
    <button
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-slate-50 ${isEnabled ? "border-teal-200 bg-teal-50 text-teal-800" : "bg-white"}`}
      type="button"
      onClick={enableNotifications}
    >
      <BellRing className="h-4 w-4" />
      <span className="sm:hidden">{isEnabled ? "Đã bật" : "Bật TB"}</span>
      <span className="hidden sm:inline">{isEnabled ? "Thông báo: Bật" : "Bật thông báo"}</span>
    </button>
  );
}
