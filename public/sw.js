/* Service worker Muria Jaya Sakti: menerima notifikasi chat saat aplikasi tertutup. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Safari (iPhone/Mac) wajib menampilkan notifikasi untuk setiap push; browser lain boleh diam
// kalau aplikasi sedang terbuka (aplikasi sendiri sudah membunyikan dan menampilkan pesan).
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(self.navigator.userAgent || "");

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Pesan baru", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (!isSafari && wins.some((c) => c.visibilityState === "visible")) return;
      await self.registration.showNotification(data.title || "Pesan baru", {
        body: data.body || "",
        tag: data.tag || "mjs-chat",
        renotify: true,
        icon: "/__grok/icon-180.png",
        badge: "/__grok/icon-180.png",
        vibrate: [120, 60, 120],
        data: { target: data.target || "" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.target) || "";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of wins) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "open-chat", target });
          return;
        }
      }
      await self.clients.openWindow("/chat" + (target ? "#open=" + encodeURIComponent(target) : ""));
    })(),
  );
});
