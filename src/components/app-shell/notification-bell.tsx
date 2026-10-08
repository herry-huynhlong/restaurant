"use client";

import { Bell } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Notification, NotificationType } from "@prisma/client";

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
  const [soundEnabled, setSoundEnabled] = useState(false);
  const knownIdsRef = useRef(new Set(notifications.map((notification) => notification.id)));
  const initializedRef = useRef(false);
  const lastSoundAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setSoundEnabled(localStorage.getItem("notificationSoundEnabled") === "true");
    audioRef.current = new Audio("/sounds/notification.wav");
    audioRef.current.preload = "auto";
    audioRef.current.volume = 0.45;

    function syncSoundState() {
      setSoundEnabled(localStorage.getItem("notificationSoundEnabled") === "true");
    }

    window.addEventListener("pointerdown", syncSoundState);
    window.addEventListener("keydown", syncSoundState);
    window.addEventListener("notification-sound-enabled", syncSoundState);
    return () => {
      window.removeEventListener("pointerdown", syncSoundState);
      window.removeEventListener("keydown", syncSoundState);
      window.removeEventListener("notification-sound-enabled", syncSoundState);
    };
  }, []);

  function playSound() {
    if (localStorage.getItem("notificationSoundEnabled") !== "true") return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < 800) return;
    lastSoundAtRef.current = now;

    const audio = audioRef.current ?? new Audio("/sounds/notification.wav");
    audio.currentTime = 0;
    void audio.play().catch((error) => console.warn("Notification sound blocked", error));
  }

  useEffect(() => {
    let cancelled = false;

    function showSystemNotifications(newItems: NotificationItem[]) {
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      for (const notification of newItems) {
        if (!soundTypes.has(notification.type)) continue;
        try {
          const options: NotificationOptions & { renotify?: boolean } = {
            body: notification.message,
            icon: "/icons/icon-192.svg",
            badge: "/icons/icon-192.svg",
            tag: notification.id,
            renotify: true
          };
          const systemNotification = new Notification(notification.title, options);
          systemNotification.onclick = () => window.focus();
        } catch {
          // Some mobile browsers only allow background notifications from the service worker.
        }
      }
    }

    async function fetchNotifications() {
      try {
        const response = await fetch(`/api/restaurants/${slug}/notifications`, { cache: "no-store" });
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
          playSound();
          showSystemNotifications(newItems);
        }
        initializedRef.current = true;
      } catch {
        if (!cancelled) setStatus("reconnecting");
      }
    }

    void fetchNotifications();
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/restaurants/${slug}/notifications/stream`);
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
  }, [slug]);

  async function markOne(notificationId: string) {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setItems((current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item));
    setUnreadCount((current) => Math.max(0, current - 1));

    const response = await fetch(`/api/restaurants/${slug}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId })
    });

    if (!response.ok) {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    }
  }

  async function markAll() {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    const response = await fetch(`/api/restaurants/${slug}/notifications`, {
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
    <details className="relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border bg-white px-3 text-sm hover:bg-slate-50">
        <span className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
              {displayCount}
            </span>
          ) : null}
        </span>
        <span>Thông báo</span>
      </summary>
      <div className="fixed left-3 right-3 top-20 z-50 max-h-[70vh] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border bg-white p-3 shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:max-w-none">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Thông báo</p>
            <p className={`text-xs ${status === "live" ? "text-teal-700" : "text-amber-700"}`}>{status === "live" ? "Live" : "Đang kết nối lại"}</p>
          </div>
          <button className="text-xs font-medium text-teal-700" type="button" onClick={markAll}>
            <span className="hidden sm:inline">Đánh dấu tất cả đã đọc</span>
            <span className="sm:hidden">Đọc hết</span>
          </button>
        </div>
        <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Âm thanh: {soundEnabled ? "Bật" : "Tắt"}
        </div>
        <div className="max-h-[calc(70vh-112px)] space-y-2 overflow-y-auto pr-1">
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
    </details>
  );
}
