import { Bell } from "lucide-react";
import type { Notification } from "@prisma/client";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction
} from "@/app/[rSlug]/admin/actions";

export function NotificationBell({
  slug,
  notifications
}: {
  slug: string;
  notifications: Notification[];
}) {
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const markAll = markAllNotificationsReadAction.bind(null, slug);

  return (
    <details className="relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border bg-white px-3 text-sm hover:bg-slate-50">
        <span className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
        </span>
        <span>Thông báo</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border bg-white p-3 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">Thông báo</p>
          <form action={markAll}>
            <button className="text-xs font-medium text-teal-700" type="submit">
              Đánh dấu tất cả đã đọc
            </button>
          </form>
        </div>
        <div className="max-h-80 space-y-2 overflow-auto">
          {notifications.length ? (
            notifications.map((notification) => {
              const markOne = markNotificationReadAction.bind(null, slug);
              return (
                <div key={notification.id} className="rounded-md bg-slate-50 p-3">
                  <p className="text-sm font-medium">{notification.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{notification.message}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", dateStyle: "short" }).format(notification.createdAt)}
                    </span>
                    {!notification.isRead ? (
                      <form action={markOne}>
                        <input name="notificationId" type="hidden" value={notification.id} />
                        <button className="text-xs text-teal-700" type="submit">
                          Đã đọc
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Chưa có thông báo.</p>
          )}
        </div>
      </div>
    </details>
  );
}
