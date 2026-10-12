"use client";

import { AlertTriangle, BellRing, CheckCircle2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";
import { getStaffDeviceId, getStaffDeviceName } from "@/lib/staff-device";

type Status = "idle" | "enabled" | "denied";
type PermissionState = "unsupported" | "default" | "granted" | "denied";

function supportsPushNotifications() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function getPermissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function NotificationEnableButton({ slug }: { slug?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [permissionState, setPermissionState] = useState<PermissionState>("default");
  const [pushReady, setPushReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const subscribeCurrentDevice = useCallback(async () => {
    if (!slug || !supportsPushNotifications() || Notification.permission !== "granted") return false;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return false;
    }

    const readyRegistration = await registerServiceWorker();
    const existing = await readyRegistration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      }));

    const response = await fetch(`/api/restaurants/${slug}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...subscription.toJSON(),
        deviceId: getStaffDeviceId(),
        deviceName: getStaffDeviceName()
      })
    });

    if (response.status === 403) {
      window.location.href = `/${slug}/login?error=${encodeURIComponent("Thiết bị này đã bị quản lý khóa.")}`;
      return false;
    }

    if (!response.ok) {
      throw new Error("push_subscribe_failed");
    }

    return true;
  }, [slug]);

  useEffect(() => {
    setPermissionState(getPermissionState());
    const enabled = localStorage.getItem("notificationEnabled") === "true" || localStorage.getItem("notificationSoundEnabled") === "true";
    if (enabled) {
      localStorage.setItem("notificationEnabled", "true");
      localStorage.setItem("notificationSoundEnabled", "true");
    }

    async function syncExistingPermission() {
      const permission = getPermissionState();
      setPermissionState(permission);

      if (permission === "denied") {
        setStatus("denied");
        return;
      }

      if (!enabled) {
        setStatus("idle");
        return;
      }

      if (permission === "granted" && slug) {
        try {
          const subscribed = await subscribeCurrentDevice();
          setPushReady(subscribed);
        } catch {
          setPushReady(false);
        }
      }

      setStatus("enabled");
    }

    void syncExistingPermission();
  }, [slug, subscribeCurrentDevice]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function enableNotifications() {
    setBusy(true);
    setMessage(null);
    try {
      localStorage.setItem("notificationEnabled", "true");
      localStorage.setItem("notificationSoundEnabled", "true");
      window.dispatchEvent(new Event("notification-sound-enabled"));
      await playNotificationSound(0.35);

      if (!("Notification" in window)) {
        setStatus("enabled");
        setPermissionState("unsupported");
        setMessage("Đã bật âm thanh trong app. Trình duyệt này chưa hỗ trợ thông báo hệ thống.");
        return;
      }

      const permission = Notification.permission === "default"
        ? await Notification.requestPermission().catch(() => Notification.permission)
        : Notification.permission;
      setPermissionState(permission);

      if (permission === "denied") {
        setStatus("denied");
        setPushReady(false);
        setMessage("Thiết bị đang chặn quyền thông báo. Hãy mở cài đặt trình duyệt/app và cho phép thông báo.");
        return;
      }

      if (permission !== "granted") {
        setStatus("enabled");
        setPushReady(false);
        setMessage("Đã bật âm thanh trong app. Thông báo hệ thống chưa được cấp quyền.");
        return;
      }

      const subscribed = await subscribeCurrentDevice().catch(() => false);
      setPushReady(subscribed);
      setStatus("enabled");
      setMessage(subscribed ? "Đã bật âm thanh và thông báo hệ thống trên thiết bị này." : "Đã bật âm thanh. Chưa đăng ký được thông báo hệ thống.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setMessage(null);
    localStorage.setItem("notificationEnabled", "false");
    localStorage.setItem("notificationSoundEnabled", "false");
    window.dispatchEvent(new Event("notification-sound-enabled"));
    setStatus("idle");
    setPushReady(false);

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
      }
      setMessage("Đã tắt âm thanh và thông báo trên thiết bị này.");
    } finally {
      setBusy(false);
    }
  }

  async function testSound() {
    localStorage.setItem("notificationSoundEnabled", "true");
    setStatus("enabled");
    await playNotificationSound(0.45);
    setMessage("Đã phát thử âm thanh. Nếu không nghe, kiểm tra âm lượng hoặc chế độ im lặng của điện thoại.");
  }

  async function testSystemNotification() {
    setBusy(true);
    setMessage(null);
    try {
      if (permissionState !== "granted") {
        setMessage("Cần bấm Bật trên thiết bị này trước khi kiểm tra thông báo hệ thống.");
        return;
      }

      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || !slug) {
        setMessage("Thiết bị chưa đăng ký thông báo hệ thống. Hãy bật lại thông báo.");
        return;
      }

      const response = await fetch(`/api/restaurants/${slug}/push/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });

      if (!response.ok) {
        setMessage("Chưa gửi được thông báo thử. Hãy bật lại thông báo hoặc kiểm tra quyền trên điện thoại.");
        return;
      }

      setPushReady(true);
      setMessage("Đã gửi thông báo thử tới thiết bị này.");
    } finally {
      setBusy(false);
    }
  }

  const isEnabled = status === "enabled";
  const isBlocked = status === "denied";
  const label = isEnabled ? "Thông báo: Bật" : isBlocked ? "Thông báo bị chặn" : "Thông báo: Tắt";

  return (
    <div className="relative" ref={containerRef}>
      <button
        className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm hover:bg-slate-50 ${isEnabled ? "border-teal-200 bg-teal-50 text-teal-800" : isBlocked ? "border-red-200 bg-red-50 text-red-700" : "bg-white"}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <BellRing className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </button>

      {open ? (
        <div className="fixed left-3 right-3 top-20 z-50 max-w-[calc(100vw-24px)] rounded-2xl border bg-white p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[25rem] sm:max-w-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Cài đặt thông báo thiết bị</p>
              <p className="mt-1 text-xs text-slate-500">Bật một lần trên mỗi điện thoại hoặc máy tính dùng để nhận order.</p>
            </div>
            <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-slate-50" type="button" onClick={() => setOpen(false)} aria-label="Đóng cài đặt thông báo">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <SetupRow label="Âm thanh trong app" ok={isEnabled} value={isEnabled ? "Đã bật" : "Chưa bật"} />
            <SetupRow label="Quyền thông báo hệ thống" ok={permissionState === "granted"} value={permissionLabel(permissionState)} warn={permissionState === "denied"} />
            <SetupRow label="Thiết bị nhận push" ok={pushReady} value={pushReady ? "Đã đăng ký" : "Chưa đăng ký"} />
          </div>

          {message ? (
            <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${isBlocked ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
              {message}
            </p>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {isEnabled ? (
              <button className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60" type="button" disabled={busy} onClick={() => void disableNotifications()}>
                Tắt trên thiết bị này
              </button>
            ) : (
              <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="button" disabled={busy} onClick={() => void enableNotifications()}>
                Bật trên thiết bị này
              </button>
            )}
            <button className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60" type="button" disabled={busy} onClick={() => void testSound()}>
              <Volume2 className="h-4 w-4" />
              Kiểm tra âm thanh
            </button>
            <button className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 sm:col-span-2" type="button" disabled={busy || permissionState !== "granted"} onClick={() => void testSystemNotification()}>
              Gửi thông báo thử tới thiết bị này
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SetupRow({ label, value, ok, warn = false }: { label: string; value: string; ok: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-semibold ${ok ? "text-teal-700" : warn ? "text-red-700" : "text-slate-700"}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : warn ? <AlertTriangle className="h-4 w-4" /> : null}
        {value}
      </span>
    </div>
  );
}

function permissionLabel(permission: PermissionState) {
  if (permission === "granted") return "Đã cho phép";
  if (permission === "denied") return "Đang bị chặn";
  if (permission === "unsupported") return "Không hỗ trợ";
  return "Chưa hỏi quyền";
}

async function registerServiceWorker() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function playNotificationSound(volume: number) {
  const audio = new Audio("/sounds/notification.wav");
  audio.preload = "auto";
  audio.volume = volume;
  await audio.play().catch(() => undefined);
}
