/* global self, clients */

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : null;
    } catch {
      return null;
    }
  })();

  if (!data || !data.title) return;
  const options = {
    body: data.body || "",
    icon: "/logo/depth4-logo.svg",
    badge: "/logo/depth4-logo.svg",
    data: { url: data.url || "/", tag: data.tag || "" },
    requireInteraction: false,
    tag: data.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.focus();
          w.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    }),
  );
});

