import { clearPersistedState } from "@/lib/persist";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { iconAnim } from "@/components/shop/nav-icon";
import { WhatsappLineIcon } from "@/components/shop/whatsapp-icon";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  ClipboardList,
  Coins,
  History,
  LayoutDashboard,
  Menu,
  Package,
  PackageCheck,
  PackagePlus,
  Percent,
  Receipt,
  RefreshCw,
  ScrollText,
  Settings,
  ShoppingCart,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { installStockAlerts } from "@/lib/shop/alerts";
import { alokasiInbox, chatUnread, itemCommentInbox, logout, listMasters } from "@/lib/shop/api";
import { disablePush, showLocalNotification, syncPush } from "@/lib/shop/push";
import { setPrintUser, setShopProfile } from "@/lib/shop/print";
import { CommentHost, goToComment } from "@/components/shop/comment-ui";
import { PresenceButton } from "@/components/shop/presence";
import { ProfileMenu } from "@/components/shop/profile-menu";
import { LogoutDialog } from "@/components/shop/logout-dialog";
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
    // Faktur Pembelian + Retur Pembelian satu menu (tab di dalam halaman), seperti grup Pembelian di Accurate.
    label: "Pembelian",
    items: [{ to: "/pemasok", label: "Pembelian (Faktur & Retur)", icon: PackagePlus }],
  },
  {
    label: "Persediaan",
    items: [
      { to: "/barang", label: "Daftar Sparepart", icon: Package },
      { to: "/gudang", label: "Stok Gudang", icon: Warehouse },
      { to: "/opname", label: "Stok Opname", icon: ClipboardCheck },
    ],
  },
  {
    label: "Transaksi",
    items: [
      { to: "/manual", label: "Transaksi Manual", icon: ArrowLeftRight },
      { to: "/riwayat", label: "Riwayat Transaksi", icon: History },
    ],
  },
  {
    label: "Keuangan & Laporan",
    items: [
      { to: "/laporan-penjualan", label: "Laporan Barang Terjual", icon: TrendingUp },
      { to: "/laporan-kas", label: "Laporan Kas Harian", icon: CalendarDays },
      { to: "/bon", label: "Bon / Piutang", icon: Receipt },
      { to: "/stok", label: "Laporan Stok", icon: ClipboardList },
      { to: "/laporan-gudang", label: "Nilai Stok Toko & Gudang", icon: Coins },
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
      { to: "/chat", label: "Chat Staff", icon: WhatsappLineIcon },
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
      { to: "/laporan-penjualan", label: "Laporan Barang Terjual", icon: TrendingUp },
      { to: "/laporan-kas", label: "Laporan Kas Harian", icon: CalendarDays },
      { to: "/bon", label: "Bon / Piutang", icon: Receipt },
      { to: "/stok", label: "Laporan Stok", icon: ClipboardList },
      { to: "/laporan-gudang", label: "Nilai Stok Toko & Gudang", icon: Coins },
      { to: "/pajak", label: "Data Pajak Internal", icon: Percent },
    ],
  },
  { label: "Komunikasi", items: [{ to: "/chat", label: "Chat Staff", icon: WhatsappLineIcon }] },
  {
    label: "Data (lihat saja)",
    items: [
      { to: "/barang", label: "Daftar Sparepart", icon: Package },
      { to: "/gudang", label: "Stok Gudang", icon: Warehouse },
      { to: "/opname", label: "Stok Opname", icon: ClipboardCheck },
      { to: "/mitra", label: "Pelanggan & Supplier", icon: Users },
      { to: "/jejak", label: "Riwayat Aktivitas", icon: ScrollText },
    ],
  },
  { label: "Akun", items: [{ to: "/pengaturan", label: "Pengaturan", icon: Settings }] },
] as const;

// Staf = karyawan pengecek barang: hanya melihat Daftar Sparepart, Stok Gudang (lihat saja kecuali diberi izin), dan chat.
const STAF = [
  {
    label: "Barang",
    items: [
      { to: "/barang", label: "Daftar Sparepart", icon: Package },
      { to: "/gudang", label: "Stok Gudang", icon: Warehouse },
    ],
  },
  { label: "Komunikasi", items: [{ to: "/chat", label: "Chat Staff", icon: WhatsappLineIcon }] },
  { label: "Akun", items: [{ to: "/pengaturan", label: "Pengaturan", icon: Settings }] },
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
  { label: "Gudang", items: [{ to: "/gudang", label: "Stok Gudang", icon: Warehouse }] },
  { label: "Komunikasi", items: [{ to: "/chat", label: "Chat Staff", icon: WhatsappLineIcon }] },
] as const;

