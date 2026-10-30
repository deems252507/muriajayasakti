import { clearPersistedState } from "@/lib/persist";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  PackagePlus,
  Percent,
  Receipt,
  RefreshCw,
  ScrollText,
  Settings,
  ShoppingCart,
  Undo2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { installStockAlerts } from "@/lib/shop/alerts";
import { chatUnread, itemCommentInbox, logout, listMasters } from "@/lib/shop/api";
import { disablePush, showLocalNotification, syncPush } from "@/lib/shop/push";
import { setShopProfile } from "@/lib/shop/print";
import { CommentHost, goToComment } from "@/components/shop/comment-ui";
import { PresenceButton } from "@/components/shop/presence";
import type { Staff } from "@/lib/shop/types";

const ADMIN = [
  {
    label: "Utama",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Penjualan & Kasir",
    items: [
      { to: "/kasir", label: "Kasir (POS)", icon: ShoppingCart },
      { to: "/retur", label: "Retur & Tukar", icon: Undo2 },
      { to: "/kas", label: "Kas Kasir", icon: Wallet },
    ],
  },
  {
    label: "Transaksi & Persediaan",
    items: [
      { to: "/manual", label: "Transaksi Manual", icon: ArrowLeftRight },
      { to: "/riwayat", label: "Riwayat Transaksi", icon: History },
      { to: "/barang", label: "Daftar Sparepart", icon: Package },
      { to: "/pemasok", label: "Barang Masuk Pemasok", icon: PackagePlus },
    ],
  },
  {
    label: "Keuangan & Laporan",
    items: [
      { to: "/laporan-penjualan", label: "Laporan Barang Terjual", icon: ClipboardList },
      { to: "/laporan-kas", label: "Laporan Kas Harian", icon: ClipboardList },
      { to: "/laporan-harian", label: "Laporan Harian (Excel)", icon: FileText },
      { to: "/bon", label: "Bon / Piutang", icon: Receipt },
      { to: "/stok", label: "Laporan Stok", icon: ClipboardList },
      { to: "/pajak", label: "Data Pajak Internal", icon: Percent },
    ],
  },
  {
    label: "Master Data",
    items: [{ to: "/mitra", label: "Pelanggan & Supplier", icon: Users }],
  },
  {
    label: "Sistem",
    items: [
      { to: "/chat", label: "Chat Staff", icon: MessageCircle },
      { to: "/jejak", label: "Riwayat Aktivitas", icon: ScrollText },
      { to: "/pengaturan", label: "Pengaturan", icon: Settings },
    ],
  },
] as const;


const OWNER = [
  { label: "Utama", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Laporan",
    items: [
      { to: "/riwayat", label: "Riwayat Transaksi", icon: History },
      { to: "/laporan-penjualan", label: "Laporan Barang Terjual", icon: ClipboardList },
      { to: "/laporan-kas", label: "Laporan Kas Harian", icon: ClipboardList },
      { to: "/laporan-harian", label: "Laporan Harian (Excel)", icon: FileText },
      { to: "/bon", label: "Bon / Piutang", icon: Receipt },
      { to: "/stok", label: "Laporan Stok", icon: ClipboardList },
      { to: "/pajak", label: "Data Pajak Internal", icon: Percent },
    ],
  },
  { label: "Komunikasi", items: [{ to: "/chat", label: "Chat Staff", icon: MessageCircle }] },
  {
    label: "Data (lihat saja)",
    items: [
      { to: "/barang", label: "Daftar Sparepart", icon: Package },
      { to: "/mitra", label: "Pelanggan & Supplier", icon: Users },
      { to: "/jejak", label: "Riwayat Aktivitas", icon: ScrollText },
    ],
  },
] as const;

const KASIR = [
  { label: "Utama", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Operasional Kasir",
    items: [
      { to: "/kasir", label: "Kasir (POS)", icon: ShoppingCart },
      { to: "/retur", label: "Retur & Tukar", icon: Undo2 },
      { to: "/kas", label: "Kas Kasir", icon: Wallet },
    ],
  },
  {
    label: "Transaksi & Piutang",
    items: [
      { to: "/riwayat", label: "Riwayat Transaksi", icon: History },
      { to: "/bon", label: "Bon / Piutang", icon: Receipt },
    ],
  },
  { label: "Komunikasi", items: [{ to: "/chat", label: "Chat Staff", icon: MessageCircle }] },
] as const;

export function Mark({ text, q }: { text: string; q: string }) {
  const query = q.trim();
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  let key = 0;
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key} className="rounded bg-yellow-300 px-0.5 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    key += 1;
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

