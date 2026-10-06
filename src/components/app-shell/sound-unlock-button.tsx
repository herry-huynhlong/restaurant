"use client";

import { BellRing } from "lucide-react";
import { useState } from "react";

export function SoundUnlockButton() {
  const [enabled, setEnabled] = useState(false);

  function enableSound() {
    const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQoGAACAgICAgICAgICAgICAgICAgICAgICAgICAkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYqKioqKioqKioqKioqKioqKioqKioqKiampqampqampqampqampqampqampqamqurq6urq6urq6urq6urq6urq6urq6urq7CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwtra2tra2tra2tra2tra2tra2tra2tra2tsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8wMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA");
    audio.volume = 0.25;
    void audio.play().catch(() => undefined);
    localStorage.setItem("notificationSoundEnabled", "true");
    setEnabled(true);
  }

  return (
    <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={enableSound}>
      <BellRing className="h-4 w-4" />
      {enabled ? "Đã bật âm thanh" : "Bật thông báo âm thanh"}
    </button>
  );
}
