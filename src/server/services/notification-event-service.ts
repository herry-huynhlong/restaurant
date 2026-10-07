import { EventEmitter } from "node:events";

type NotificationRefreshEvent = {
  eventId: string;
  restaurantId: string;
  createdAt: string;
};

const globalForNotifications = globalThis as unknown as {
  notificationEmitter?: EventEmitter;
};

export const notificationEmitter = globalForNotifications.notificationEmitter ?? new EventEmitter();
notificationEmitter.setMaxListeners(500);
globalForNotifications.notificationEmitter = notificationEmitter;

export function publishNotificationRefresh(restaurantId: string) {
  const event: NotificationRefreshEvent = {
    eventId: `${restaurantId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    restaurantId,
    createdAt: new Date().toISOString()
  };
  notificationEmitter.emit(`restaurant:${restaurantId}`, event);
}
