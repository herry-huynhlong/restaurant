"use client";

const deviceIdKey = "staffDeviceId";

function validDeviceId(value: string | null): value is string {
  return Boolean(value && /^[a-zA-Z0-9_-]{8,120}$/.test(value));
}

function readDeviceCookie() {
  const value = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${deviceIdKey}=`));
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value.slice(deviceIdKey.length + 1));
    if (validDeviceId(decoded)) return decoded;
  } catch { /* Invalid cookies must not fall back to another device identity. */ }
  throw new Error("Thông tin thiết bị không hợp lệ. Vui lòng liên hệ quản lý.");
}

function readLocal(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function persistDeviceCookie(deviceId: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${deviceIdKey}=${encodeURIComponent(deviceId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  if (readDeviceCookie() !== deviceId) throw new Error("Trình duyệt chưa lưu được thông tin thiết bị. Vui lòng cho phép cookie để tiếp tục.");
}

export function getStaffDeviceId() {
  // iOS copies cookies at installation, not localStorage. Never replace a copied
  // device cookie with an empty or stale local cache, including revoked IDs.
  const cookie = readDeviceCookie();
  if (cookie) return cookie;
  const existing = readLocal(deviceIdKey);
  if (validDeviceId(existing)) {
    persistDeviceCookie(existing);
    return existing;
  }

  const deviceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  persistDeviceCookie(deviceId);
  return deviceId;
}

export function getStaffDeviceName() {
  const userAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = userAgentData.userAgentData?.platform ?? navigator.platform;
  const shortId = getStaffDeviceId().slice(0, 8);
  return platform ? `Thiết bị ${platform} ${shortId}` : `Thiết bị nhân viên ${shortId}`;
}

export function isDeviceOnShift(slug: string) {
  return readLocal(`staffOnShift:${slug}`) !== "false";
}

export function setDeviceOnShift(slug: string, onShift: boolean) {
  try { localStorage.setItem(`staffOnShift:${slug}`, onShift ? "true" : "false"); } catch { /* Server shift state remains authoritative. */ }
  window.dispatchEvent(new CustomEvent("staff-shift-changed", { detail: { slug, onShift } }));
}