/** Halaman yang tampil sebagai tab di dalam menu lain (menu samping tetap menyala di induknya). */
const PATH_ALIAS: Record<string, string> = { "/retur-pemasok": "/pemasok" };

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

/** Tooltip nama menu untuk sidebar mini. Memakai portal supaya tidak terpotong oleh container sidebar. */
function NavTip({ label, enabled, children }: { label: string; enabled: boolean; children: React.ReactNode }) {
  return (
    <Tooltip.Root delayDuration={80}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      {enabled ? (
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={14}
            className="z-[200] rounded-lg border border-blue-400/30 bg-[#0b1220] px-3 py-1.5 text-xs font-semibold text-white shadow-xl shadow-black/40"
          >
            {label}
            <Tooltip.Arrow className="fill-[#0b1220]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      ) : null}
    </Tooltip.Root>
  );
}

export function Shell({ me, children }: { me: Staff; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => { installStockAlerts(); }, []);
  useEffect(() => { setPrintUser(me); }, [me]);
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
  const [alokBadge, setAlokBadge] = useState(0);
  // Grup menu yang dilipat/dibuka sendiri oleh pengguna (diingat di perangkat ini). Grup yang berisi halaman aktif selalu terbuka.
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setFolded(JSON.parse(localStorage.getItem("mjs-nav-folded") || "{}") as Record<string, boolean>); } catch { /* abaikan */ }
  }, []);
  const toggleGroup = (label: string) => setFolded((prev) => {
    const next = { ...prev, [label]: !prev[label] };
    try { localStorage.setItem("mjs-nav-folded", JSON.stringify(next)); } catch { /* abaikan */ }
    return next;
  });
  // Sidebar mini (desktop saja). Pilihan disimpan di perangkat ini. Tanpa pilihan: tablet (<1024px) mulai mini.
  const [miniPref, setMiniPref] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [animReady, setAnimReady] = useState(false); // animasi baru aktif setelah dimuat, supaya tidak "meluncur" saat halaman dibuka
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("mjs-sidebar-mini"); } catch { /* abaikan */ }
    setMiniPref(stored === null ? window.innerWidth < 1024 : stored === "1");
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const timer = window.setTimeout(() => setAnimReady(true), 200);
    return () => { mq.removeEventListener("change", sync); window.clearTimeout(timer); };
  }, []);
  const mini = miniPref && isDesktop; // di HP sidebar selalu penuh (off-canvas)
  const toggleMini = () => setMiniPref((prev) => {
    const next = !prev;
    try { localStorage.setItem("mjs-sidebar-mini", next ? "1" : "0"); } catch { /* abaikan */ }
    return next;
  });
  // HP: Esc menutup menu, dan halaman di belakang tidak ikut ter-scroll saat menu terbuka.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [open]);
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const [askLogout, setAskLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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
    // Alokasi Faktur: lencana menu + kartu saat ada faktur baru, alokasi menunggu cek Admin, atau alokasi dikembalikan.
    const goAlokasi = (id: number) => { void navRef.current({ to: "/alokasi", search: { faktur: id } }); };
    let alokSeen = -1;
    const tickAlok = () => {
      void alokasiInbox().then((res) => {
        if (!alive) return;
        setAlokBadge(res.pending);
        const latest = res.latest;
        if (!latest) { if (alokSeen < 0) alokSeen = 0; return; }
        if (alokSeen < 0) { alokSeen = latest.ts; return; }
        if (latest.ts <= alokSeen) return;
        alokSeen = latest.ts;
        beep();
        const baseTitle = latest.status === "menunggu_cek" ? "Alokasi menunggu pengecekan" : latest.status === "dikembalikan" ? "Alokasi dikembalikan Admin" : "Faktur baru perlu alokasi";
        const title = latest.pengingat ? `Pengingat: ${baseTitle.toLowerCase()}` : baseTitle;
        const detail = latest.status === "menunggu_cek"
          ? `${latest.invoiceNo} dialokasikan oleh ${latest.fromName || "staf"}`
          : latest.status === "dikembalikan"
            ? `${latest.invoiceNo}${latest.catatan ? `: ${latest.catatan}` : ""}`
            : `${latest.invoiceNo} dari ${latest.supplierName}`;
        if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          void showLocalNotification(title, detail, `r:${latest.id}`);
        } else {
          toast.custom((id) => (
            <div role="status" className="flex w-[min(92vw,360px)] items-start gap-3 rounded-2xl border border-emerald-300 bg-white p-3 shadow-xl ring-1 ring-emerald-100">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><PackageCheck className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-slate-900">{title}</p>
                <p className="mt-0.5 line-clamp-2 break-words text-xs text-slate-600">{detail}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white" onClick={() => { toast.dismiss(id); goAlokasi(latest.id); }}>Buka faktur</button>
                  <button type="button" className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600" onClick={() => toast.dismiss(id)}>Tutup</button>
                </div>
              </div>
            </div>
          ), { id: "alokasi-toast", duration: 12000 });
        }
      }).catch(() => undefined);
    };
    tick();
    tickTag();
    tickAlok();
    // 6 detik saat tab terlihat (notifikasi tetap cepat), 30 detik saat tab tersembunyi (hemat; Web Push tetap jalan).
    let skip = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) { skip = (skip + 1) % 5; if (skip) return; } else skip = 0;
      tick();
      tickTag();
      tickAlok();
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
      if (target.startsWith("r:")) {
        // Alokasi faktur: buka faktur yang dimaksud (r:ID).
        const rid = Number(target.slice(2));
        if (Number.isInteger(rid) && rid > 0) goAlokasi(rid);
        return;
      }
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
    window.addEventListener("focus", tickAlok);
    window.addEventListener("mjs-alokasi-changed", tickAlok);
    window.addEventListener("click", askPermission, { once: true });
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("mjs-chat", onChat);
      window.removeEventListener("focus", tick);
      window.removeEventListener("focus", tickTag);
      window.removeEventListener("focus", tickAlok);
      window.removeEventListener("mjs-alokasi-changed", tickAlok);
      window.removeEventListener("mjs-comment-changed", onTagChange);
      window.removeEventListener("click", askPermission);
      if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
      document.title = baseTitle;
    };
  }, []);
  const roleGroups = me.role === "Staf" ? STAF : me.role === "Kasir" ? KASIR : me.role === "Owner" ? OWNER : ADMIN;
  // Alokasi Faktur muncul tepat di bawah Stok Gudang untuk Admin dan staf/kasir yang diberi izin Stok Gudang.
  const alokasiItem = { to: "/alokasi", label: "Alokasi Faktur", icon: PackageCheck } as const;
  const baseGroups = (me.canGudang && me.role !== "Owner"
    ? roleGroups.map((group) => ({ ...group, items: (group.items as readonly { to: string; label: string; icon: unknown }[]).flatMap((item) => (item.to === "/gudang" ? [item, alokasiItem] : [item])) }))
    : roleGroups) as unknown as typeof roleGroups;
  // Pengaturan hanya terlihat oleh Admin 1 (Admin yang dicentang kelola akun).
  // Staf, Admin lain, dan Owner juga melihat Pengaturan, tetapi isinya hanya Nama dan Foto Akun. Kasir tidak.
  const groups = (me.canManageStaff || me.role !== "Kasir" ? baseGroups : baseGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.to !== "/pengaturan") }))) as unknown as typeof baseGroups;
  const navPath = PATH_ALIAS[path] ?? path;
  const current = path === "/retur-pemasok" ? "Pembelian · Retur" : path === "/pemasok" ? "Pembelian · Faktur" : groups.flatMap((group) => [...group.items]).find((item) => navPath === item.to)?.label ?? brand;
  const printable = ["/laporan-kas", "/stok", "/pajak", "/riwayat", "/bon", "/kas", "/laporan-gudang"].includes(path);
  useEffect(() => {
    function apply(profile: { nama?: string; alamat?: string; telepon?: string; tagline?: string; logo?: string; icon?: string }) {
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
    <div className="app-shell min-h-screen bg-paper text-ink md:flex">
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 w-[280px] max-w-[85vw] bg-gradient-to-b from-[#121a2b] to-[#0b1220] text-white shadow-2xl md:sticky md:top-0 md:h-dvh md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none ${mini ? "md:w-[72px]" : "md:w-[270px]"} ${open ? "translate-x-0" : "-translate-x-full"} ${animReady ? "transition-[width,transform] duration-300 ease-in-out" : ""}`}
      >
        {/* Tombol kecilkan / perbesar (desktop), menempel di tepi sidebar */}
        <button
          type="button"
          onClick={toggleMini}
          aria-label={mini ? "Perbesar menu samping" : "Kecilkan menu samping"}
          aria-expanded={!mini}
          title={mini ? "Perbesar menu" : "Kecilkan menu"}
          className="absolute top-7 -right-3.5 z-50 hidden size-7 place-items-center rounded-full border border-white/20 bg-[#16203a] text-white/80 shadow-lg transition-colors hover:bg-blue-600 hover:text-white focus-visible:ring-2 focus-visible:ring-blue-400 md:grid"
        >
          {mini ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex h-[84px] shrink-0 items-center gap-3 border-b border-white/10 px-[14px]">
            <img src={logo} alt="" className="size-11 shrink-0 rounded-2xl bg-white/10 object-contain p-1.5 ring-1 ring-white/15" />
            <div className={`min-w-0 flex-1 transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100 delay-100"}`} aria-hidden={mini}>
              <p className="truncate text-sm font-bold tracking-wide">{brand}</p>
              <p className="truncate text-[11px] text-white/45">Sistem Manajemen Stok</p>
            </div>
            <button className="ml-auto rounded-lg p-2 hover:bg-white/10 md:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
              <X className="size-5" />
            </button>
          </div>
          <Tooltip.Provider delayDuration={80} skipDelayDuration={300}>
            <nav
              className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 ${mini ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""}`}
              aria-label="Menu utama"
            >
              {groups.map((group) => {
                const single = group.items.length === 1;
                const hasActive = group.items.some((item) => navPath === item.to);
                // Lipatan grup hanya berlaku di sidebar penuh. Di mode mini semua ikon tampil, status lipatan tidak diubah.
                const collapsed = !single && !hasActive && Boolean(folded[group.label]);
                const showItems = mini || !collapsed;
                const groupBadge = group.items.reduce((sum, item) => sum + ((item.to as string) === "/chat" ? chatBadge : (item.to as string) === "/alokasi" ? alokBadge : 0), 0);
                return (
                  <div key={group.label} className="mt-1">
                    <div className={`relative overflow-hidden ${animReady ? "transition-[height] duration-300 ease-in-out" : ""} ${mini ? "h-3" : "h-9"}`}>
                      <div className={`absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-white/10 transition-opacity duration-300 ${mini ? "opacity-100" : "opacity-0"}`} aria-hidden />
                      <div className={`transition-opacity duration-200 ${mini ? "pointer-events-none opacity-0" : "opacity-100 delay-100"}`} aria-hidden={mini}>
                        {single ? (
                          <p className="flex h-9 items-center px-3 text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap text-white/35 uppercase">{group.label}</p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.label)}
                            aria-expanded={!collapsed}
                            disabled={mini}
                            tabIndex={mini ? -1 : 0}
                            className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap text-white/45 uppercase transition-colors hover:bg-white/10 hover:text-white/80"
                          >
                            <span className="flex-1">{group.label}</span>
                            {collapsed && groupBadge > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold tracking-normal text-white">{groupBadge > 99 ? "99+" : groupBadge}</span> : null}
                            <ChevronDown className={`size-3.5 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                          </button>
                        )}
                      </div>
                    </div>
                    {showItems ? (
                      <div className="flex flex-col gap-0.5">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const active = navPath === item.to;
                          const badge = (item.to as string) === "/chat" ? chatBadge : (item.to as string) === "/alokasi" ? alokBadge : 0;
                          const badgeText = badge > 99 ? "99+" : String(badge);
                          const tip = badge > 0 ? `${item.label} (${badgeText})` : item.label;
                          return (
                            <NavTip key={item.to} label={tip} enabled={mini}>
                              <Link
                                to={item.to}
                                onClick={() => setOpen(false)}
                                aria-current={active ? "page" : undefined}
                                aria-label={mini ? tip : undefined}
                                className={`group relative flex h-10 items-center gap-3 rounded-xl pr-3 pl-[15px] text-sm transition-colors ${active ? "bg-gradient-to-r from-blue-600 to-indigo-600/80 font-semibold text-white shadow-[0_0_18px_rgba(59,130,246,0.35)]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                              >
                                {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-sky-300" aria-hidden /> : null}
                                <span className="relative grid size-[var(--mjs-ico-nav)] shrink-0 place-items-center">
                                  <Icon className={`size-[var(--mjs-ico-nav)] ${iconAnim(Icon)}`} />
                                  {mini && badge > 0 ? <span className="absolute -top-1.5 -right-2 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] leading-4 font-bold text-white ring-2 ring-[#101829]">{badgeText}</span> : null}
                                </span>
                                <span className={`min-w-0 flex-1 truncate transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100 delay-100"}`}>{item.label}</span>
                                {!mini && badge > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white" aria-label={`${badge} perlu perhatian`}>{badgeText}</span> : null}
                              </Link>
                            </NavTip>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </Tooltip.Provider>
          <div className="mt-auto shrink-0 overflow-hidden border-t border-white/10 px-4 py-3">
            <p className={`text-[11px] leading-5 whitespace-nowrap text-white/70 transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100 delay-100"}`} aria-hidden={mini}>Developed by Rizky Dwi Maulana</p>
          </div>
        </div>
      </aside>
      {/* Overlay gelap (HP): klik untuk menutup menu */}
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        aria-label="Tutup menu"
        className={`no-print fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div className="min-w-0 md:flex-1">
        <header ref={headerRef} className="no-print sticky top-0 z-20 border-b border-white/60 bg-white/80 px-3 py-3 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3">
            <button className="grid size-11 place-items-center rounded-xl border border-line bg-white md:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="size-[var(--mjs-ico-hdr)]" />
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
              <PresenceButton meUsername={me.username} meRole={me.role} />
              <Link
                to="/chat"
                key={`chat-${chatBadge > 0 ? "n" : "0"}`}
                title="Chat Staff"
                aria-label={chatBadge > 0 ? `Chat Staff, ${chatBadge} pesan belum dibaca` : "Chat Staff"}
                className={`group relative grid size-10 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 ${chatBadge > 0 ? "mjs-attn-green" : ""} ${path === "/chat" ? "ring-2 ring-emerald-500 ring-offset-2" : ""}`}
              >
                <WhatsappLineIcon className={`size-[calc(var(--mjs-ico-hdr)+4px)] ${iconAnim(WhatsappLineIcon)}`} />
                {chatBadge > 0 ? <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-5 text-white ring-2 ring-white">{chatBadge > 99 ? "99+" : chatBadge}</span> : null}
              </Link>
              {me.role === "Admin" ? <CommentHost unread={tagBadge} /> : null}
              <button className="group grid size-10 place-items-center rounded-xl border border-line bg-white text-muted" onClick={() => window.location.reload()} aria-label="Muat ulang">
                <RefreshCw className={`size-[var(--mjs-ico-hdr)] ${iconAnim(RefreshCw)}`} />
              </button>
              <ProfileMenu
                me={me}
                canProfile={groups.some((group) => group.items.some((item) => item.to === "/pengaturan"))}
                canSettings={Boolean(me.canManageStaff)}
                onLogout={() => setAskLogout(true)}
              />
            </div>
          </div>
        </header>
        {askLogout ? (
          <LogoutDialog
            name={me.name}
            role={me.role}
            busy={loggingOut}
            onCancel={() => setAskLogout(false)}
            onConfirm={() => {
              setLoggingOut(true);
              void disablePush()
                .catch(() => undefined)
                .then(() => logout())
                .then(() => {
                  clearPersistedState();
                  try { sessionStorage.setItem("mjs-logout-notice", "Anda telah keluar"); } catch { /* abaikan */ }
                  window.location.href = "/";
                })
                .catch(() => {
                  setLoggingOut(false);
                  toast.error("Gagal keluar. Coba lagi.");
                });
            }}
          />
        ) : null}
        <main className="px-3 py-4 md:px-6 md:py-5">
          {me.role === "Admin" && ["/barang", "/stok", "/riwayat", "/bon", "/mitra", "/pemasok", "/retur-pemasok", "/retur", "/kas"].includes(path) ? (
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
