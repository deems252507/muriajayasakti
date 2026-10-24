import { useNavigate, useRouteContext, useRouterState } from "@tanstack/react-router";
import { Inbox, MessageSquare, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ItemComments } from "@/components/shop/item-comments";
import { dateTime } from "@/components/shop/chat-time";
import { itemCommentSummary, itemCommentTagged } from "@/lib/shop/api";

export type CommentTarget = { kind: string; ref: string; label: string };
export type CommentMark = { count: number; tagged: number };

/** Buka jendela komentar dari mana saja (halaman, kartu pemberitahuan, notifikasi HP). */
export function openComment(target: CommentTarget) {
  window.dispatchEvent(new CustomEvent("mjs-open-comment", { detail: target }));
}

/**
 * Dipasang di halaman daftar yang punya pencarian/filter/halaman. Saat Admin diarahkan ke sebuah baris yang tidak tampil
 * (tersaring atau di halaman lain), halaman diminta mengosongkan filter dan mencari baris itu lewat apply(target).
 */
export function useCommentFinder(kind: string, apply: (target: CommentTarget) => void) {
  const ref = useRef(apply);
  ref.current = apply;
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as CommentTarget | undefined;
      if (d?.kind === kind) ref.current(d);
    };
    window.addEventListener("mjs-find-comment", h);
    return () => window.removeEventListener("mjs-find-comment", h);
  }, [kind]);
}

/** Halaman tempat tiap jenis komentar berada (untuk mengarahkan Admin yang di-tag ke lokasinya). */
export const COMMENT_ROUTE: Record<string, { to: string; name: string }> = {
  barang: { to: "/barang", name: "Daftar Sparepart" },
  nota: { to: "/riwayat", name: "Riwayat Transaksi" },
  mitra: { to: "/mitra", name: "Pelanggan / Supplier" },
  masuk: { to: "/pemasok", name: "Barang Masuk Pemasok" },
  retur: { to: "/retur", name: "Retur & Tukar" },
  shift: { to: "/kas", name: "Kas Kasir" },
};

/** Pergi ke halaman barisnya, gulir + sorot barisnya, lalu buka komentarnya (dipakai notifikasi, kotak komentar, klik notifikasi HP). */
export function goToComment(target: CommentTarget) {
  window.dispatchEvent(new CustomEvent("mjs-goto-comment", { detail: target }));
}

/** Jendela yang dipasang di <body>: header Shell memakai backdrop-blur sehingga elemen "fixed" di dalamnya ikut terkurung di header. */
function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/** Baris yang benar-benar terlihat dengan penanda data-cmt (elemen display:none tidak bisa digulir). */
function findRow(target: CommentTarget) {
  const key = `${target.kind}:${target.ref}`;
  return Array.from(document.querySelectorAll<HTMLElement>("[data-cmt]")).find((n) => n.dataset.cmt === key && n.getClientRects().length > 0) ?? null;
}

/**
 * Gulir ke baris (tanpa animasi halus yang gampang terbatal) dan kedipkan. Digulir ulang beberapa kali karena tabel sering
 * bergeser tingginya saat data/tanda komentar selesai dimuat. Mengembalikan true bila barisnya ketemu.
 */
function flashRow(target: CommentTarget) {
  const el = findRow(target);
  if (!el) return false;
  const center = () => {
    const cur = findRow(target);
    if (cur) cur.scrollIntoView({ behavior: "auto", block: "center" });
  };
  center();
  el.classList.remove("mjs-cmt-flash");
  void el.offsetWidth; // mulai ulang animasi
  el.classList.add("mjs-cmt-flash");
  for (const ms of [200, 600, 1300]) window.setTimeout(center, ms);
  window.setTimeout(() => findRow(target)?.classList.remove("mjs-cmt-flash"), 4600);
  return true;
}

