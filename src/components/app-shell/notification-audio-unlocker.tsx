"use client";

import { useEffect } from "react";

export function NotificationAudioUnlocker() {
  useEffect(() => {
    let unlocked = false;

    function unlock() {
      if (unlocked) return;
      const enabled = localStorage.getItem("notificationEnabled") === "true" || localStorage.getItem("notificationSoundEnabled") === "true";
      if (!enabled) return;
      unlocked = true;
      const audio = new Audio("/sounds/notification.wav");
      audio.volume = 0.01;
      void audio.play().catch(() => undefined);
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
