"use client";

import { useEffect } from "react";
import { unlockNotificationSound } from "@/lib/client-notification-sound";

export function NotificationAudioUnlocker() {
  useEffect(() => {
    let unlocked = false;

    function unlock() {
      if (unlocked) return;
      const enabled = localStorage.getItem("notificationEnabled") === "true" || localStorage.getItem("notificationSoundEnabled") === "true";
      if (!enabled) return;
      unlocked = true;
      void unlockNotificationSound();
    }

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
