self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("Skill Compass", {
    body: "Your Today practice is ready.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "skill-compass-today",
    data: { url: "/today" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL("/today", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