/** Tanda komentar untuk daftar baris: { ref: { count, tagged } }. Segar otomatis. */
export function useCommentMarks(kind: string, refs: Array<string | number>) {
  const [marks, setMarks] = useState<Record<string, CommentMark>>({});
  const key = refs.join("|");
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!refs.length) { setMarks({}); return; }
      void itemCommentSummary({ data: { kind, refs: refs.map(String) } })
        .then((rows) => { if (alive) setMarks(Object.fromEntries(rows.map((r) => [r.ref, { count: r.count, tagged: r.tagged }]))); })
        .catch(() => undefined);
    };
    run();
    const timer = window.setInterval(() => { if (!document.hidden) run(); }, 20000);
    window.addEventListener("mjs-comment-changed", run);
    window.addEventListener("focus", run);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("mjs-comment-changed", run); window.removeEventListener("focus", run); };
  }, [kind, key]);
  return marks;
}

/**
 * Ikon komentar di baris yang SUDAH punya komentar (baris kosong tidak ada tombol; komentar baru ditulis lewat klik kanan / tekan lama).
 * Kuning = ada komentar. Ungu berkedip = ada komentar yang men-tag Anda dan belum dibuka.
 */
export function CommentButton({ kind, refId, label, mark, size = "h-8 w-8" }: { kind: string; refId: string | number; label: string; mark?: CommentMark; size?: string }) {
  const count = mark?.count ?? 0;
  const tagged = mark?.tagged ?? 0;
  if (count === 0) return null;
  return (
    <button
      type="button"
      title={tagged ? "Anda di-tag di komentar ini" : `${count} komentar`}
      aria-label="Komentar"
      className={`relative inline-grid ${size} shrink-0 place-items-center rounded-lg border ${tagged ? "mjs-attn border-violet-500 bg-violet-600 text-white hover:bg-violet-700" : "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"}`}
      onClick={(e) => { e.stopPropagation(); openComment({ kind, ref: String(refId), label }); }}
    >
      <MessageSquare className="h-4 w-4" />
      <span className={`absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold leading-4 text-white ${tagged ? "bg-red-500" : "bg-amber-600"}`}>{count}</span>
    </button>
  );
}

/* ---------- klik kanan (komputer) / tekan lama (HP) pada baris ---------- */

const INTERACTIVE = "button, a, input, select, textarea, label, summary, [role=button]";
const LONG_PRESS_MS = 550;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressX = 0;
let pressY = 0;
let lastLongPress = 0; // dipakai untuk membatalkan "klik" yang ikut muncul setelah tekan lama

function clearPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}

function openMenu(x: number, y: number, target: CommentTarget, count: number) {
  window.dispatchEvent(new CustomEvent("mjs-comment-menu", { detail: { x, y, target, count } }));
}

/**
 * Tanda komentar + penangan klik kanan/tekan lama untuk daftar baris.
 *  - marks: { nomor: { count, tagged } } untuk CommentButton
 *  - row(ref, label): sebarkan ke <tr>/<li> ({...comments.row(ref, label)}); baris yang punya komentar diberi garis warna di tepi kiri
 * Hanya Admin yang mendapat klik kanan/tekan lama. Shift + klik kanan tetap membuka menu bawaan browser.
 */
export function useComments(kind: string, refs: Array<string | number>) {
  const marks = useCommentMarks(kind, refs);
  const role = useRouteContext({ from: "/_shop", select: (c) => (c as unknown as { me: { role: string } }).me.role });
  const isAdmin = role === "Admin";
  function row(ref: string | number, label: string): HTMLAttributes<HTMLElement> {
    const key = String(ref);
    const m = marks[key];
    const style: CSSProperties = {};
    if (m?.tagged) style.boxShadow = "inset 4px 0 0 #7c3aed";
    else if (m?.count) style.boxShadow = "inset 4px 0 0 #f59e0b";
    const attrs = { "data-cmt": `${kind}:${key}` } as HTMLAttributes<HTMLElement>;
    if (!isAdmin) return { ...attrs, style };
    const target: CommentTarget = { kind, ref: key, label };
    const count = m?.count ?? 0;
    style.WebkitTouchCallout = "none";
    return {
      ...attrs,
      style,
      onContextMenu: (e) => {
        if (e.shiftKey || (e.target as HTMLElement).closest(INTERACTIVE)) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY, target, count);
      },
      onTouchStart: (e) => {
        clearPress();
        if (e.touches.length !== 1 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
        const t = e.touches[0];
        pressX = t.clientX;
        pressY = t.clientY;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          lastLongPress = Date.now();
          try { navigator.vibrate?.(30); } catch { /* abaikan */ }
          openMenu(pressX, pressY, target, count);
        }, LONG_PRESS_MS);
      },
      onTouchMove: (e) => {
        const t = e.touches[0];
        if (t && Math.hypot(t.clientX - pressX, t.clientY - pressY) > 10) clearPress();
      },
      onTouchEnd: clearPress,
      onTouchCancel: clearPress,
      onClickCapture: (e) => {
        if (Date.now() - lastLongPress < 800) { e.preventDefault(); e.stopPropagation(); }
      },
    };
  }
  return { marks, row };
}

