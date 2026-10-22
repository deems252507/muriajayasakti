import { pushPublicKey, pushSubscribe, pushUnsubscribe } from "./api";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerWorker() {
  if (!pushSupported()) return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function sendSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  await pushSubscribe({
    data: { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent.slice(0, 200) },
  });
}

async function ensureSubscription(reg: ServiceWorkerRegistration) {
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await pushPublicKey();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
  }
  await sendSubscription(sub);
  return sub;
}

/** Minta izin lalu daftarkan perangkat ini untuk menerima notifikasi. */
export async function enablePush(): Promise<"ok" | "denied" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await registerWorker();
  if (!reg) return "unsupported";
  await ensureSubscription(reg);
  return "ok";
}

/** Kalau izin sudah diberikan, pastikan perangkat ini terdaftar atas nama akun yang sedang masuk. */
export async function syncPush() {
  if (!pushSupported()) return;
  const reg = await registerWorker();
  if (!reg || Notification.permission !== "granted") return;
  await ensureSubscription(reg);
}

export async function pushActive() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return Boolean(reg && (await reg.pushManager.getSubscription()));
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await pushUnsubscribe({ data: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** Notifikasi lokal saat tab tersembunyi. Memakai service worker supaya jalan di Android; dilewati kalau push sudah aktif. */
export async function showLocalNotification(title: string, body: string, target: string) {
  try {
    const reg = pushSupported() ? await navigator.serviceWorker.getRegistration("/") : undefined;
    if (reg) {
      if (await reg.pushManager.getSubscription()) return;
      await reg.showNotification(`Pesan dari ${title}`, { body, tag: "mjs-chat", icon: "/__grok/icon-180.png", actions: [{ action: "open", title: "Buka" }, { action: "reply", title: "Balas" }], data: { target } } as NotificationOptions);
      return;
    }
  } catch { /* lanjut ke cara biasa */ }
  try {
    const n = new Notification(`Pesan dari ${title}`, { body, tag: "mjs-chat" });
    n.onclick = () => {
      window.focus();
      sessionStorage.setItem("mjs-chat-with", target);
      window.location.href = "/chat";
    };
  } catch { /* abaikan */ }
}
