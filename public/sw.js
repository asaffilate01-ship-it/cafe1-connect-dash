const ASSET_CACHE = "cafe1-assets-v2";
const PROTECTED_PREFIXES = [
  "/api",
  "/~oauth",
  "/admin",
  "/staff",
  "/till",
  "/kds",
  "/driver",
  "/display",
  "/pay",
  "/order",
  "/print",
  "/account",
  "/tab",
  "/checkout",
  "/cart",
  "/lovable",
];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key !== ASSET_CACHE).map((key) => caches.delete(key))),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") return;
  if (PROTECTED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;
  if (!/\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) return;

  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fresh = fetch(request).then((response) => {
        if (response.ok && response.type === "basic") void cache.put(request, response.clone());
        return response;
      });
      return cached ?? fresh;
    }),
  );
});

// --- Order progress push notifications -------------------------------------
self.addEventListener("push", (event) => {
  let payload = { title: "Café 1", body: "Your order has an update." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (err) {
    void err;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "cafe1-order",
      data: { url: payload.url || "/" },
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
