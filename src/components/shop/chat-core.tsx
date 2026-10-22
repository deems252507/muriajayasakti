import {
  Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Copy, CornerUpLeft, Download, FileText, Image as ImageIcon, Info, MoreVertical, Package, Paperclip, Pencil, Pin, PinOff, Plus, Palette, Receipt, Search, Send, Smile, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { toast } from "sonner";
import {
  chatClear, chatDeleteMessages, chatEdit, chatFileGet, chatHideAll, chatHideMessages, chatPin, chatPost, chatReact, chatSearch, chatShareFind, chatThread, groupClearMessages, groupDeleteMessages,
} from "@/lib/shop/api";
import { EmojiPicker } from "./emoji-picker";
import { dayKey, dayLabel, hhmm } from "./chat-time";

type ChatKind = "dm" | "group";
type Thread = Awaited<ReturnType<typeof chatThread>>;
export type Msg = Thread["messages"][number];
export type Person = { username: string; name: string };
export type Attach = { name: string; mime: string; data: string; image: boolean };
type ShareDraft = { type: "barang" | "transaksi"; ref: string; title: string; sub: string };
type Win = { limit: number; since: number };

const BG_KEY = "mjs-chat-bg";
const BG_PRESETS = [
  { key: "default", label: "Bawaan", value: "" },
  { key: "wa", label: "Krem", value: "#efeae2" },
  { key: "mint", label: "Hijau", value: "#d9fdd3" },
  { key: "sky", label: "Biru", value: "#dbeafe" },
  { key: "rose", label: "Merah muda", value: "#fce7f3" },
  { key: "sand", label: "Pasir", value: "#fef3c7" },
  { key: "night", label: "Gelap", value: "#1e293b" },
  { key: "grad", label: "Gradasi", value: "linear-gradient(160deg,#dbeafe,#fce7f3)" },
];
function loadChatBg() { try { return localStorage.getItem(BG_KEY) ?? ""; } catch { return ""; } }
type BgFit = "cover" | "contain" | "tile";
type BgOpt = { fit: BgFit; dim: number };
const BG_OPT_KEY = "mjs-chat-bg-opt";
function loadBgOpt(): BgOpt {
  try {
    const raw = JSON.parse(localStorage.getItem(BG_OPT_KEY) ?? "{}") as Partial<BgOpt>;
    return { fit: raw.fit === "contain" || raw.fit === "tile" ? raw.fit : "cover", dim: Math.min(70, Math.max(0, Number(raw.dim) || 0)) };
  } catch { return { fit: "cover", dim: 0 }; }
}
function bgStyle(value: string, opt: BgOpt = { fit: "cover", dim: 0 }): CSSProperties {
  if (!value) return {};
  if (value.startsWith("img:")) {
    const layer = opt.dim > 0 ? `linear-gradient(rgba(0,0,0,${opt.dim / 100}),rgba(0,0,0,${opt.dim / 100})), ` : "";
    return {
      backgroundImage: `${layer}url(${value.slice(4)})`,
      backgroundSize: opt.fit === "tile" ? "auto" : opt.fit === "contain" ? "contain" : "cover",
      backgroundRepeat: opt.fit === "tile" ? "repeat" : "no-repeat",
      backgroundPosition: "center",
      backgroundColor: "#0f172a",
    };
  }
  if (value.startsWith("linear-gradient")) return { backgroundImage: value };
  return { backgroundColor: value };
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const MAX_FILE = 2_500_000;
const MAX_ATTACH = 10;
const PAGE = 40;

/* ------------------------------------------------------------------ */
/* Pilih pesan ala WhatsApp                                            */
/* ------------------------------------------------------------------ */

export function useSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = useCallback((id: number) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const setAll = useCallback((ids: number[]) => setSelected(new Set(ids)), []);
  return { selected, toggle, clear, setAll, active: selected.size > 0 };
}

export function PickMark({ on }: { on: boolean }) {
  return <span className={`mx-1 grid size-5 shrink-0 place-items-center self-center rounded-full border-2 ${on ? "border-accent bg-accent text-white" : "border-slate-300 bg-white"}`}>{on ? <Check className="size-3" strokeWidth={3} /> : null}</span>;
}

/* ------------------------------------------------------------------ */
/* Utilitas                                                            */
/* ------------------------------------------------------------------ */

type FileData = Awaited<ReturnType<typeof chatFileGet>>;
const fileCache = new Map<number, Promise<FileData>>();
export function getFile(id: number) {
  let promise = fileCache.get(id);
  if (!promise) {
    if (fileCache.size > 60) { const oldest = fileCache.keys().next().value; if (oldest !== undefined) fileCache.delete(oldest); }
    promise = chatFileGet({ data: { id } });
    promise.catch(() => fileCache.delete(id));
    fileCache.set(id, promise);
  }
  return promise;
}

async function downloadFile(id: number) {
  try {
    const f = await getFile(id);
    const a = document.createElement("a");
    a.href = f.dataUrl;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Gagal mengunduh file");
  }
}

const fmtSize = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

const dataBytes = (url: string) => Math.floor(((url.length - url.indexOf(",") - 1) * 3) / 4);

async function resizeImage(file: File, maxSide = 1280, quality = 0.75): Promise<string> {
  const src = await fileToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Gambar tidak bisa dibuka"));
    el.src = src;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gambar tidak bisa diproses");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL("image/jpeg", quality);
  if (dataBytes(out) > MAX_FILE) out = canvas.toDataURL("image/jpeg", 0.5);
  return out;
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export async function prepareAttachment(file: File): Promise<Attach> {
  if (file.type.startsWith("image/") && !file.type.includes("svg")) {
    const data = await resizeImage(file);
    if (dataBytes(data) > MAX_FILE) throw new Error("Foto terlalu besar.");
    const base = file.name.replace(/\.[^.]+$/, "") || "foto";
    return { name: `${base}.jpg`, mime: "image/jpeg", data, image: true };
  }
  if (file.size > MAX_FILE) throw new Error("File terlalu besar (maksimal 2,5 MB).");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type || EXT_MIME[ext] || "";
  if (!mime) throw new Error("Jenis file ini tidak didukung.");
  const raw = await fileToDataUrl(file);
  const data = `data:${mime};base64,${raw.slice(raw.indexOf(",") + 1)}`;
  return { name: file.name, mime, data, image: false };
}

function renderRich(text: string, names: string[]): ReactNode[] {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alt = names.filter(Boolean).sort((a, b) => b.length - a.length).map(esc).join("|");
  const re = new RegExp(`(https?:\\/\\/[^\\s<>]+)${alt ? `|(@(?:${alt}))(?![\\p{L}\\p{N}_])` : ""}`, "giu");
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1]) {
      let url = m[1];
      let tail = "";
      const trim = /[.,;:!?)\]]+$/.exec(url);
      if (trim) { tail = trim[0]; url = url.slice(0, -tail.length); }
      out.push(<a key={key++} data-act="1" href={url} target="_blank" rel="noopener noreferrer" className="break-all underline">{url}</a>);
      if (tail) out.push(tail);
    } else {
      out.push(<span key={key++} className="rounded bg-amber-200/80 px-0.5 font-semibold text-slate-900">{m[2]}</span>);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function flashEl(el: HTMLElement) {
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("mjs-flash");
  void el.offsetWidth;
  el.classList.add("mjs-flash");
  window.setTimeout(() => el.classList.remove("mjs-flash"), 1700);
}

function threadSig(t: Thread) {
  const msgs = t.messages.map((m) => `${m.id}${m.deleted ? "d" : ""}${m.read ? "r" : ""}${m.pinned ? "p" : ""}${m.editedAt}${m.reactions.map((r) => `${r.emoji}${r.count}${r.mine ? "m" : ""}`).join("")}`).join(",");
  return `${msgs}|${t.readers.map((r) => r.lastReadId).join(",")}|${t.hasMore}|${t.pins.map((p) => p.id).join(",")}`;
}

/* ------------------------------------------------------------------ */
/* Bagian-bagian gelembung pesan                                       */
/* ------------------------------------------------------------------ */

function ChatImage({ file, disabled, onOpen }: { file: { id: number; name: string }; disabled: boolean; onOpen: (src: string, name: string, id: number) => void }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    getFile(file.id).then((f) => { if (alive) setSrc(f.dataUrl); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [file.id]);
  if (failed) return <p className="mb-1 text-xs italic opacity-70">Foto tidak bisa dimuat</p>;
  if (!src) return <div className="mb-1 grid h-44 w-56 max-w-full place-items-center rounded-lg bg-black/10 text-xs opacity-70">Memuat foto...</div>;
  return <img data-act="1" src={src} alt={file.name} className="mb-1 h-44 w-56 max-w-full rounded-lg object-cover" onClick={() => { if (!disabled) onOpen(src, file.name, file.id); }} />;
}

function FileCard({ file, mine, disabled }: { file: { id: number; name: string; size: number }; mine: boolean; disabled: boolean }) {
  return (
    <button type="button" data-act="1" className={`mb-1 flex w-56 max-w-full items-center gap-2 rounded-lg p-2 text-left ${mine ? "bg-white/15" : "bg-slate-100"}`} onClick={() => { if (!disabled) void downloadFile(file.id); }}>
      <FileText className="size-8 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold">{file.name}</span>
        <span className="block text-[10px] opacity-70">{fmtSize(file.size)} · Ketuk untuk unduh</span>
      </span>
      <Download className="size-4 shrink-0" />
    </button>
  );
}

function ShareCard({ share, mine, role, disabled }: { share: { kind: string; ref: string; title: string; sub: string }; mine: boolean; role: string; disabled: boolean }) {
  const canOpen = share.kind === "barang" ? role === "Admin" || role === "Owner" : true;
  return (
    <button
      type="button"
      data-act="1"
      className={`mb-1 flex w-60 max-w-full items-start gap-2 rounded-lg border p-2 text-left ${mine ? "border-white/30 bg-white/15" : "border-line bg-slate-50"}`}
      onClick={() => {
        if (disabled || !canOpen) return;
        try { sessionStorage.setItem(share.kind === "barang" ? "mjs-find" : "mjs-open-invoice", share.ref); } catch { /* abaikan */ }
        window.location.href = share.kind === "barang" ? "/barang" : "/riwayat";
      }}
    >
      {share.kind === "barang" ? <Package className="mt-0.5 size-5 shrink-0" /> : <Receipt className="mt-0.5 size-5 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-xs font-bold">{share.title}</span>
        <span className="block break-words text-[11px] opacity-80">{share.sub}</span>
        {canOpen ? <span className="mt-1 block text-[10px] font-bold underline">Buka di aplikasi</span> : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Galeri foto: geser kiri/kanan antar foto percakapan                 */
/* ------------------------------------------------------------------ */

export function Lightbox({ items, startId, onClose }: { items: Array<{ id: number; name: string }>; startId: number; onClose: () => void }) {
  const [idx, setIdx] = useState(() => Math.max(0, items.findIndex((i) => i.id === startId)));
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const cur = items[Math.min(idx, items.length - 1)];
  const pos = Math.min(idx, items.length - 1);

  const go = useCallback((d: number) => setIdx((i) => Math.min(items.length - 1, Math.max(0, Math.min(i, items.length - 1) + d))), [items.length]);

  useEffect(() => { if (!cur) onClose(); }, [cur, onClose]);

  useEffect(() => {
    if (!cur) return;
    let alive = true;
    setSrc("");
    setFailed(false);
    getFile(cur.id).then((f) => { if (alive) setSrc(f.dataUrl); }).catch(() => { if (alive) setFailed(true); });
    // Muat foto di kiri-kanan lebih awal supaya geser terasa cepat.
    for (const n of [items[pos - 1], items[pos + 1]]) if (n) getFile(n.id).catch(() => undefined);
    return () => { alive = false; };
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!cur) return null;
  const nav = "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow disabled:opacity-30 sm:grid";

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4"
      onClick={onClose}
      onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white">{pos + 1} / {items.length}</div>
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <button type="button" className="grid size-10 place-items-center rounded-full bg-white/90" aria-label="Unduh" onClick={(e) => { e.stopPropagation(); void downloadFile(cur.id); }}><Download className="size-5" /></button>
        <button type="button" className="grid size-10 place-items-center rounded-full bg-white/90" aria-label="Tutup" onClick={onClose}><X className="size-5" /></button>
      </div>
      <button type="button" className={`${nav} left-3`} aria-label="Foto sebelumnya" disabled={pos <= 0} onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft className="size-6" /></button>
      <button type="button" className={`${nav} right-3`} aria-label="Foto berikutnya" disabled={pos >= items.length - 1} onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight className="size-6" /></button>
      {failed ? <p className="text-sm text-white">Foto tidak bisa dimuat</p> : !src ? <p className="text-sm text-white/80">Memuat foto...</p> : (
        <img src={src} alt={cur.name} className="max-h-[84vh] max-w-full select-none rounded-lg object-contain" draggable={false} onClick={(e) => e.stopPropagation()} />
      )}
      <p className="absolute bottom-3 left-0 right-0 truncate px-16 text-center text-xs text-white/70">{cur.name}{items.length > 1 ? " · geser untuk foto lain" : ""}</p>
    </div>
  );
}

type BubbleProps = {
  m: Msg;
  kind: ChatKind;
  showName: boolean;
  selecting: boolean;
  selected: boolean;
  names: string[];
  readers: Thread["readers"];
  role: string;
  onToggle: () => void;
  onJump: (id: number) => void;
  onOpenImage: (src: string, name: string, id: number) => void;
  onSeen: (m: Msg) => void;
  onReact: (m: Msg, emoji: string) => void;
};

function Bubble(p: BubbleProps) {
  const { m, kind, selecting, selected } = p;
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const cancel = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const down = () => {
    longFired.current = false;
    cancel();
    timer.current = window.setTimeout(() => { longFired.current = true; p.onToggle(); }, 450);
  };
  const click = (e: ReactMouseEvent) => {
    if (longFired.current) { longFired.current = false; e.preventDefault(); return; }
    const inner = (e.target as HTMLElement).closest("[data-act]");
    if (selecting || !inner) { e.preventDefault(); p.onToggle(); }
  };
  const isImage = Boolean(m.file && m.file.mime.startsWith("image/"));
  const readCount = p.readers.filter((r) => r.lastReadId >= m.id).length;
  const tone = m.mine ? "text-white/70" : "text-muted";

  return (
    <div id={`msg-${m.id}`} className={`flex items-end rounded-lg py-0.5 ${m.mine ? "justify-end" : "justify-start"} ${selected ? "bg-blue-100/70" : ""}`}>
      {selecting && !m.mine ? <PickMark on={selected} /> : null}
      <div className={`flex max-w-[82%] flex-col gap-1 ${m.mine ? "items-end" : "items-start"}`}>
        <div
          role="button"
          onClick={click}
          onPointerDown={down}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onContextMenu={(e) => { if (longFired.current) e.preventDefault(); }}
          className={`rounded-2xl px-3 py-2 text-sm shadow-sm cursor-pointer select-none md:select-text ${m.mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-white text-ink"}`}
        >
          {p.showName ? <p className="mb-0.5 text-[11px] font-bold text-accent">{m.name}</p> : null}
          {m.deleted ? <p className="italic opacity-70">Pesan ini telah dihapus</p> : (
            <>
              {m.reply ? (
                <button
                  type="button"
                  data-act="1"
                  className={`mb-1 block w-full min-w-40 rounded-md border-l-4 px-2 py-1 text-left ${m.mine ? "border-white/70 bg-white/15" : "border-accent bg-slate-100"}`}
                  onClick={() => { if (!selecting && m.reply && !m.reply.deleted) p.onJump(m.reply.id); }}
                >
                  <span className={`block text-[11px] font-bold ${m.mine ? "text-white" : "text-accent"}`}>{m.reply.deleted ? "Pesan" : m.reply.name}</span>
                  <span className={`line-clamp-2 block break-words text-xs ${m.reply.deleted ? "italic opacity-70" : "opacity-90"}`}>{m.reply.deleted ? "Pesan ini telah dihapus" : m.reply.body}</span>
                </button>
              ) : null}
              {m.file && isImage ? <ChatImage file={m.file} disabled={selecting} onOpen={p.onOpenImage} /> : null}
              {m.file && !isImage ? <FileCard file={m.file} mine={m.mine} disabled={selecting} /> : null}
              {m.share ? <ShareCard share={m.share} mine={m.mine} role={p.role} disabled={selecting} /> : null}
              {!m.auto && m.body ? <p className="whitespace-pre-wrap break-words">{renderRich(m.body, p.names)}</p> : null}
            </>
          )}
          <p className={`mt-0.5 flex items-center justify-end gap-1.5 text-[10px] ${tone}`}>
            {m.pinned ? <Pin className="size-3" /> : null}
            {m.editedAt ? <span>diedit</span> : null}
            <span>{hhmm(m.createdAt)}</span>
            {kind === "dm" && m.mine && !m.deleted ? (
              <CheckCheck aria-label={m.read ? "Sudah dibaca" : "Terkirim, belum dibaca"} className={`size-4 ${m.read ? "text-sky-300" : "text-white/60"}`} strokeWidth={2.5} />
            ) : null}
            {kind === "group" && m.mine && !m.deleted && p.readers.length > 0 ? (
              <button type="button" data-act="1" className="inline-flex items-center" aria-label="Info dibaca" onClick={() => { if (!selecting) p.onSeen(m); }}>
                <CheckCheck className={`size-4 ${readCount >= p.readers.length ? "text-sky-300" : "text-white/60"}`} strokeWidth={2.5} />
              </button>
            ) : null}
          </p>
        </div>
        {m.reactions.length > 0 ? (
          <div className="-mt-2 flex flex-wrap gap-1 px-1">
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button" title={r.names.join(", ")} onClick={() => p.onReact(m, r.emoji)} className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${r.mine ? "border-accent bg-blue-50" : "border-line bg-white"}`}>
                {r.emoji}{r.count > 1 ? <span className="text-[10px] font-bold text-slate-700">{r.count}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {selecting && m.mine ? <PickMark on={selected} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Percakapan (dipakai chat pribadi dan grup)                          */
/* ------------------------------------------------------------------ */

export function Conversation(props: {
  kind: ChatKind;
  target: string;
  title: string;
  members: Person[];
  meUsername: string;
  role: string;
  moderator: boolean;
  onRead: () => void;
}) {
  const { kind, target, title, members, meUsername, role, moderator } = props;
  const onReadRef = useRef(props.onRead);
  onReadRef.current = props.onRead;

  const [thread, setThread] = useState<Thread | null>(null);
  const winRef = useRef<Win>({ limit: PAGE, since: 0 });
  const sigRef = useRef("");
  const alive = useRef(true);
  const [divider, setDivider] = useState(0);
  const firstLoad = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const draftKey = `mjs-draft:${kind}:${target}`;
  const [text, setText] = useState(() => { try { return localStorage.getItem(draftKey) ?? ""; } catch { return ""; } });
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const draftBeforeEdit = useRef("");
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [progress, setProgress] = useState("");
  const [share, setShare] = useState<ShareDraft | null>(null);
  const [menu, setMenu] = useState(false);
  const [shareModal, setShareModal] = useState<"barang" | "transaksi" | null>(null);
  const [mention, setMention] = useState<{ q: string; start: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; body: string; createdAt: string }>>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [delDialog, setDelDialog] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactFor, setReactFor] = useState<Msg | null>(null);
  const [bgOpen, setBgOpen] = useState(false);
  const [bg, setBg] = useState<string>(() => loadChatBg());
  const [bgOpt, setBgOpt] = useState<BgOpt>(() => loadBgOpt());
  const bgInput = useRef<HTMLInputElement>(null);
  const [seen, setSeen] = useState<Msg | null>(null);
  const [pinIdx, setPinIdx] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const sel = useSelection();
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const nearBottom = useRef(true);
  const initDone = useRef(false);
  const edge = useRef({ first: 0, last: 0 });
  const anchor = useRef({ h: 0, t: 0 });
  const pendingJump = useRef(0);

  const messages = thread?.messages ?? [];
  const pins = thread?.pins ?? [];
  const readers = thread?.readers ?? [];
  const names = kind === "group" ? members.map((x) => x.name) : [];

  const load = useCallback((force = false, w?: Win) => {
    const cur = w ?? winRef.current;
    void chatThread({ data: { kind, target, limit: cur.limit, since: cur.since } }).then((res) => {
      if (!alive.current) return;
      window.dispatchEvent(new Event("mjs-chat"));
      const sig = threadSig(res);
      if (!force && sig === sigRef.current) return;
      sigRef.current = sig;
      if (firstLoad.current) {
        firstLoad.current = false;
        setDivider(res.messages.find((x) => x.fresh)?.id ?? 0);
      }
      setThread(res);
      onReadRef.current();
    }).catch(() => undefined);
  }, [kind, target]);

  useEffect(() => {
    alive.current = true;
    load(true);
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 3000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [load]);

  // Simpan draft ketik per percakapan.
  useEffect(() => {
    if (editing) return;
    try { if (text) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); } catch { /* abaikan */ }
  }, [text, editing, draftKey]);

  // Posisi gulir: ke "Pesan baru" saat dibuka, tetap di bawah kalau sedang di bawah, dan jaga posisi saat memuat pesan lama.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !thread) return;
    const msgs = thread.messages;
    const first = msgs[0]?.id ?? 0;
    const last = msgs[msgs.length - 1]?.id ?? 0;
    if (!initDone.current) {
      initDone.current = true;
      edge.current = { first, last };
      const div = el.querySelector<HTMLElement>("[data-divider]");
      el.scrollTop = div ? Math.max(0, div.offsetTop - 60) : el.scrollHeight;
      return;
    }
    const prev = edge.current;
    if (first && prev.first && first < prev.first) {
      el.scrollTop = el.scrollHeight - anchor.current.h + anchor.current.t;
    } else if (last > prev.last) {
      const lastMsg = msgs[msgs.length - 1];
      if (nearBottom.current || lastMsg?.mine) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else setNewCount((c) => c + msgs.filter((x) => x.id > prev.last && !x.mine).length);
    }
    edge.current = { first, last };
    if (pendingJump.current) {
      const node = el.querySelector<HTMLElement>(`#msg-${pendingJump.current}`);
      if (node) { pendingJump.current = 0; winRef.current = { limit: msgs.length + 10, since: 0 }; flashEl(node); }
      else if (first && first <= pendingJump.current) { pendingJump.current = 0; winRef.current = { limit: msgs.length + 10, since: 0 }; }
    }
  }, [thread]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    nearBottom.current = near;
    setAtBottom((prev) => (prev === near ? prev : near));
    if (near) setNewCount(0);
  }

  function scrollBottom() {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNewCount(0);
  }

  function loadOlder() {
    const el = listRef.current;
    if (el) anchor.current = { h: el.scrollHeight, t: el.scrollTop };
    const next = { limit: messages.length + PAGE, since: 0 };
    winRef.current = next;
    setLoadingOlder(true);
    load(true, next);
    window.setTimeout(() => setLoadingOlder(false), 600);
  }

  const jumpTo = useCallback((id: number) => {
    const el = listRef.current?.querySelector<HTMLElement>(`#msg-${id}`);
    if (el) { flashEl(el); return; }
    const el2 = listRef.current;
    if (el2) anchor.current = { h: el2.scrollHeight, t: el2.scrollTop };
    pendingJump.current = id;
    const next = { limit: PAGE, since: id };
    winRef.current = next;
    load(true, next);
  }, [load]);

  // Cari di dalam percakapan.
  useEffect(() => {
    if (!searchOpen || q.trim().length < 2) { setResults([]); return; }
    const timer = window.setTimeout(() => {
      void chatSearch({ data: { kind, target, q: q.trim() } }).then((rows) => { if (alive.current) setResults(rows); }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q, searchOpen, kind, target]);

  /* ---------- aksi di bar pilihan ---------- */

  const pickable = messages.map((m) => m.id);
  const selMsgs = messages.filter((m) => sel.selected.has(m.id));
  const one = selMsgs.length === 1 && !selMsgs[0].deleted ? selMsgs[0] : null;
  // "Hapus untuk semua" hanya untuk pesan milik sendiri (atau pesan siapa pun bila moderator grup).
  const canDeleteAll = selMsgs.length > 0 && selMsgs.every((m) => !m.deleted && (m.mine || (kind === "group" && moderator)));
  const canClearAll = role === "Admin" || role === "Owner";
  const galleryItems = messages.filter((m) => !m.deleted && m.file && m.file.mime.startsWith("image/")).map((m) => ({ id: m.file!.id, name: m.file!.name }));

  function startReply(m: Msg) {
    setReplyTo(m);
    setEditing(null);
    sel.clear();
    window.setTimeout(() => taRef.current?.focus(), 0);
  }

  function startEdit(m: Msg) {
    draftBeforeEdit.current = text;
    setEditing(m);
    setReplyTo(null);
    setAttachments([]);
    setShare(null);
    setText(m.auto ? "" : m.body);
    sel.clear();
    window.setTimeout(() => taRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setEditing(null);
    setText(draftBeforeEdit.current);
  }

  function copySelected() {
    const joined = selMsgs.filter((m) => !m.auto && m.body).map((m) => m.body).join("\n");
    if (!joined) { toast.error("Tidak ada teks untuk disalin."); return; }
    void navigator.clipboard?.writeText(joined).then(() => { toast.success("Pesan disalin"); sel.clear(); }).catch(() => toast.error("Tidak bisa menyalin"));
  }

  async function togglePin(m: Msg) {
    try {
      await chatPin({ data: { kind, id: m.id, pinned: !m.pinned } });
      sel.clear();
      load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyematkan pesan");
    }
  }

  async function react(m: Msg, emoji: string) {
    try {
      await chatReact({ data: { kind, id: m.id, emoji } });
      sel.clear();
      load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memberi reaksi");
    }
  }

  async function deleteSelected(scope: "me" | "all") {
    const ids = [...sel.selected];
    if (!ids.length || deleting) return;
    setDeleting(true);
    try {
      if (scope === "me") {
        await chatHideMessages({ data: { kind: kind === "group" ? "group" : "dm", ids } });
        toast.success(`${ids.length} pesan dihapus untuk Anda`);
      } else {
        const res = kind === "group" ? await groupDeleteMessages({ data: { ids } }) : await chatDeleteMessages({ data: { ids } });
        toast.success(`${res.deleted} pesan dihapus untuk semua`);
      }
      setDelDialog(false);
      sel.clear();
      load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pesan");
    } finally {
      setDeleting(false);
    }
  }

  async function clearChat(scope: "me" | "all") {
    setMoreOpen(false);
    const label = kind === "group" ? "grup ini" : title || "percakapan ini";
    const warn = scope === "me"
      ? `Kosongkan semua pesan di ${label} dari tampilan Anda? Lawan bicara tetap bisa melihatnya.`
      : `Hapus SEMUA pesan di ${label} untuk semua orang? Tidak bisa dikembalikan.`;
    if (!confirm(warn)) return;
    setDeleting(true);
    try {
      if (scope === "me") await chatHideAll({ data: { kind: kind === "group" ? "group" : "dm", target } });
      else if (kind === "group") await groupClearMessages({ data: { id: Number(target) } });
      else await chatClear({ data: { with: target } });
      toast.success("Chat dikosongkan");
      sel.clear();
      winRef.current = { limit: PAGE, since: 0 };
      load(true, winRef.current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengosongkan chat");
    } finally {
      setDeleting(false);
    }
  }

  function applyBg(value: string) {
    setBg(value);
    try { if (value) localStorage.setItem(BG_KEY, value); else localStorage.removeItem(BG_KEY); } catch { toast.error("Latar terlalu besar untuk disimpan di perangkat ini."); }
  }

  function changeBgOpt(patch: Partial<BgOpt>) {
    const next = { ...bgOpt, ...patch };
    setBgOpt(next);
    try { localStorage.setItem(BG_OPT_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  }

  async function pickBgImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Pilih file gambar."); return; }
    try {
      const url = await resizeImage(file, 1100, 0.6);
      applyBg(`img:${url}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gambar tidak bisa dipakai");
    }
  }

  function insertEmoji(emoji: string) {
    const ta = taRef.current;
    const a = ta?.selectionStart ?? text.length;
    const b = ta?.selectionEnd ?? text.length;
    if (text.length - (b - a) + emoji.length > 2000) return;
    const next = text.slice(0, a) + emoji + text.slice(b);
    setText(next);
    const pos = a + emoji.length;
    window.setTimeout(() => { ta?.focus(); ta?.setSelectionRange(pos, pos); }, 0);
  }

  /* ---------- kirim ---------- */

  async function attachFiles(files: File[]) {
    if (!files.length) return;
    const room = MAX_ATTACH - attachments.length;
    if (room <= 0) { toast.error(`Maksimal ${MAX_ATTACH} file sekali kirim.`); return; }
    if (files.length > room) toast.error(`Hanya ${room} file pertama yang dipakai (maksimal ${MAX_ATTACH} sekali kirim).`);
    setAttaching(true);
    const ready: Attach[] = [];
    for (const file of files.slice(0, room)) {
      try {
        ready.push(await prepareAttachment(file));
      } catch (error) {
        toast.error(`${file.name}: ${error instanceof Error ? error.message : "gagal disiapkan"}`);
      }
    }
    setAttachments((prev) => [...prev, ...ready].slice(0, MAX_ATTACH));
    setAttaching(false);
  }

  async function send() {
    const body = text.trim();
    if (sending || attaching) return;
    if (editing) {
      if (!body && !editing.file && !editing.share) return;
      setSending(true);
      try {
        await chatEdit({ data: { kind, id: editing.id, body } });
        setEditing(null);
        setText(draftBeforeEdit.current);
        load(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal mengubah pesan");
      } finally {
        setSending(false);
      }
      return;
    }
    if (!body && attachments.length === 0 && !share) return;
    setSending(true);
    // Beberapa foto dikirim sebagai pesan berurutan; teks, balasan, dan data toko ikut di pesan pertama.
    const list: Array<Attach | null> = attachments.length ? attachments : [null];
    let sent = 0;
    try {
      for (const att of list) {
        await chatPost({
          data: {
            kind,
            target,
            body: sent === 0 ? body : "",
            replyTo: sent === 0 ? (replyTo?.id ?? null) : null,
            file: att ? { name: att.name, data: att.data } : null,
            share: sent === 0 && share ? { type: share.type, ref: share.ref } : null,
          },
        });
        sent += 1;
        if (list.length > 1) setProgress(`${sent}/${list.length}`);
      }
      setText("");
      setReplyTo(null);
      setAttachments([]);
      setShare(null);
      setMention(null);
      load(true);
    } catch (error) {
      if (sent > 0) {
        // Sebagian sudah terkirim: sisakan yang belum, supaya kirim ulang tidak menggandakan.
        setAttachments(attachments.slice(sent));
        setText("");
        setReplyTo(null);
        setShare(null);
        load(true);
      }
      toast.error(error instanceof Error ? error.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
      setProgress("");
    }
  }

  /* ---------- sebut nama (@) ---------- */

  const mentionList = mention
    ? members.filter((x) => x.username !== meUsername && (x.name.toLowerCase().includes(mention.q) || x.username.toLowerCase().includes(mention.q))).slice(0, 6)
    : [];

  function updateMention(value: string, caret: number) {
    if (kind !== "group" || members.length === 0) { setMention(null); return; }
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setMention(m ? { q: m[2].toLowerCase(), start: caret - m[2].length - 1 } : null);
  }

  function pickMention(person: Person) {
    if (!mention) return;
    const caret = taRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${person.name} ${text.slice(caret)}`;
    const pos = mention.start + person.name.length + 2;
    setText(next);
    setMention(null);
    window.setTimeout(() => { taRef.current?.focus(); taRef.current?.setSelectionRange(pos, pos); }, 0);
  }

  /* ---------- tampilan ---------- */

  const iconBtn = "grid size-9 place-items-center rounded-lg hover:bg-blue-100";
  const pin = pins.length ? pins[pinIdx % pins.length] : null;

  return (
    <>
      {sel.active ? (
        <div className="border-b border-line bg-blue-50">
          <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
            <button type="button" className={iconBtn} onClick={sel.clear} aria-label="Batal pilih"><X className="size-5" /></button>
            <p className="mr-auto text-sm font-bold">{sel.selected.size} dipilih</p>
            {sel.selected.size < pickable.length ? <button type="button" className="h-9 rounded-lg px-2 text-xs font-bold text-accent hover:bg-blue-100" onClick={() => sel.setAll(pickable)}>Pilih semua</button> : null}
            {one ? <button type="button" className={iconBtn} title="Balas" aria-label="Balas" onClick={() => startReply(one)}><CornerUpLeft className="size-4" /></button> : null}
            <button type="button" className={iconBtn} title="Salin" aria-label="Salin" onClick={copySelected}><Copy className="size-4" /></button>
            {one && one.mine ? <button type="button" className={iconBtn} title="Ubah" aria-label="Ubah" onClick={() => startEdit(one)}><Pencil className="size-4" /></button> : null}
            {one ? <button type="button" className={iconBtn} title={one.pinned ? "Lepas sematan" : "Sematkan"} aria-label="Sematkan" onClick={() => void togglePin(one)}>{one.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</button> : null}
            {one && one.mine && kind === "group" ? <button type="button" className={iconBtn} title="Info dibaca" aria-label="Info dibaca" onClick={() => { setSeen(one); sel.clear(); }}><Info className="size-4" /></button> : null}
            <button type="button" disabled={deleting} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-bold text-white disabled:opacity-50" onClick={() => setDelDialog(true)}><Trash2 className="size-4" />Hapus</button>
          </div>
          {one ? (
            <div className="flex gap-1 px-3 pb-2">
              {EMOJIS.map((e) => {
                const mineOn = one.reactions.some((r) => r.emoji === e && r.mine);
                return <button key={e} type="button" className={`grid size-9 place-items-center rounded-full text-lg ${mineOn ? "bg-blue-200" : "bg-white"} shadow-sm`} onClick={() => void react(one, e)}>{e}</button>;
              })}
              <button type="button" aria-label="Emoji lainnya" title="Emoji lainnya" className="grid size-9 place-items-center rounded-full bg-white shadow-sm" onClick={() => setReactFor(one)}><Plus className="size-4" /></button>
            </div>
          ) : null}
        </div>
      ) : null}

      {searchOpen && !sel.active ? (
        <div className="relative z-20 border-b border-line bg-white p-2">
          <div className="flex items-center gap-2">
            <Search className="size-4 shrink-0 text-muted" />
            <input autoFocus className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-accent" placeholder="Cari di percakapan ini" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className={iconBtn} aria-label="Tutup pencarian" onClick={() => { setSearchOpen(false); setQ(""); setResults([]); }}><X className="size-4" /></button>
          </div>
          {q.trim().length >= 2 ? (
            <ul className="absolute left-0 right-0 top-full max-h-64 overflow-y-auto border-b border-line bg-white shadow-lg">
              {results.length === 0 ? <li className="px-3 py-3 text-center text-xs text-muted">Tidak ada pesan yang cocok.</li> : null}
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" className="block w-full border-b border-line px-3 py-2 text-left hover:bg-blue-50" onClick={() => { setSearchOpen(false); setQ(""); setResults([]); jumpTo(r.id); }}>
                    <span className="flex items-center justify-between gap-2 text-[11px] text-muted"><span className="truncate font-bold">{r.name}</span><span className="shrink-0">{dayLabel(r.createdAt)} {hhmm(r.createdAt)}</span></span>
                    <span className="line-clamp-2 block break-words text-xs">{r.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {pin && !sel.active && !searchOpen ? (
        <button type="button" className="flex w-full items-center gap-2 border-b border-line bg-amber-50 px-3 py-1.5 text-left" onClick={() => { jumpTo(pin.id); setPinIdx((i) => i + 1); }}>
          <Pin className="size-4 shrink-0 text-amber-700" />
          <span className="min-w-0 flex-1 truncate text-xs"><b>{pin.name}:</b> {pin.body}</span>
          {pins.length > 1 ? <span className="shrink-0 text-[11px] font-bold text-amber-800">{(pinIdx % pins.length) + 1}/{pins.length}</span> : null}
        </button>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-slate-50">
        <div ref={listRef} onScroll={onScroll} style={bgStyle(bg, bgOpt)} className="absolute inset-0 space-y-1 overflow-y-auto px-3 py-3">
          {thread?.hasMore ? <div className="py-1 text-center"><button type="button" disabled={loadingOlder} className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-accent shadow-sm disabled:opacity-50" onClick={loadOlder}>{loadingOlder ? "Memuat..." : "Muat pesan lebih lama"}</button></div> : null}
          {thread && messages.length === 0 ? <p className="py-10 text-center text-sm text-muted">{kind === "group" ? "Belum ada pesan di grup ini." : `Belum ada pesan. Tulis pesan pertama untuk ${title}.`}</p> : null}
          {thread === null ? <p className="py-10 text-center text-sm text-muted">Memuat...</p> : null}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = i === 0 || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const showName = kind === "group" && !m.mine && (newDay || prev.mine || prev.sender !== m.sender);
            return (
              <div key={m.id}>
                {newDay ? <p className="my-2 text-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-muted shadow-sm">{dayLabel(m.createdAt)}</span></p> : null}
                {divider && m.id === divider ? <p data-divider="1" className="my-2 text-center"><span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-accent">Pesan baru</span></p> : null}
                <Bubble
                  m={m}
                  kind={kind}
                  showName={showName}
                  selecting={sel.active}
                  selected={sel.selected.has(m.id)}
                  names={names}
                  readers={readers}
                  role={role}
                  onToggle={() => sel.toggle(m.id)}
                  onJump={jumpTo}
                  onOpenImage={(_src, _name, id) => setLightbox(id)}
                  onSeen={setSeen}
                  onReact={(msg, emoji) => void react(msg, emoji)}
                />
              </div>
            );
          })}
        </div>
        {!searchOpen && !sel.active ? (
          <div className="absolute right-3 top-2 z-10 flex gap-2">
            <button type="button" className="grid size-9 place-items-center rounded-full border border-line bg-white shadow" aria-label="Cari pesan" title="Cari pesan" onClick={() => setSearchOpen(true)}><Search className="size-4" /></button>
            <button type="button" className="grid size-9 place-items-center rounded-full border border-line bg-white shadow" aria-label="Menu chat" title="Menu chat" onClick={() => setMoreOpen((v) => !v)}><MoreVertical className="size-4" /></button>
          </div>
        ) : null}
        {moreOpen && !searchOpen && !sel.active ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
            <div className="absolute right-3 top-12 z-20 w-64 rounded-xl border border-line bg-white p-1 shadow-lg">
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => { setMoreOpen(false); sel.setAll(pickable); }}><Check className="size-4" />Pilih semua pesan</button>
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => { setMoreOpen(false); setBgOpen(true); }}><Palette className="size-4" />Latar belakang chat</button>
              <button type="button" disabled={deleting || messages.length === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:opacity-40" onClick={() => void clearChat("me")}><Trash2 className="size-4" />Kosongkan chat (untuk saya)</button>
              {canClearAll ? <button type="button" disabled={deleting || messages.length === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-red-50 disabled:opacity-40" onClick={() => void clearChat("all")}><Trash2 className="size-4" />Hapus semua untuk semua orang</button> : null}
            </div>
          </>
        ) : null}
        {!atBottom ? (
          <button type="button" className="absolute bottom-3 right-3 z-10 grid size-10 place-items-center rounded-full border border-line bg-white shadow" aria-label="Ke pesan terbaru" onClick={scrollBottom}>
            <ChevronDown className="size-5" />
            {newCount > 0 ? <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{newCount}</span> : null}
          </button>
        ) : null}
      </div>

      <div className="relative border-t border-line">
        {emojiOpen ? (
          <div className="absolute inset-x-2 bottom-full z-30 mb-1 max-w-md">
            <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />
          </div>
        ) : null}
        {editing ? (
          <div className="flex items-center gap-2 border-b border-line bg-amber-50 px-3 py-2">
            <Pencil className="size-4 shrink-0 text-amber-700" />
            <p className="min-w-0 flex-1 truncate text-xs"><b>Mengubah pesan</b></p>
            <button type="button" className={iconBtn} aria-label="Batal ubah" onClick={cancelEdit}><X className="size-4" /></button>
          </div>
        ) : null}
        {replyTo ? (
          <div className="flex items-start gap-2 border-b border-line bg-slate-50 px-3 py-2">
            <CornerUpLeft className="mt-0.5 size-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1 border-l-4 border-accent pl-2">
              <p className="text-xs font-bold text-accent">{replyTo.mine ? "Anda" : replyTo.name}</p>
              <p className="truncate text-xs text-muted">{replyTo.body || "Pesan"}</p>
            </div>
            <button type="button" className={iconBtn} aria-label="Batal balas" onClick={() => setReplyTo(null)}><X className="size-4" /></button>
          </div>
        ) : null}
        {attachments.length > 0 || attaching ? (
          <div className="flex items-center gap-3 overflow-x-auto border-b border-line bg-slate-50 px-3 py-2">
            {attachments.map((a, i) => (
              <div key={`${a.name}-${i}`} className="relative shrink-0">
                {a.image ? <img src={a.data} alt="" className="size-14 rounded-lg object-cover" /> : <div className="grid size-14 place-items-center rounded-lg border border-line bg-white"><FileText className="size-6 text-slate-600" /></div>}
                <button type="button" aria-label="Hapus lampiran" disabled={sending} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-slate-800 text-white disabled:opacity-50" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}><X className="size-3" /></button>
                {!a.image ? <p className="mt-0.5 w-14 truncate text-[9px]">{a.name}</p> : null}
              </div>
            ))}
            {attaching ? <span className="shrink-0 text-xs text-muted">Menyiapkan...</span> : null}
            <span className="ml-auto shrink-0 text-[11px] text-muted">{progress ? `Mengirim ${progress}` : `${attachments.length}/${MAX_ATTACH}`}</span>
          </div>
        ) : null}
        {share ? (
          <div className="flex items-start gap-2 border-b border-line bg-slate-50 px-3 py-2">
            {share.type === "barang" ? <Package className="mt-0.5 size-5 shrink-0 text-accent" /> : <Receipt className="mt-0.5 size-5 shrink-0 text-accent" />}
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{share.title}</p><p className="truncate text-[11px] text-muted">{share.sub}</p></div>
            <button type="button" className={iconBtn} aria-label="Batal bagikan" onClick={() => setShare(null)}><X className="size-4" /></button>
          </div>
        ) : null}
        {mentionList.length > 0 ? (
          <ul className="max-h-40 overflow-y-auto border-b border-line bg-white">
            {mentionList.map((x) => <li key={x.username}><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => pickMention(x)}>@{x.name}</button></li>)}
          </ul>
        ) : null}
        <form className="flex items-end gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {!editing ? (
            <div className="relative">
              <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white" aria-label="Lampirkan" onClick={() => { setMenu((v) => !v); setEmojiOpen(false); }}><Paperclip className="size-4" /></button>
              {menu ? (
                <div className="absolute bottom-12 left-0 z-30 w-60 rounded-xl border border-line bg-white p-1 shadow-lg">
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => { setMenu(false); imgInput.current?.click(); }}><ImageIcon className="size-4" />Foto / kamera (bisa banyak)</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => { setMenu(false); docInput.current?.click(); }}><FileText className="size-4" />Dokumen (PDF, Word, Excel)</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => { setMenu(false); setShareModal("barang"); }}><Package className="size-4" />Bagikan barang</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => { setMenu(false); setShareModal("transaksi"); }}><Receipt className="size-4" />Bagikan transaksi</button>
                </div>
              ) : null}
            </div>
          ) : null}
          <button type="button" className={`grid size-11 shrink-0 place-items-center rounded-xl border border-line ${emojiOpen ? "bg-blue-100" : "bg-white"}`} aria-label="Emoji" title="Emoji" onClick={() => { setEmojiOpen((v) => !v); setMenu(false); }}><Smile className="size-5" /></button>
          <textarea
            ref={taRef}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
            rows={1}
            maxLength={2000}
            placeholder={`Tulis pesan ${kind === "group" ? "ke" : "untuk"} ${title || "grup"}...`}
            value={text}
            onChange={(e) => { setText(e.target.value); updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
            onPaste={(e) => {
              if (editing) return;
              const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
              if (imgs.length) { e.preventDefault(); void attachFiles(imgs); }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (mentionList.length > 0) pickMention(mentionList[0]);
                else void send();
              }
            }}
          />
          <button type="submit" disabled={sending || attaching || (!text.trim() && attachments.length === 0 && !share && !(editing && (editing.file || editing.share)))} className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-50" aria-label="Kirim"><Send className="size-4" /></button>
        </form>
        <input ref={imgInput} type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void attachFiles(fs); }} />
        <input ref={docInput} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.pptx,.csv,.txt" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void attachFiles(fs); }} />
      </div>

      {shareModal ? <ShareModal type={shareModal} onClose={() => setShareModal(null)} onPick={(item) => { setShare({ type: shareModal, ...item }); setEditing(null); setShareModal(null); window.setTimeout(() => taRef.current?.focus(), 0); }} /> : null}

      {bgOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={() => setBgOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-bold">Latar belakang chat</h3><button type="button" className={iconBtn} aria-label="Tutup" onClick={() => setBgOpen(false)}><X className="size-4" /></button></div>
            <p className="mt-1 text-xs text-muted">Berlaku untuk semua chat di perangkat ini.</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {BG_PRESETS.map((b) => (
                <button key={b.key} type="button" aria-label={b.label} title={b.label} onClick={() => applyBg(b.value)} style={bgStyle(b.value)} className={`h-16 rounded-lg border-2 ${bg === b.value ? "border-accent" : "border-line"}`}>
                  <span className="block px-1 text-[10px] font-bold text-slate-700 [text-shadow:0_0_3px_#fff]">{b.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line text-sm font-bold" onClick={() => bgInput.current?.click()}><ImageIcon className="size-4" />Pilih foto sendiri</button>
            {bg.startsWith("img:") ? (
              <div className="mt-3 space-y-3 rounded-lg border border-line bg-white p-3">
                <div>
                  <p className="text-xs font-bold text-slate-600">Ukuran gambar</p>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {([["cover", "Penuh"], ["contain", "Pas"], ["tile", "Ulang"]] as Array<[BgFit, string]>).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => changeBgOpt({ fit: key })} className={`h-9 rounded-lg border text-xs font-bold ${bgOpt.fit === key ? "border-accent bg-blue-50 text-accent" : "border-line"}`}>{label}</button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{bgOpt.fit === "cover" ? "Menutupi seluruh area (sisi gambar bisa terpotong)." : bgOpt.fit === "contain" ? "Seluruh gambar terlihat tanpa terpotong." : "Gambar diulang seperti pola."}</p>
                </div>
                <label className="block text-xs font-bold text-slate-600">Gelapkan gambar: {bgOpt.dim}%
                  <input type="range" min={0} max={70} step={5} value={bgOpt.dim} onChange={(e) => changeBgOpt({ dim: Number(e.target.value) })} className="mt-1 w-full" />
                </label>
              </div>
            ) : null}
            <button type="button" className="mt-3 h-11 w-full rounded-lg bg-accent text-sm font-bold text-white" onClick={() => setBgOpen(false)}>Selesai</button>
            <input ref={bgInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pickBgImage(f); }} />
          </div>
        </div>
      ) : null}

      {lightbox !== null ? <Lightbox items={galleryItems} startId={lightbox} onClose={() => setLightbox(null)} /> : null}

      {reactFor ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={() => setReactFor(null)}>
          <div className="w-full max-w-sm"><EmojiPicker keepOpen={false} onPick={(e) => { const m = reactFor; setReactFor(null); void react(m, e); }} onClose={() => setReactFor(null)} /></div>
        </div>
      ) : null}

      {delDialog ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={() => { if (!deleting) setDelDialog(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">Hapus {sel.selected.size} pesan?</h3>
            <p className="mt-1 text-xs text-muted">Pilih siapa yang tidak akan melihat pesan ini lagi.</p>
            <div className="mt-3 flex flex-col gap-2">
              {canDeleteAll ? <button type="button" disabled={deleting} className="h-11 rounded-lg bg-danger px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => void deleteSelected("all")}>Hapus untuk semua orang</button> : null}
              <button type="button" disabled={deleting} className="h-11 rounded-lg border border-red-200 px-4 text-sm font-bold text-danger disabled:opacity-50" onClick={() => void deleteSelected("me")}>Hapus untuk saya</button>
              <button type="button" disabled={deleting} className="h-11 rounded-lg px-4 text-sm font-semibold" onClick={() => setDelDialog(false)}>Batal</button>
            </div>
            {!canDeleteAll ? <p className="mt-2 text-[11px] text-muted">“Hapus untuk semua orang” hanya tersedia untuk pesan milik Anda sendiri.</p> : null}
          </div>
        </div>
      ) : null}

      {seen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={() => setSeen(null)}>
          <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-bold">Info pesan</h3><button type="button" className={iconBtn} aria-label="Tutup" onClick={() => setSeen(null)}><X className="size-4" /></button></div>
            <p className="mt-2 text-xs font-bold text-slate-600">Dibaca oleh ({readers.filter((r) => r.lastReadId >= seen.id).length})</p>
            <ul className="mt-1 divide-y divide-line rounded-lg border border-line bg-white">
              {readers.filter((r) => r.lastReadId >= seen.id).map((r) => <li key={r.username} className="px-3 py-2 text-sm font-semibold">{r.name}</li>)}
              {readers.every((r) => r.lastReadId < seen.id) ? <li className="px-3 py-2 text-xs text-muted">Belum ada yang membaca.</li> : null}
            </ul>
            <p className="mt-3 text-xs font-bold text-slate-600">Belum dibaca ({readers.filter((r) => r.lastReadId < seen.id).length})</p>
            <ul className="mt-1 divide-y divide-line rounded-lg border border-line bg-white">
              {readers.filter((r) => r.lastReadId < seen.id).map((r) => <li key={r.username} className="px-3 py-2 text-sm text-slate-600">{r.name}</li>)}
              {readers.every((r) => r.lastReadId >= seen.id) ? <li className="px-3 py-2 text-xs text-muted">Semua anggota sudah membaca.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pilih barang / transaksi untuk dibagikan                            */
/* ------------------------------------------------------------------ */

function ShareModal({ type, onClose, onPick }: { type: "barang" | "transaksi"; onClose: () => void; onPick: (item: { ref: string; title: string; sub: string }) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<{ ref: string; title: string; sub: string }> | null>(null);
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      void chatShareFind({ data: { type, q } }).then((res) => { if (alive) setRows(res); }).catch((error: Error) => { if (alive) { setRows([]); toast.error(error.message); } });
    }, q ? 250 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [q, type]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{type === "barang" ? "Bagikan barang" : "Bagikan transaksi"}</h3>
          <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-slate-100" aria-label="Tutup" onClick={onClose}><X className="size-4" /></button>
        </div>
        <input autoFocus className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent" placeholder={type === "barang" ? "Cari nama, part number, atau merek" : "Cari nomor atau nama pelanggan"} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-white">
          {rows === null ? <li className="p-4 text-center text-sm text-muted">Memuat...</li> : null}
          {rows && rows.length === 0 ? <li className="p-4 text-center text-sm text-muted">Tidak ditemukan.</li> : null}
          {(rows ?? []).map((r) => (
            <li key={r.ref}>
              <button type="button" className="block w-full border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-blue-50" onClick={() => onPick(r)}>
                <span className="block break-words text-sm font-bold">{r.title}</span>
                <span className="block break-words text-xs text-muted">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
