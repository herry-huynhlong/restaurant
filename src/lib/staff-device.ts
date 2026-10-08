"use client";

const deviceIdKey = "staffDeviceId";

export function getStaffDeviceId() {
  const existing = localStorage.getItem(deviceIdKey);
  if (existing) return existing;

  const deviceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(deviceIdKey, deviceId);
  return deviceId;
}

export function getStaffDeviceName() {
  const userAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = userAgentData.userAgentData?.platform ?? navigator.platform;
  const shortId = getStaffDeviceId().slice(0, 8);
  return platform ? `Thiết bị ${platform} ${shortId}` : `Thiết bị nhân viên ${shortId}`;
}

export function isDeviceOnShift(slug: string) {
  return localStorage.getItem(`staffOnShift:${slug}`) !== "false";
}

export function setDeviceOnShift(slug: string, onShift: boolean) {
  localStorage.setItem(`staffOnShift:${slug}`, onShift ? "true" : "false");
  window.dispatchEvent(new CustomEvent("staff-shift-changed", { detail: { slug, onShift } }));
}
