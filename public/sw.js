// Unchore service worker — shows pushed notifications and opens the chat when tapped. No caching, no fetch interception.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const url = typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : "/app";
  e.waitUntil(self.registration.showNotification(typeof d.title === "string" && d.title ? d.title : "Unchore", { body: typeof d.body === "string" ? d.body : "", tag: typeof d.tag === "string" ? d.tag : "unchore", data: { url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/app";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) { await w.navigate(url).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(url);
  })());
});
