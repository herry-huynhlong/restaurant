"use client";

import { LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { getStaffDeviceId, isDeviceOnShift, setDeviceOnShift } from "@/lib/staff-device";
import { NotificationEnableButton } from "@/components/app-shell/notification-enable-button";
import { recoverStaffAccess } from "@/lib/staff-access-recovery";

export function StaffShiftControls({ slug }: { slug?: string }) {
  const [onShift, setOnShift] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const activeSlug = slug;
    let deviceId: string;
    try { deviceId = getStaffDeviceId(); }
    catch { setError("Không đọc được thông tin thiết bị. Vui lòng kiểm tra quyền lưu cookie hoặc liên hệ quản lý."); return; }
    setOnShift(isDeviceOnShift(activeSlug));

    let cancelled = false;
    async function syncShiftState() {
      const response = await fetch(`/api/restaurants/${activeSlug}/shift?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
      if (await recoverStaffAccess(activeSlug, response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as { onShift?: boolean };
      if (cancelled || typeof data.onShift !== "boolean") return;
      setOnShift(data.onShift);
      setDeviceOnShift(activeSlug, data.onShift);
    }

    void syncShiftState().catch(() => setError("Chưa kết nối được trạng thái ca. Vui lòng thử lại."));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function changeShift(nextOnShift: boolean) {
    if (!slug) return;
    if (!nextOnShift && !window.confirm("Xác nhận tan ca trên thiết bị này?")) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/restaurants/${slug}/shift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getStaffDeviceId(),
          action: nextOnShift ? "START" : "END"
        })
      });
      if (await recoverStaffAccess(slug, response)) return;
      if (!response.ok) throw new Error("shift_failed");

      setOnShift(nextOnShift);
      setDeviceOnShift(slug, nextOnShift);
      try {
        localStorage.setItem("notificationEnabled", nextOnShift ? "true" : "false");
        localStorage.setItem("notificationSoundEnabled", nextOnShift ? "true" : "false");
      } catch { /* Optional notification preferences are not authentication. */ }
      window.dispatchEvent(new Event("notification-sound-enabled"));
    } catch {
      setError("Chưa cập nhật được ca. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  if (!slug) return null;

  if (!onShift) {
    return (
      <>
        {error ? <span role="alert" className="text-sm text-amber-800">{error}</span> : null}
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
      {error ? <span role="alert" className="text-sm text-amber-800">{error}</span> : null}
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
