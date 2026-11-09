// Shows Neve push notifications sent through Firebase Cloud Messaging.
// Messages carry only a title, a short text and the notification ID, never
// contact details, documents or payment links.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = {};
    }
    const notification = payload.notification ?? {};
    const data = payload.data ?? {};
    const title = notification.title || "Neve";
    event.waitUntil(
        self.registration.showNotification(title, {
            body: notification.body || "You have a new notification.",
            icon: "/logo.png",
            badge: "/favicon.svg",
            tag: data.notificationId || undefined,
            data: { url: "/notifications" },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            for (const client of windows) {
                if (client.url.startsWith(self.location.origin) && "focus" in client) {
                    client.navigate(target);
                    return client.focus();
                }
            }
            return self.clients.openWindow(target);
        })
    );
});
