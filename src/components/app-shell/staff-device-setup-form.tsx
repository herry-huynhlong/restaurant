"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { getStaffDeviceId, getStaffDeviceName, setDeviceOnShift } from "@/lib/staff-device";

export function StaffDeviceSetupForm({ slug, defaultNext }: { slug: string; defaultNext: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const operatorName = String(formData.get("operatorName") ?? "").trim();
    const next = searchParams.get("next") ?? defaultNext;

    try {
      const response = await fetch(`/api/restaurants/${slug}/device-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getStaffDeviceId(),
          deviceName: getStaffDeviceName(),
          operatorName
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Không bắt đầu được ca làm việc.");
      }
      setDeviceOnShift(slug, true);
      localStorage.setItem("notificationEnabled", "true");
      localStorage.setItem("notificationSoundEnabled", "true");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không bắt đầu được ca làm việc.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">
        Họ tên người đang sử dụng
        <input
          className="mt-1 h-11 w-full rounded-md border px-3 outline-none focus:border-teal-600"
          name="operatorName"
          placeholder="Nguyễn Văn An"
          maxLength={120}
          autoComplete="name"
          required
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={pending}>
        {pending ? "Đang bắt đầu..." : "Bắt đầu làm việc"}
      </button>
    </form>
  );
}
