"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Notification, NotificationType } from "@prisma/client";
import { getStaffDeviceId, isDeviceOnShift } from "@/lib/staff-device";
import { playNotificationSound } from "@/lib/client-notification-sound";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  tableId: string;
  orderId: string | null;
  serviceRequestId: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

const soundTypes = new Set<NotificationType>([
  "ORDER_CREATED",
  "SERVICE_REQUEST_CREATED",
  "PAYMENT_REQUESTED",
  "ORDER_READY"
]);

function normalizeInitialNotification(notification: Notification): NotificationItem {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    tableId: notification.tableId,
    orderId: notification.orderId,
    serviceRequestId: notification.serviceRequestId,
    isRead: notification.isRead,
    createdAt: notification.createdAt instanceof Date ? notification.createdAt.toISOString() : String(notification.createdAt)
  };
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(new Date(value));
}

export function NotificationBell({
  slug,
  notifications
}: {
  slug: string;
  notifications: Notification[];
}) {
  const [items, setItems] = useState<NotificationItem[]>(() => notifications.map(normalizeInitialNotification));
  const [unreadCount, setUnreadCount] = useState(() => notifications.filter((item) => !item.isRead).length);
  const [status, setStatus] = useState<"live" | "reconnecting">("live");
  const [open, setOpen] = useState(false);
  const [onShift, setOnShift] = useState(true);
  const [foregroundPopup, setForegroundPopup] = useState<NotificationItem | null>(null);
  const knownIdsRef = useRef(new Set(notifications.map((notification) => notification.id)));
  const initializedRef = useRef(false);
  const lastSoundAtRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOnShift(isDeviceOnShift(slug));
    function handleShift(event: Event) {
      const detail = (event as CustomEvent<{ slug?: string; onShift?: boolean }>).detail;
      if (detail?.slug === slug && typeof detail.onShift === "boolean") {
        setOnShift(detail.onShift);
      }
    }
    window.addEventListener("staff-shift-changed", handleShift);
    return () => window.removeEventListener("staff-shift-changed", handleShift);
  }, [slug]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function playSound() {
    if (localStorage.getItem("notificationSoundEnabled") !== "true") return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < 800) return;
    lastSoundAtRef.current = now;

    void playNotificationSound(1).catch((error) => console.warn("Notification sound blocked", error));
  }

  useEffect(() => {
    if (!onShift) {
      setStatus("live");
      return;
    }

    let cancelled = false;

    async function showSystemNotifications(newItems: NotificationItem[]) {
      if (localStorage.getItem("notificationEnabled") !== "true") return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      const registration = "serviceWorker" in navigator
        ? await navigator.serviceWorker.ready.catch(() => null)
        : null;

      for (const notification of newItems) {
        if (!soundTypes.has(notification.type)) continue;
        try {
          const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
            body: notification.message,
            icon: `/${slug}/icons/icon-192.png`,
            badge: `/${slug}/icons/icon-192.png`,
            data: { url: `/${slug}/staff`, type: notification.type },
            tag: `${notification.id}-${Date.now()}`,
            renotify: true,
            requireInteraction: true,
            vibrate: [350, 140, 350, 140, 500]
          };
          if (registration) {
            await registration.showNotification(notification.title, options);
          } else {
            const systemNotification = new Notification(notification.title, options);
            systemNotification.onclick = () => window.focus();
          }
        } catch (error) {
          console.warn("System notification blocked", error);
        }
      }
    }

    async function fetchNotifications() {
      try {
        const response = await fetch(`/api/restaurants/${slug}/notifications?deviceId=${encodeURIComponent(getStaffDeviceId())}`, { cache: "no-store" });
        if (response.status === 403) {
          window.location.href = `/${slug}/login?error=${encodeURIComponent("Thiết bị này đã bị quản lý khóa.")}`;
          return;
        }
        if (!response.ok) throw new Error("notifications_failed");
        const data = (await response.json()) as NotificationResponse;
        if (cancelled) return;

        const incoming = data.notifications;
        const newItems = incoming.filter((notification) => !knownIdsRef.current.has(notification.id));
        incoming.forEach((notification) => knownIdsRef.current.add(notification.id));

        setItems((current) => {
          const byId = new Map(current.map((notification) => [notification.id, notification]));
          for (const notification of incoming) {
            byId.set(notification.id, notification);
          }
          return Array.from(byId.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 20);
        });
        setUnreadCount(data.unreadCount);
        setStatus("live");

        if (initializedRef.current && newItems.some((notification) => soundTypes.has(notification.type))) {
          setForegroundPopup(newItems.find((notification) => soundTypes.has(notification.type)) ?? null);
          playSound();
          void showSystemNotifications(newItems);
        }
        initializedRef.current = true;
      } catch {
        if (!cancelled) setStatus("reconnecting");
      }
    }

    void fetchNotifications();
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/restaurants/${slug}/notifications/stream?deviceId=${encodeURIComponent(getStaffDeviceId())}`);
      eventSource.addEventListener("notification", () => {
        void fetchNotifications();
      });
      eventSource.onerror = () => {
        if (!cancelled) setStatus("reconnecting");
      };
      eventSource.onopen = () => {
        if (!cancelled) setStatus("live");
      };
    } catch {
      setStatus("reconnecting");
    }
    const interval = window.setInterval(() => void fetchNotifications(), 5000);
    return () => {
      cancelled = true;
      eventSource?.close();
      window.clearInterval(interval);
    };
  }, [onShift, slug]);

  async function markOne(notificationId: string) {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setItems((current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item));
    setUnreadCount((current) => Math.max(0, current - 1));

    const response = await fetch(`/api/restaurants/${slug}/notifications?deviceId=${encodeURIComponent(getStaffDeviceId())}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId })
    });

    if (!response.ok) {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    } else {
      setOpen(false);
    }
  }

  async function markAll() {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    const response = await fetch(`/api/restaurants/${slug}/notifications?deviceId=${encodeURIComponent(getStaffDeviceId())}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true })
    });

    if (!response.ok) {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    }
  }

  const displayCount = useMemo(() => (unreadCount > 99 ? "99+" : String(unreadCount)), [unreadCount]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="flex h-10 shrink-0 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-md border bg-white px-3 text-sm hover:bg-slate-50"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
              {displayCount}
            </span>
          ) : null}
        </span>
        <span>Thông báo</span>
      </button>
      {open ? (
        <div className="fixed left-3 right-3 top-20 z-50 max-h-[70vh] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:max-w-none">
          <div className="sticky top-0 z-10 border-b bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Thông báo</p>
                {status === "reconnecting" ? <p className="text-xs text-amber-700">Đang kết nối lại</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <button className="text-xs font-medium text-teal-700" type="button" onClick={markAll}>
                  <span className="hidden sm:inline">Đánh dấu tất cả đã đọc</span>
                  <span className="sm:hidden">Đọc hết</span>
                </button>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-50"
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng thông báo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="max-h-[calc(70vh-72px)] space-y-2 overflow-y-auto p-3">
            {items.length ? (
              items.map((notification) => (
                <div key={notification.id} className={`rounded-md p-3 [overflow-wrap:anywhere] ${notification.isRead ? "bg-slate-50" : "bg-teal-50"}`}>
                  <p className="whitespace-normal text-sm font-medium leading-snug">{notification.title}</p>
                  <p className="mt-1 whitespace-normal text-xs leading-relaxed text-slate-600">{notification.message}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{formatCreatedAt(notification.createdAt)}</span>
                    {!notification.isRead ? (
                      <button className="text-xs text-teal-700" type="button" onClick={() => markOne(notification.id)}>
                        Đã đọc
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Chưa có thông báo.</p>
            )}
          </div>
        </div>
      ) : null}
      {foregroundPopup ? (
        <div className="fixed left-3 right-3 top-4 z-[60] rounded-2xl border border-teal-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-5 sm:w-96">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Thông báo mới</p>
              <p className="mt-1 break-words text-base font-semibold text-slate-950">{foregroundPopup.title}</p>
              <p className="mt-1 break-words text-sm text-slate-600">{foregroundPopup.message}</p>
            </div>
            <button
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-50"
              type="button"
              onClick={() => setForegroundPopup(null)}
              aria-label="Đóng thông báo mới"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              type="button"
              onClick={() => {
                setOpen(true);
                setForegroundPopup(null);
              }}
            >
              Xem thông báo
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              type="button"
              onClick={() => setForegroundPopup(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
