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
      // Pesan beruntun dari percakapan yang sama digabung: "Nama (3 pesan)" dengan beberapa baris terakhir.
      const tag = data.tag || "mjs-chat";
      let lines = [];
      let count = 0;
      try {
        const prev = await self.registration.getNotifications({ tag });
        for (const n of prev) {
          const d = n.data || {};
          if (Array.isArray(d.lines) && d.lines.length > lines.length) lines = d.lines;
          count = Math.max(count, Number(d.count) || 1);
        }
      } catch (e) { /* abaikan */ }
      const baseTitle = data.title || "Pesan baru";
      const bodyText = data.body || "";
      lines = [...lines, bodyText].slice(-5);
      count += 1;
      await self.registration.showNotification(count > 1 ? baseTitle + " (" + count + " pesan)" : baseTitle, {
        body: count > 1 ? lines.join("\n") : bodyText,
        tag,
        renotify: true,
        icon: "/__grok/icon-180.png",
        badge: "/__grok/icon-180.png",
        vibrate: data.mention ? [200, 80, 200, 80, 200] : [120, 60, 120],
        requireInteraction: Boolean(data.mention),
        actions: [{ action: "open", title: "Buka" }, { action: "reply", title: "Balas" }],
        data: { target: data.target || "", lines, count, reply: false },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.target) || "";
  const reply = event.action === "reply";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of wins) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "open-chat", target, reply });
          return;
        }
      }
      if (target.indexOf("c:") === 0 || target.indexOf("b:") === 0) {
        // Komentar: buka aplikasi; jendela komentar bagian itu terbuka otomatis (c:jenis:nomor).
        const key = target.indexOf("b:") === 0 ? "barang:" + target.slice(2) : target.slice(2);
        await self.clients.openWindow("/dashboard#komentar=" + encodeURIComponent(key));
        return;
      }
      await self.clients.openWindow("/chat" + (target ? "#open=" + encodeURIComponent(target) + (reply ? "&reply=1" : "") : ""));
    })(),
  );
});
