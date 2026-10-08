self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Restaurant Ordering",
    body: "Bạn có thông báo mới.",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    url: "/post-login"
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icons/icon-192.svg",
      badge: payload.badge || "/icons/icon-192.svg",
      data: { url: payload.url || "/post-login", type: payload.type },
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      requireInteraction: payload.requireInteraction !== false,
      silent: payload.silent === true,
      timestamp: Date.now(),
      vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [250, 120, 250, 120, 350]
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/post-login", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
