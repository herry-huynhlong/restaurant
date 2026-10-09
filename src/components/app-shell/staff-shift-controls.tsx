"use client";

import { LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { getStaffDeviceId, isDeviceOnShift, setDeviceOnShift } from "@/lib/staff-device";
import { NotificationEnableButton } from "@/components/app-shell/notification-enable-button";

export function StaffShiftControls({ slug }: { slug?: string }) {
  const [onShift, setOnShift] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const activeSlug = slug;
    const deviceId = getStaffDeviceId();
    setOnShift(isDeviceOnShift(activeSlug));

    let cancelled = false;
    async function syncShiftState() {
      const response = await fetch(`/api/restaurants/${activeSlug}/shift?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
      if (response.status === 403) {
        localStorage.removeItem(`staffOnShift:${activeSlug}`);
        window.location.href = `/${activeSlug}/login?error=${encodeURIComponent("Thiết bị này đã bị quản lý khóa.")}`;
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as { onShift?: boolean };
      if (cancelled || typeof data.onShift !== "boolean") return;
      setOnShift(data.onShift);
      setDeviceOnShift(activeSlug, data.onShift);
    }

    void syncShiftState();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function changeShift(nextOnShift: boolean) {
    if (!slug) return;
    if (!nextOnShift && !window.confirm("Xác nhận tan ca trên thiết bị này?")) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/restaurants/${slug}/shift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getStaffDeviceId(),
          action: nextOnShift ? "START" : "END"
        })
      });
      if (response.status === 403) {
        localStorage.removeItem(`staffOnShift:${slug}`);
        window.location.href = `/${slug}/login?error=${encodeURIComponent("Thiết bị này đã bị quản lý khóa.")}`;
        return;
      }
      if (!response.ok) throw new Error("shift_failed");

      setOnShift(nextOnShift);
      setDeviceOnShift(slug, nextOnShift);
      localStorage.setItem("notificationEnabled", nextOnShift ? "true" : "false");
      localStorage.setItem("notificationSoundEnabled", nextOnShift ? "true" : "false");
      window.dispatchEvent(new Event("notification-sound-enabled"));
    } finally {
      setSaving(false);
    }
  }

  if (!slug) return null;

  if (!onShift) {
    return (
      <>
        <span className="inline-flex h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800">
          Ngoài ca
        </span>
        <button
          className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
          type="button"
          disabled={saving}
          onClick={() => void changeShift(true)}
        >
          <LogIn className="h-4 w-4" />
          Vào ca
        </button>
      </>
    );
  }

  return (
    <>
      <NotificationEnableButton slug={slug} />
      <span className="inline-flex h-10 items-center rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-800">
        Trong ca
      </span>
      <button
        className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
        type="button"
        disabled={saving}
        onClick={() => void changeShift(false)}
      >
        <LogOut className="h-4 w-4" />
        Tan ca
      </button>
    </>
  );
}
