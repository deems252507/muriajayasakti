import {
  Check, ChevronDown, Copy, CornerUpLeft, Download, FileText, Image as ImageIcon, Info, Package, Paperclip, Pencil, Pin, PinOff, Receipt, Search, Send, Trash2, X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { toast } from "sonner";
import {
  chatDeleteMessages, chatEdit, chatFileGet, chatPin, chatPost, chatReact, chatSearch, chatShareFind, chatThread, groupDeleteMessages,
} from "@/lib/shop/api";
import { dayKey, dayLabel, hhmm } from "./chat-time";

type ChatKind = "dm" | "group";
type Thread = Awaited<ReturnType<typeof chatThread>>;
export type Msg = Thread["messages"][number];
export type Person = { username: string; name: string };
type Attach = { name: string; mime: string; data: string; image: boolean };
type ShareDraft = { type: "barang" | "transaksi"; ref: string; title: string; sub: string };
type Win = { limit: number; since: number };

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
function getFile(id: number) {
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

async function resizeImage(file: File): Promise<string> {
  const src = await fileToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Gambar tidak bisa dibuka"));
    el.src = src;
  });
  const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
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
  let out = canvas.toDataURL("image/jpeg", 0.75);
  if (dataBytes(out) > MAX_FILE) out = canvas.toDataURL("image/jpeg", 0.5);
  return out;
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

async function prepareAttachment(file: File): Promise<Attach> {
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
        try { sessionStorage.setItem("mjs-find", share.ref); } catch { /* abaikan */ }
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
    if (m.deleted) return;
    longFired.current = false;
    cancel();
    timer.current = window.setTimeout(() => { longFired.current = true; p.onToggle(); }, 450);
  };
  const click = (e: ReactMouseEvent) => {
    if (m.deleted) return;
    if (longFired.current) { longFired.current = false; e.preventDefault(); return; }
    const inner = (e.target as HTMLElement).closest("[data-act]");
    if (selecting || !inner) { e.preventDefault(); p.onToggle(); }
  };
  const isImage = Boolean(m.file && m.file.mime.startsWith("image/"));
  const readCount = p.readers.filter((r) => r.lastReadId >= m.id).length;
  const tone = m.mine ? "text-white/70" : "text-muted";

  return (
    <div id={`msg-${m.id}`} className={`flex items-end rounded-lg py-0.5 ${m.mine ? "justify-end" : "justify-start"} ${selected ? "bg-blue-100/70" : ""}`}>
      {selecting && !m.mine && !m.deleted ? <PickMark on={selected} /> : null}
      <div className={`flex max-w-[82%] flex-col gap-1 ${m.mine ? "items-end" : "items-start"}`}>
        <div
          role={m.deleted ? undefined : "button"}
          onClick={click}
          onPointerDown={down}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onContextMenu={(e) => { if (longFired.current) e.preventDefault(); }}
          className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${m.deleted ? "" : "cursor-pointer select-none md:select-text"} ${m.mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-white text-ink"}`}
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
            <span>{hhmm(m.createdAt)}{kind === "dm" && m.mine && !m.deleted ? (m.read ? " · Dibaca" : " · Terkirim") : ""}</span>
            {kind === "group" && m.mine && !m.deleted && p.readers.length > 0 ? (
              <button type="button" data-act="1" className="font-semibold hover:underline" onClick={() => { if (!selecting) p.onSeen(m); }}>
                {readCount >= p.readers.length ? "· Dibaca semua" : `· Dibaca ${readCount}/${p.readers.length}`}
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
      {selecting && m.mine && !m.deleted ? <PickMark on={selected} /> : null}
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
  const [lightbox, setLightbox] = useState<{ src: string; name: string; id: number } | null>(null);
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

  const pickable = messages.filter((m) => !m.deleted).map((m) => m.id);
  const selMsgs = messages.filter((m) => sel.selected.has(m.id));
  const one = selMsgs.length === 1 ? selMsgs[0] : null;
  const canDeleteAll = selMsgs.length > 0 && selMsgs.every((m) => m.mine || (kind === "group" && moderator));

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

  async function deleteSelected() {
    const ids = [...sel.selected];
    if (!ids.length || deleting) return;
    if (!confirm(`Hapus ${ids.length} pesan ${kind === "group" ? "untuk semua anggota grup" : "untuk Anda dan lawan bicara"}? Tidak bisa dikembalikan.`)) return;
    setDeleting(true);
    try {
      const res = kind === "group" ? await groupDeleteMessages({ data: { ids } }) : await chatDeleteMessages({ data: { ids } });
      toast.success(`${res.deleted} pesan dihapus`);
      sel.clear();
      load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pesan");
    } finally {
      setDeleting(false);
    }
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
            {canDeleteAll ? <button type="button" disabled={deleting} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-bold text-white disabled:opacity-50" onClick={() => void deleteSelected()}><Trash2 className="size-4" />Hapus</button> : null}
          </div>
          {one ? (
            <div className="flex gap-1 px-3 pb-2">
              {EMOJIS.map((e) => {
                const mineOn = one.reactions.some((r) => r.emoji === e && r.mine);
                return <button key={e} type="button" className={`grid size-9 place-items-center rounded-full text-lg ${mineOn ? "bg-blue-200" : "bg-white"} shadow-sm`} onClick={() => void react(one, e)}>{e}</button>;
              })}
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
        <div ref={listRef} onScroll={onScroll} className="absolute inset-0 space-y-1 overflow-y-auto px-3 py-3">
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
                  onOpenImage={(src, name, id) => setLightbox({ src, name, id })}
                  onSeen={setSeen}
                  onReact={(msg, emoji) => void react(msg, emoji)}
                />
              </div>
            );
          })}
        </div>
        {!searchOpen && !sel.active ? (
          <button type="button" className="absolute right-3 top-2 z-10 grid size-9 place-items-center rounded-full border border-line bg-white shadow" aria-label="Cari pesan" title="Cari pesan" onClick={() => setSearchOpen(true)}><Search className="size-4" /></button>
        ) : null}
        {!atBottom ? (
          <button type="button" className="absolute bottom-3 right-3 z-10 grid size-10 place-items-center rounded-full border border-line bg-white shadow" aria-label="Ke pesan terbaru" onClick={scrollBottom}>
            <ChevronDown className="size-5" />
            {newCount > 0 ? <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{newCount}</span> : null}
          </button>
        ) : null}
      </div>

      <div className="border-t border-line">
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
              <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white" aria-label="Lampirkan" onClick={() => setMenu((v) => !v)}><Paperclip className="size-4" /></button>
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

      {lightbox ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <div className="absolute right-3 top-3 flex gap-2">
            <button type="button" className="grid size-10 place-items-center rounded-full bg-white/90" aria-label="Unduh" onClick={(e) => { e.stopPropagation(); void downloadFile(lightbox.id); }}><Download className="size-5" /></button>
            <button type="button" className="grid size-10 place-items-center rounded-full bg-white/90" aria-label="Tutup" onClick={() => setLightbox(null)}><X className="size-5" /></button>
          </div>
          <img src={lightbox.src} alt={lightbox.name} className="max-h-[88vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
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