/** Menu kecil "Komentar" yang muncul di titik klik kanan / tekan lama. */
function CommentMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; target: CommentTarget; count: number; at: number } | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  useEffect(() => {
    const onMenu = (e: Event) => {
      const d = (e as CustomEvent).detail as { x: number; y: number; target: CommentTarget; count: number };
      setMenu({ ...d, at: Date.now() });
    };
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("mjs-comment-menu", onMenu);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mjs-comment-menu", onMenu);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  if (!menu) return null;
  // Klik yang ikut muncul tepat setelah tekan lama jangan langsung menutup atau memilih menu.
  const tooSoon = () => Date.now() - (menuRef.current?.at ?? 0) < 500;
  const width = 232;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(menu.y + 14, window.innerHeight - 110));
  return (
    <Portal><div className="fixed inset-0 z-[60]" onClick={() => { if (!tooSoon()) setMenu(null); }} onContextMenu={(e) => { e.preventDefault(); if (!tooSoon()) setMenu(null); }}>
      <div className="absolute overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" style={{ left, top, width }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        <p className="truncate border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500">{menu.target.label || "Komentar"}</p>
        <button
          type="button"
          className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-slate-800 hover:bg-violet-50"
          onClick={() => { if (tooSoon()) return; const t = menu.target; setMenu(null); openComment(t); }}
        >
          <MessageSquare className="h-4 w-4 text-violet-700" />
          {menu.count > 0 ? `Lihat / tulis komentar (${menu.count})` : "Tulis komentar"}
        </button>
      </div>
    </div></Portal>
  );
}

/** Dipasang sekali di Shell: jendela komentar + Kotak Komentar (daftar semua tag untuk saya). */
export function CommentHost({ unread }: { unread: number }) {
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [inbox, setInbox] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const runId = useRef(0);

  useEffect(() => {
    // Pindah ke halaman yang benar, sorot barisnya, baru buka komentarnya.
    const go = (d: CommentTarget, openAfter: boolean) => {
      const dest = COMMENT_ROUTE[d.kind];
      const id = ++runId.current;
      setInbox(false);
      setTarget(null);
      if (dest && pathRef.current !== dest.to) void navigate({ to: dest.to });
      const started = Date.now();
      let findSent = false;
      toast.loading("Mencari barisnya...", { id: "cmt-find" });
      // Baris tidak tampil (tersaring / halaman lain): minta halamannya mencari baris itu, dengan filter dikosongkan.
      const sendFind = async () => {
        let t = d;
        if (!t.label) {
          try {
            const inbox = await itemCommentTagged();
            const hit = inbox.find((r) => r.kind === d.kind && r.ref === d.ref);
            if (hit) t = { ...d, label: hit.label };
          } catch { /* abaikan */ }
        }
        if (id === runId.current) window.dispatchEvent(new CustomEvent("mjs-find-comment", { detail: t }));
      };
      const tryFind = () => {
        if (id !== runId.current) return; // ada perintah yang lebih baru (toast-nya dipakai perintah baru)
        const onPage = !dest || pathRef.current === dest.to;
        if (onPage && flashRow(d)) {
          toast.dismiss("cmt-find");
          if (openAfter) window.setTimeout(() => { if (id === runId.current) setTarget(d); }, 700);
          return;
        }
        const elapsed = Date.now() - started;
        if (onPage && !findSent && elapsed > 1200) { findSent = true; void sendFind(); }
        if (elapsed > 9000) {
          toast.dismiss("cmt-find");
          if (openAfter) setTarget(d);
          if (dest) toast.info(`Barisnya tidak ketemu di ${dest.name} (mungkin sudah dihapus). Komentarnya tetap dibuka.`);
          return;
        }
        window.setTimeout(tryFind, 200);
      };
      window.setTimeout(tryFind, 120);
    };
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as CommentTarget | undefined;
      if (d?.kind && d.ref) { runId.current++; setInbox(false); setTarget(d); }
    };
    const onGoto = (e: Event) => {
      const d = (e as CustomEvent).detail as CommentTarget | undefined;
      if (d?.kind && d.ref) go(d, true);
    };
    const onLocate = (e: Event) => {
      const d = (e as CustomEvent).detail as CommentTarget | undefined;
      if (d?.kind && d.ref) go(d, false);
    };
    window.addEventListener("mjs-open-comment", onOpen);
    window.addEventListener("mjs-goto-comment", onGoto);
    window.addEventListener("mjs-locate-comment", onLocate);
    // Dibuka dari klik notifikasi HP saat aplikasi belum terbuka: #komentar=jenis:nomor
    const m = /^#komentar=([a-z]+):(.+)$/.exec(decodeURIComponent(window.location.hash));
    if (m) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      go({ kind: m[1], ref: m[2], label: "" }, true);
    }
    return () => {
      window.removeEventListener("mjs-open-comment", onOpen);
      window.removeEventListener("mjs-goto-comment", onGoto);
      window.removeEventListener("mjs-locate-comment", onLocate);
    };
  }, []);

  const dest = target ? COMMENT_ROUTE[target.kind] : undefined;
  return (
    <>
      <button
        type="button"
        title="Kotak komentar (komentar yang men-tag Anda)"
        aria-label="Kotak komentar"
        className={`relative grid size-10 place-items-center rounded-xl border ${unread > 0 ? "mjs-attn border-violet-500 bg-violet-600 text-white" : "border-line bg-white text-muted"}`}
        onClick={() => setInbox(true)}
      >
        <Inbox className="size-4" />
        {unread > 0 ? <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      <CommentMenu />
      {inbox ? <InboxModal onClose={() => setInbox(false)} /> : null}
      {target ? (
        <Portal>
          <ItemComments
            kind={target.kind}
            refId={target.ref}
            label={target.label}
            locate={dest ? { name: dest.name, go: () => { const t = target; setTarget(null); window.dispatchEvent(new CustomEvent("mjs-locate-comment", { detail: t })); } } : undefined}
            onClose={() => { setTarget(null); window.dispatchEvent(new CustomEvent("mjs-comment-changed")); }}
            onChanged={() => window.dispatchEvent(new CustomEvent("mjs-comment-changed"))}
          />
        </Portal>
      ) : null}
    </>
  );
}

function InboxModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof itemCommentTagged>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void itemCommentTagged().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  return (
    <Portal><div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-panel sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Kotak komentar</p>
            <p className="text-sm font-extrabold text-slate-900">Komentar yang men-tag Anda</p>
          </div>
          <button type="button" aria-label="Tutup" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {rows && rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Belum ada komentar yang men-tag Anda.</p> : null}
          {rows?.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`block w-full rounded-xl border p-3 text-left hover:bg-violet-50 ${r.unseen ? "border-violet-400 bg-violet-50 ring-2 ring-violet-300" : "border-slate-200 bg-white"}`}
              onClick={() => goToComment({ kind: r.kind, ref: r.ref, label: r.label })}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{r.kindName}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-900">{r.label}</span>
                {r.unseen ? <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Baru</span> : null}
              </div>
              <p className="mt-1 line-clamp-2 break-words text-xs text-slate-700"><b>{r.fromName}</b>: {r.body}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{dateTime(r.createdAt)}</p>
            </button>
          ))}
        </div>
      </div>
    </div></Portal>
  );
}