/** Seperti Mark, tapi tiap kata di pencarian (dipisah spasi) disorot sendiri-sendiri. */
export function MarkWords({ text, q }: { text: string; q: string }) {
  const words = [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!words.length || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const spans: Array<[number, number]> = [];
  for (const word of words) {
    let at = lower.indexOf(word);
    while (at >= 0) {
      spans.push([at, at + word.length]);
      at = lower.indexOf(word, at + word.length);
    }
  }
  if (!spans.length) return <>{text}</>;
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  const parts: React.ReactNode[] = [];
  let from = 0;
  merged.forEach(([a, b], key) => {
    if (a > from) parts.push(text.slice(from, a));
    parts.push(<mark key={key} className="rounded bg-yellow-300 px-0.5 text-inherit">{text.slice(a, b)}</mark>);
    from = b;
  });
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

export function Shell({ me, children }: { me: Staff; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => { installStockAlerts(); }, []);
  // Ukur tinggi layar yang BENAR-BENAR terlihat (memperhitungkan bar alamat & keyboard HP)
  // dan tinggi header, lalu simpan sebagai CSS variable untuk halaman yang butuh tinggi penuh (chat).
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const sync = () => {
      root.style.setProperty("--app-vh", `${Math.round(vv && vv.scale <= 1.01 ? vv.height : window.innerHeight)}px`); // saat di-zoom pakai innerHeight
      root.style.setProperty("--shell-header-h", `${Math.round(headerRef.current?.getBoundingClientRect().height ?? 0)}px`);
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    vv?.addEventListener("resize", sync);
    const ro = typeof ResizeObserver !== "undefined" && headerRef.current ? new ResizeObserver(sync) : null;
    if (ro && headerRef.current) ro.observe(headerRef.current);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      vv?.removeEventListener("resize", sync);
      ro?.disconnect();
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--shell-header-h");
    };
  }, []);
  const [brand, setBrand] = useState("MURIA JAYA SAKTI");
  const [logo, setLogo] = useState("/brand/logo.png");
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [chatBadge, setChatBadge] = useState(0);
  const [tagBadge, setTagBadge] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  useEffect(() => {
    let alive = true;
    let lastSeen = -1; // waktu (ms) pesan terbaru yang sudah diberi notifikasi (-1 = belum ada acuan)
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    const beep = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.36);
        window.setTimeout(() => void ctx.close(), 600);
      } catch { /* browser menolak suara sebelum ada interaksi */ }
    };
    const tick = () => {
      void chatUnread().then((res) => {
        if (!alive) return;
        setChatBadge(res.unread);
        document.title = res.unread > 0 ? `(${res.unread}) ${baseTitle}` : baseTitle;
        const latest = res.latest;
        if (!latest) { if (lastSeen < 0) lastSeen = 0; return; }
        if (lastSeen < 0) { lastSeen = latest.ts; return; } // pertama kali dimuat: jangan bunyikan pesan lama
        if (latest.ts <= lastSeen) return;
        lastSeen = latest.ts;
        if (pathRef.current === "/chat" && !document.hidden) return; // sedang di halaman chat
        beep();
        const preview = latest.body.length > 80 ? `${latest.body.slice(0, 80)}...` : latest.body;
        if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          void showLocalNotification(latest.title, preview, latest.target);
        } else {
          const open = () => { sessionStorage.setItem("mjs-chat-with", latest.target); window.location.href = "/chat"; };
          toast.custom((id) => (
            <div role="status" className="flex w-[min(92vw,360px)] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-extrabold text-white">{(latest.title.trim()[0] || "?").toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-extrabold text-slate-900">{latest.title}</p>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-accent">Pesan baru</span>
                </div>
                <p className="mt-0.5 line-clamp-2 break-words text-xs text-slate-600">{preview}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="h-8 rounded-lg bg-accent px-3 text-xs font-bold text-white" onClick={() => { toast.dismiss(id); open(); }}>Buka Chat</button>
                  <button type="button" className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600" onClick={() => toast.dismiss(id)}>Tutup</button>
                </div>
              </div>
            </div>
          ), { id: "chat-toast", duration: 8000 });
        }
      }).catch(() => undefined);
    };
    // Komentar barang: lencana di menu Daftar Sparepart + kartu saat ada Admin lain yang men-tag saya.
    let tagSeen = -1;
    const tickTag = () => {
      void itemCommentInbox().then((res) => {
        if (!alive) return;
        setTagBadge(res.unread);
        const latest = res.latest;
        if (!latest) { if (tagSeen < 0) tagSeen = 0; return; }
        if (tagSeen < 0) { tagSeen = latest.ts; return; }
        if (latest.ts <= tagSeen) return;
        tagSeen = latest.ts;
        beep();
        const preview = latest.body.length > 80 ? `${latest.body.slice(0, 80)}...` : latest.body;
        const open = () => goToComment({ kind: latest.kind, ref: latest.ref, label: latest.label });
        if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          void showLocalNotification(`${latest.fromName} menyebut Anda di komentar ${latest.kindName.toLowerCase()}`, `${latest.label}: ${preview}`, `c:${latest.kind}:${latest.ref}`);
        } else {
          toast.custom((id) => (
            <div role="status" className="flex w-[min(92vw,360px)] items-start gap-3 rounded-2xl border border-violet-300 bg-white p-3 shadow-xl ring-1 ring-violet-100">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-600 text-sm font-extrabold text-white">@</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-extrabold text-slate-900">{latest.fromName} men-tag Anda</p>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-violet-700">Komentar</span>
                </div>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-700"><span className="mr-1 rounded bg-violet-100 px-1 text-[10px] font-bold uppercase text-violet-700">{latest.kindName}</span>{latest.label}</p>
                <p className="line-clamp-2 break-words text-xs text-slate-600">{preview}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="h-8 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white" onClick={() => { toast.dismiss(id); open(); }}>Lihat di lokasi</button>
                  <button type="button" className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600" onClick={() => toast.dismiss(id)}>Tutup</button>
                </div>
              </div>
            </div>
          ), { id: "comment-toast", duration: 10000 });
        }
      }).catch(() => undefined);
    };
    tick();
    tickTag();
    // 6 detik saat tab terlihat (notifikasi tetap cepat), 30 detik saat tab tersembunyi (hemat; Web Push tetap jalan).
    let skip = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) { skip = (skip + 1) % 5; if (skip) return; } else skip = 0;
      tick();
      tickTag();
    }, 6000);
    const onChat = () => tick();
    const onTagChange = () => tickTag();
    window.addEventListener("mjs-comment-changed", onTagChange);
    const askPermission = () => {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission().then(() => syncPush()).catch(() => undefined);
      }
    };
    // Daftarkan service worker dan pastikan perangkat ini terdaftar untuk notifikasi di luar aplikasi.
    void syncPush().catch(() => undefined);
    // Klik notifikasi saat aplikasi masih terbuka: buka chat yang dimaksud.
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "open-chat") return;
      const target = String(event.data.target ?? "");
      if (target.startsWith("c:") || target.startsWith("b:")) {
        // Komentar: buka jendela komentarnya (c:jenis:nomor; "b:" = format lama khusus barang).
        const m = target.startsWith("b:") ? ["", "barang", target.slice(2)] : /^c:([a-z]+):(.+)$/.exec(target);
        if (m) goToComment({ kind: m[1], ref: m[2], label: "" });
        return;
      }
      if (event.data.reply) { try { sessionStorage.setItem("mjs-chat-focus", "1"); } catch { /* abaikan */ } }
      if (pathRef.current === "/chat") window.dispatchEvent(new CustomEvent("mjs-open-chat", { detail: target }));
      else { try { sessionStorage.setItem("mjs-chat-with", target); } catch { /* abaikan */ } window.location.href = "/chat"; }
    };
    if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", onWorkerMessage);
    window.addEventListener("mjs-chat", onChat);
    window.addEventListener("focus", tick);
    window.addEventListener("focus", tickTag);
    window.addEventListener("click", askPermission, { once: true });
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("mjs-chat", onChat);
      window.removeEventListener("focus", tick);
      window.removeEventListener("focus", tickTag);
      window.removeEventListener("mjs-comment-changed", onTagChange);
      window.removeEventListener("click", askPermission);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
      document.title = baseTitle;
    };
  }, []);
  const groups = me.role === "Kasir" ? KASIR : me.role === "Owner" ? OWNER : ADMIN;
  const current = groups.flatMap((group) => [...group.items]).find((item) => path === item.to)?.label ?? brand;
  const printable = ["/laporan-kas", "/stok", "/pajak", "/riwayat", "/bon", "/kas"].includes(path);
  useEffect(() => {
    function apply(profile: { nama?: string; alamat?: string; telepon?: string; tagline?: string; logo?: string }) {
      if (!profile?.nama) return;
      setBrand(profile.nama);
      setLogo(profile.logo || "/brand/logo.png");
      setShopProfile(profile);
    }
    void listMasters().then((res) => apply(res.profile)).catch(() => undefined);
    const onShop = (event: Event) => apply((event as CustomEvent).detail);
    window.addEventListener("mjs-shop", onShop);
    return () => window.removeEventListener("mjs-shop", onShop);
  }, []);

  return (
    <div className="app-shell min-h-screen bg-paper text-ink md:grid md:grid-cols-[260px_1fr]">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-gradient-to-b from-[#121a2b] to-[#0b1220] text-white shadow-2xl transition-transform duration-200 md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
          <img src={logo} alt="" className="h-11 w-11 rounded-2xl bg-white/10 object-contain p-1.5 ring-1 ring-white/15" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-wide">{brand}</p>
            <p className="text-[11px] text-white/45">Sistem Manajemen Stok</p>
          </div>
          <button className="ml-auto rounded-lg p-2 hover:bg-white/10 md:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mt-3">
              <p className="px-3 text-[10px] font-semibold tracking-[0.18em] text-white/35 uppercase">{group.label}</p>
              <div className="mt-1 flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = path === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition ${active ? "bg-white text-ink shadow-sm font-semibold" : "text-white/75 hover:bg-white/20 hover:text-white"}`}
                    >
                      <Icon className={`size-4 shrink-0 ${active ? "text-accent" : ""}`} />
                      {item.label}
                      {item.to === "/chat" && chatBadge > 0 ? <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{chatBadge > 99 ? "99+" : chatBadge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-4 py-3">
          <p className="text-[11px] leading-5 text-white/70">Developed by Rizky Dwi Maulana</p>
        </div>
      </aside>
      {open ? <button className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={() => setOpen(false)} aria-label="Tutup" /> : null}
      <div className="min-w-0">
        <header ref={headerRef} className="no-print sticky top-0 z-20 border-b border-white/60 bg-white/80 px-3 py-3 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3">
            <button className="grid size-11 place-items-center rounded-xl border border-line bg-white md:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{me.role}</p>
              <h1 className="truncate text-base font-bold sm:text-lg">{current}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {printable ? (
                <button className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-3 text-xs font-semibold" onClick={() => window.print()}>
                  Cetak PDF
                </button>
              ) : null}
              <PresenceButton meUsername={me.username} />
              <Link
                to="/chat"
                key={`chat-${chatBadge > 0 ? "n" : "0"}`}
                title="Chat Staff"
                aria-label={chatBadge > 0 ? `Chat Staff, ${chatBadge} pesan belum dibaca` : "Chat Staff"}
                className={`relative grid size-10 place-items-center rounded-xl border ${chatBadge > 0 ? "mjs-attn-green border-emerald-500 bg-emerald-500 text-white" : path === "/chat" ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-line bg-white text-emerald-600"}`}
              >
                {/* Ikon gelembung chat + telepon, gaya aplikasi chat hijau */}
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  <g transform="translate(6.4 6.4) scale(0.5)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" fill="currentColor" strokeWidth="1" /></g>
                </svg>
                {chatBadge > 0 ? <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-5 text-white ring-2 ring-white">{chatBadge > 99 ? "99+" : chatBadge}</span> : null}
              </Link>
              {me.role === "Admin" ? <CommentHost unread={tagBadge} /> : null}
              <button className="grid size-10 place-items-center rounded-xl border border-line bg-white text-muted" onClick={() => window.location.reload()} aria-label="Muat ulang">
                <RefreshCw className="size-4" />
              </button>
              <div className="hidden items-center gap-2 text-right sm:flex">
                <div>
                  <p className="text-xs font-semibold text-ink">{me.name}</p>
                  <p className="text-[11px] text-muted">{me.role}</p>
                </div>
                {me.photo ? (
                  <img src={me.photo} alt="" className="size-9 rounded-full object-cover ring-1 ring-line" />
                ) : (
                  <span className="grid size-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-accent">{me.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <button
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-danger"
                onClick={() => {
                  if (!confirm("Yakin keluar dari aplikasi?")) return;
                  void disablePush().catch(() => undefined).then(() => logout()).then(() => {
                    clearPersistedState();
                    window.location.href = "/";
                  });
                }}
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          </div>
        </header>
        <main className="px-3 py-4 md:px-6 md:py-5">
          {me.role === "Admin" && ["/barang", "/stok", "/riwayat", "/bon", "/mitra", "/pemasok", "/retur", "/kas"].includes(path) ? (
            <p className="no-print mb-3 text-[11px] text-slate-500">💬 Mau memberi catatan atau men-tag Admin lain? Klik kanan baris (di HP: tekan lama baris), lalu pilih Komentar.</p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function Panel({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-2xl border border-white/80 bg-panel p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)] ${className}`}>{children}</section>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100";

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-40 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
