import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, Check, ChevronDown, Copy, FileText, Paperclip, Pencil, Pin, PinOff, Reply, Search, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  chatAttachment, chatDeleteMessages, chatEditMessage, chatMessages, chatPin, chatReact, chatSearch, chatSend,
  groupDeleteMessages, groupMessages, groupSend, type ChatAtt,
} from "@/lib/shop/api";
import { PickMark, SelectBar, dayKey, dayLabel, hhmm, useSelection, type StaffPerson } from "./chat-ui";
import { RefIcon, openRef } from "./chat-share";

type Scope = "dm" | "g";
type Page = Awaited<ReturnType<typeof chatMessages>>;
type Msg = Page["rows"][number];
type Draft = ChatAtt & { size: number; preview: string };

const EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];
const PAGE = 60;
const MAX_FILE = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Lampiran: kompres foto, baca file, muat isi lampiran
// ---------------------------------------------------------------------------

const extMime: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", xls: "application/vnd.ms-excel", csv: "text/csv", txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File tidak bisa dibaca."));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File): Promise<Draft> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gambar tidak bisa dibaca."));
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gambar tidak bisa diproses.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    const base = (file.name || "foto").replace(/\.[^.]+$/, "") || "foto";
    return { name: `${base}.jpg`, type: "image/jpeg", data: dataUrl.split(",")[1] ?? "", size: Math.floor((dataUrl.length * 3) / 4), preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareFile(file: File): Promise<Draft> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const type = file.type || extMime[ext] || "";
  if (type.startsWith("image/") && type !== "image/gif") return compressImage(file);
  if (file.size > MAX_FILE) throw new Error("File terlalu besar (maksimal 2 MB).");
  if (!type) throw new Error("Jenis file tidak dikenal.");
  const dataUrl = await readAsDataUrl(file);
  return { name: file.name || "file", type, data: dataUrl.split(",")[1] ?? "", size: file.size, preview: type.startsWith("image/") ? dataUrl : "" };
}

const attCache = new Map<string, Promise<ChatAtt>>();
function loadAttachment(scope: Scope, id: number) {
  const key = `${scope}:${id}`;
  let hit = attCache.get(key);
  if (!hit) {
    hit = chatAttachment({ data: { scope, id } }) as Promise<ChatAtt>;
    hit.catch(() => attCache.delete(key));
    attCache.set(key, hit);
  }
  return hit;
}

function saveBase64(att: ChatAtt) {
  const bin = atob(att.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: att.type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = att.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Attachment({ scope, msg, onImage }: { scope: Scope; msg: Msg; onImage: (src: string, name: string) => void }) {
  const att = msg.att;
  const isImage = Boolean(att?.type.startsWith("image/"));
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let live = true;
    void loadAttachment(scope, msg.id).then((res) => { if (live) setSrc(`data:${res.type};base64,${res.data}`); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [scope, msg.id, isImage]);

  if (!att) return null;
  if (isImage) {
    return src ? (
      <img src={src} alt={att.name} className="mb-1 max-h-60 max-w-full cursor-zoom-in rounded-lg object-cover" onClick={(e) => { e.stopPropagation(); onImage(src, att.name); }} />
    ) : (
      <div className="mb-1 grid h-28 w-44 place-items-center rounded-lg bg-black/10 text-xs">{failed ? "Foto gagal dimuat" : "Memuat foto..."}</div>
    );
  }
  return (
    <button
      type="button"
      className="mb-1 flex w-full items-center gap-2 rounded-lg bg-black/10 px-2 py-2 text-left"
      onClick={(e) => {
        e.stopPropagation();
        void loadAttachment(scope, msg.id).then(saveBase64).catch(() => toast.error("File gagal diunduh."));
      }}
    >
      <FileText className="size-6 shrink-0" />
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{att.name}</span><span className="text-[10px] opacity-70">{sizeLabel(att.size)} · ketuk untuk unduh</span></span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Isi pesan: link bisa diklik, @nama disorot
// ---------------------------------------------------------------------------

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function renderBody(body: string, names: string[], mine: boolean) {
  const parts = ["(https?:\\/\\/[^\\s<>\"']+)"];
  if (names.length) parts.push(`(@(?:${[...names].sort((a, b) => b.length - a.length).map(esc).join("|")}))`);
  const re = new RegExp(parts.join("|"), "g");
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(body.slice(last, idx));
    if (m[1]) {
      const trail = m[1].match(/[.,;:!?)\]]+$/)?.[0] ?? "";
      const url = trail ? m[1].slice(0, -trail.length) : m[1];
      out.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="break-all underline" onClick={(e) => e.stopPropagation()}>{url}</a>);
      if (trail) out.push(trail);
    } else {
      out.push(<span key={key++} className={`rounded px-0.5 font-bold ${mine ? "bg-white/25" : "bg-blue-100 text-accent"}`}>{m[2]}</span>);
    }
    last = idx + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// Percakapan (dipakai chat pribadi dan chat grup)
// ---------------------------------------------------------------------------

export function Thread(props: { scope: Scope; target: string; name: string; meUsername: string; moderator?: boolean; members?: StaffPerson[]; onChanged: () => void }) {
  const { scope, target, name, meUsername, moderator = false, members = [] } = props;
  const navigate = useNavigate();
  const draftKey = `mjs-chat-draft:${scope}:${target}`;

  const [page, setPage] = useState<Page | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [fromId, setFromId] = useState(0);
  const [text, setText] = useState(() => { try { return localStorage.getItem(draftKey) ?? ""; } catch { return ""; } });
  const [caret, setCaret] = useState(0);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reply, setReply] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [att, setAtt] = useState<Draft | null>(null);
  const [menu, setMenu] = useState<Msg | null>(null);
  const [readInfo, setReadInfo] = useState<Msg | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const [dividerId, setDividerId] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [showDown, setShowDown] = useState(false);
  const [flashId, setFlashId] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sq, setSq] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; text: string; createdAt: string }>>([]);
  const [pinIdx, setPinIdx] = useState(0);
  const sel = useSelection();

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef("");
  const limitRef = useRef(limit);
  const fromRef = useRef(fromId);
  const changedRef = useRef(props.onChanged);
  changedRef.current = props.onChanged;
  const initRef = useRef(false);
  const prevLastRef = useRef(0);
  const anchorRef = useRef<number | null>(null);
  const jumpRef = useRef(0);
  const toBottomRef = useRef(false);
  const atBottomRef = useRef(true);
  const savedDraft = useRef("");

  const load = useCallback(() => {
    const opts = { limit: limitRef.current, fromId: fromRef.current };
    const req = scope === "dm" ? chatMessages({ data: { with: target, ...opts } }) : groupMessages({ data: { id: Number(target), ...opts } });
    void req.then((res) => {
      if (opts.limit !== limitRef.current || opts.fromId !== fromRef.current) return;
      const sig = JSON.stringify([res.rows, res.pins, res.hasMore]);
      if (sig !== sigRef.current) { sigRef.current = sig; setPage(res); }
      window.dispatchEvent(new Event("mjs-chat"));
      changedRef.current();
    }).catch(() => undefined);
  }, [scope, target]);

  useEffect(() => {
    limitRef.current = limit;
    fromRef.current = fromId;
    sigRef.current = "";
    load();
  }, [limit, fromId, load]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Draft: simpan terus, pulih saat chat dibuka lagi.
  useEffect(() => {
    if (editing) return;
    try { if (text) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); } catch { /* abaikan */ }
  }, [text, editing, draftKey]);

  const rows = page?.rows ?? [];
  const groupNames = useMemo(() => (scope === "g" ? members.map((m) => m.name).filter(Boolean) : []), [scope, members]);

  // Posisi gulir: jangan loncat ke bawah kalau sedang membaca pesan lama.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !page) return;
    const lastId = page.rows.length ? page.rows[page.rows.length - 1].id : 0;
    if (!initRef.current) {
      initRef.current = true;
      prevLastRef.current = lastId;
      if (page.firstUnreadId && page.rows.some((r) => r.id === page.firstUnreadId)) {
        setDividerId(page.firstUnreadId);
        window.requestAnimationFrame(() => document.getElementById("unread-divider")?.scrollIntoView({ block: "start" }));
      } else {
        box.scrollTop = box.scrollHeight;
      }
      return;
    }
    if (toBottomRef.current) { toBottomRef.current = false; box.scrollTop = box.scrollHeight; prevLastRef.current = lastId; setNewCount(0); return; }
    if (anchorRef.current != null) { box.scrollTop += box.scrollHeight - anchorRef.current; anchorRef.current = null; return; }
    if (jumpRef.current) {
      const el = document.getElementById(`m-${jumpRef.current}`);
      if (el) { el.scrollIntoView({ block: "center" }); setFlashId(jumpRef.current); window.setTimeout(() => setFlashId(0), 1600); jumpRef.current = 0; }
      prevLastRef.current = Math.max(prevLastRef.current, lastId);
      return;
    }
    if (lastId > prevLastRef.current) {
      const fresh = page.rows.filter((r) => r.id > prevLastRef.current);
      if (atBottomRef.current || fresh.some((r) => r.mine)) {
        box.scrollTop = box.scrollHeight;
      } else {
        const incoming = fresh.filter((r) => !r.mine);
        if (incoming.length) { setNewCount((c) => c + incoming.length); setDividerId((d) => d || incoming[0].id); }
      }
      prevLastRef.current = lastId;
    }
  }, [page]);

  function onScroll() {
    const box = boxRef.current;
    if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    atBottomRef.current = near;
    setShowDown(!near || fromRef.current > 0);
    if (near) setNewCount(0);
  }

  function flash(id: number) { setFlashId(id); window.setTimeout(() => setFlashId(0), 1600); }

  function jumpTo(id: number) {
    const el = document.getElementById(`m-${id}`);
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); flash(id); return; }
    jumpRef.current = id;
    setLimit(30);
    setFromId(id);
  }

  function goBottom() {
    const box = boxRef.current;
    if (fromRef.current > 0) { toBottomRef.current = true; setLimit(PAGE); setFromId(0); return; }
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    setNewCount(0);
  }

  function loadOlder() {
    anchorRef.current = boxRef.current?.scrollHeight ?? null;
    setLimit((n) => n + 100);
  }

  // Cari di dalam percakapan.
  useEffect(() => {
    const term = sq.trim();
    if (term.length < 2) { setResults([]); return; }
    const timer = window.setTimeout(() => {
      void chatSearch({ data: { scope, target, q: term } }).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [sq, scope, target]);

  // Sebut nama (@) khusus grup.
  const mentionQuery = useMemo(() => {
    if (scope !== "g") return null;
    const m = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
    return m ? m[2] : null;
  }, [scope, text, caret]);
  const suggestions = mentionQuery == null ? [] : members.filter((m) => m.username !== meUsername && m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);

  function pickMention(person: StaffPerson) {
    const before = text.slice(0, caret).replace(/@[^\s@]*$/, `@${person.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setCaret(before.length);
    window.requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(before.length, before.length); });
  }

  function mentionedUsers(body: string) {
    let work = body;
    const found: string[] = [];
    for (const m of [...members].filter((x) => x.username !== meUsername).sort((a, b) => b.name.length - a.name.length)) {
      const tag = `@${m.name}`;
      if (work.includes(tag)) { found.push(m.username); work = work.split(tag).join(" "); }
    }
    return found;
  }

  async function attach(file: File | undefined | null) {
    if (!file) return;
    try { setAtt(await prepareFile(file)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "File tidak bisa dipakai."); }
  }

  function startEdit(m: Msg) {
    savedDraft.current = text;
    setReply(null);
    setAtt(null);
    setEditing(m);
    setText(m.body);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function stopEdit() {
    setEditing(null);
    setText(savedDraft.current);
    savedDraft.current = "";
  }

  async function send() {
    const body = text.trim();
    if (sending) return;
    if (editing) {
      if (!body && !editing.att) return toast.error("Pesan kosong. Pakai Hapus kalau ingin membuang pesan.");
      setSending(true);
      try {
        await chatEditMessage({ data: { scope, id: editing.id, body } });
        stopEdit();
        load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal mengubah pesan");
      } finally {
        setSending(false);
      }
      return;
    }
    if (!body && !att) return;
    setSending(true);
    try {
      const payload = {
        body,
        replyTo: reply?.id ?? null,
        att: att ? { name: att.name, type: att.type, data: att.data } : null,
        mentions: scope === "g" ? mentionedUsers(body) : [],
      };
      if (scope === "dm") await chatSend({ data: { to: target, ...payload } });
      else await groupSend({ data: { id: Number(target), ...payload } });
      setText("");
      setReply(null);
      setAtt(null);
      try { localStorage.removeItem(draftKey); } catch { /* abaikan */ }
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  }

  const canPick = (m: Msg) => !m.deleted && (m.mine || (scope === "g" && moderator));
  const pickable = rows.filter(canPick).map((m) => m.id);

  async function deleteIds(ids: number[]) {
    if (!ids.length || deleting) return;
    const note = scope === "dm" ? "Pesan hilang untuk Anda dan lawan bicara." : "Pesan hilang untuk semua anggota grup. Tidak bisa dikembalikan.";
    if (!confirm(`Hapus ${ids.length} pesan? ${note}`)) return;
    setDeleting(true);
    try {
      const res = scope === "dm" ? await chatDeleteMessages({ data: { ids } }) : await groupDeleteMessages({ data: { ids } });
      toast.success(`${res.deleted} pesan dihapus`);
      sel.clear();
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pesan");
    } finally {
      setDeleting(false);
    }
  }

  async function react(m: Msg, emoji: string) {
    try { await chatReact({ data: { scope, id: m.id, emoji } }); load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Gagal memberi reaksi"); }
  }

  async function togglePin(m: Msg) {
    try { await chatPin({ data: { scope, id: m.id, pin: !m.pinned } }); load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Gagal menyematkan pesan"); }
  }

  const pins = page?.pins ?? [];
  const pin = pins.length ? pins[pinIdx % pins.length] : null;

  return (
    <>
      <div className="relative border-b border-line bg-white px-3 py-1.5">
        <div className="flex items-center gap-2">
          {pin ? (
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-left" onClick={() => { jumpTo(pin.id); setPinIdx((i) => i + 1); }}>
              <Pin className="size-3.5 shrink-0 text-amber-700" />
              <span className="min-w-0 flex-1 truncate text-xs"><b>{pin.name}</b> · {pin.text}</span>
              {pins.length > 1 ? <span className="shrink-0 text-[10px] font-bold text-amber-800">{(pinIdx % pins.length) + 1}/{pins.length}</span> : null}
            </button>
          ) : <span className="flex-1 text-[11px] text-muted">{scope === "g" ? "Chat grup" : "Chat pribadi"}</span>}
          <button type="button" aria-label="Cari di percakapan" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line" onClick={() => { setSearchOpen((v) => !v); setSq(""); setResults([]); }}><Search className="size-4" /></button>
        </div>
        {searchOpen ? (
          <div className="mt-1.5">
            <input autoFocus className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent" placeholder="Cari kata di percakapan ini (minimal 2 huruf)" value={sq} onChange={(e) => setSq(e.target.value)} />
            {sq.trim().length >= 2 ? (
              <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-white">
                {results.length === 0 ? <li className="px-3 py-3 text-center text-xs text-muted">Tidak ada pesan yang cocok.</li> : null}
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="block w-full border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-blue-50" onClick={() => { setSearchOpen(false); setSq(""); jumpTo(r.id); }}>
                      <p className="text-[11px] text-muted">{r.name} · {dayLabel(r.createdAt)} {hhmm(r.createdAt)}</p>
                      <p className="truncate text-sm">{r.text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {sel.active ? <SelectBar count={sel.selected.size} total={pickable.length} busy={deleting} onCancel={sel.clear} onAll={() => sel.setAll(pickable)} onDelete={() => void deleteIds([...sel.selected])} /> : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={boxRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-slate-50 px-3 py-3">
          {page?.hasMore ? <p className="text-center"><button type="button" className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-accent shadow-sm" onClick={loadOlder}>Muat pesan lebih lama</button></p> : null}
          {page && rows.length === 0 ? <p className="py-10 text-center text-sm text-muted">{scope === "g" ? "Belum ada pesan di grup ini." : `Belum ada pesan. Tulis pesan pertama untuk ${name}.`}</p> : null}
          {!page ? <p className="py-10 text-center text-sm text-muted">Memuat pesan...</p> : null}
          {rows.map((m, i) => {
            const newDay = i === 0 || dayKey(rows[i - 1].createdAt) !== dayKey(m.createdAt);
            const showName = scope === "g" && !m.mine && (newDay || rows[i - 1].mine || rows[i - 1].name !== m.name);
            const pick = canPick(m);
            const on = sel.selected.has(m.id);
            const total = m.readers.length + m.pending.length;
            const status = m.mine && !m.deleted
              ? scope === "dm"
                ? (m.read ? "Dibaca" : "Terkirim")
                : total === 0 ? "" : m.pending.length === 0 ? "Dibaca semua" : m.readers.length ? `Dibaca ${m.readers.length}/${total}` : "Terkirim"
              : "";
            return (
              <div key={m.id} id={`m-${m.id}`}>
                {m.id === dividerId && !m.mine ? <p id="unread-divider" className="my-2 flex items-center gap-2 text-[11px] font-bold text-accent"><span className="h-px flex-1 bg-accent/30" />Pesan baru<span className="h-px flex-1 bg-accent/30" /></p> : null}
                {newDay ? <p className="my-2 text-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-muted shadow-sm">{dayLabel(m.createdAt)}</span></p> : null}
                <div className={`flex rounded-lg py-0.5 transition-colors ${m.mine ? "justify-end" : "justify-start"} ${on ? "bg-blue-100/70" : ""} ${flashId === m.id ? "bg-amber-100" : ""}`}>
                  {sel.active && pick && !m.mine ? <PickMark on={on} /> : null}
                  <div className={`max-w-[82%] ${m.mine ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      onClick={sel.active && pick ? () => sel.toggle(m.id) : undefined}
                      className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${sel.active && pick ? "cursor-pointer select-none" : ""} ${m.mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-white text-ink"} ${m.mentionsMe ? "ring-2 ring-amber-400" : ""}`}
                    >
                      {showName ? <p className="mb-0.5 text-[11px] font-bold text-accent">{m.name}</p> : null}
                      {m.deleted ? <p className="italic opacity-70">Pesan ini telah dihapus</p> : (
                        <>
                          {m.reply ? (
                            <button type="button" className={`mb-1 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs ${m.mine ? "border-white/70 bg-white/15" : "border-accent bg-slate-100"}`} onClick={(e) => { e.stopPropagation(); jumpTo(m.reply!.id); }}>
                              <span className="block truncate font-bold">{m.reply.name || "Pesan"}</span>
                              <span className="block truncate opacity-80">{m.reply.text || "Pesan"}</span>
                            </button>
                          ) : null}
                          <Attachment scope={scope} msg={m} onImage={(src, nm) => setLightbox({ src, name: nm })} />
                          {m.ref ? (
                            <button type="button" className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${m.mine ? "bg-white/15" : "bg-slate-100"}`} onClick={(e) => { e.stopPropagation(); openRef(m.ref!, navigate as never); }}>
                              <RefIcon type={m.ref.type} className="size-5 shrink-0" />
                              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{m.ref.label}</span><span className="text-[10px] opacity-70">Ketuk untuk membuka datanya</span></span>
                            </button>
                          ) : null}
                          {m.body ? <p className="whitespace-pre-wrap break-words">{renderBody(m.body, groupNames, m.mine)}</p> : null}
                        </>
                      )}
                      <p className={`mt-0.5 flex items-center justify-end gap-1.5 text-[10px] ${m.mine ? "text-white/70" : "text-muted"}`}>
                        {m.pinned ? <Pin className="size-3" /> : null}
                        {m.edited ? <span>diedit</span> : null}
                        <span>{hhmm(m.createdAt)}</span>
                        {status ? (scope === "g" && total > 0
                          ? <button type="button" className="underline decoration-dotted" onClick={(e) => { e.stopPropagation(); setReadInfo(m); }}>{status}</button>
                          : <span>{status}</span>) : null}
                        {!m.deleted && !sel.active ? <button type="button" aria-label="Menu pesan" className="grid size-5 place-items-center rounded hover:bg-black/10" onClick={(e) => { e.stopPropagation(); setMenu(m); }}><ChevronDown className="size-3.5" /></button> : null}
                      </p>
                    </div>
                    {m.reactions.length ? (
                      <div className="-mt-1 flex flex-wrap gap-1 px-1">
                        {m.reactions.map((r) => (
                          <button key={r.emoji} type="button" className={`rounded-full border px-1.5 py-0.5 text-[11px] shadow-sm ${r.mine ? "border-accent bg-blue-50" : "border-line bg-white"}`} onClick={() => void react(m, r.emoji)}>{r.emoji} {r.count}</button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {sel.active && pick && m.mine ? <PickMark on={on} /> : null}
                </div>
              </div>
            );
          })}
        </div>
        {showDown ? (
          <button type="button" aria-label="Ke pesan terbaru" className="absolute bottom-3 right-4 grid size-10 place-items-center rounded-full border border-line bg-white shadow-lg" onClick={goBottom}>
            <ArrowDown className="size-5" />
            {newCount > 0 ? <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{newCount}</span> : null}
          </button>
        ) : null}
      </div>

      <div className="relative border-t border-line p-3">
        {suggestions.length ? (
          <ul className="absolute inset-x-3 bottom-full z-10 mb-1 max-h-48 overflow-y-auto rounded-xl border border-line bg-white shadow-lg">
            {suggestions.map((s) => (
              <li key={s.username}><button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50" onMouseDown={(e) => { e.preventDefault(); pickMention(s); }}><b>{s.name}</b><span className="text-[11px] text-muted">{s.role}</span></button></li>
            ))}
          </ul>
        ) : null}
        {editing ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs"><Pencil className="size-3.5 text-amber-700" /><span className="flex-1 font-bold">Mengedit pesan</span><button type="button" aria-label="Batal edit" onClick={stopEdit}><X className="size-4" /></button></div>
        ) : null}
        {reply && !editing ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-accent bg-slate-100 px-3 py-1.5 text-xs">
            <Reply className="size-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1"><b className="block truncate">{reply.mine ? "Anda" : reply.name || name}</b><span className="block truncate text-muted">{reply.body || (reply.att ? (reply.att.type.startsWith("image/") ? "Foto" : reply.att.name) : reply.ref?.label ?? "")}</span></span>
            <button type="button" aria-label="Batal balas" onClick={() => setReply(null)}><X className="size-4" /></button>
          </div>
        ) : null}
        {att && !editing ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-slate-50 px-2 py-1.5 text-xs">
            {att.preview ? <img src={att.preview} alt="" className="size-12 rounded object-cover" /> : <FileText className="size-8 shrink-0 text-slate-500" />}
            <span className="min-w-0 flex-1"><b className="block truncate">{att.name}</b><span className="text-muted">{sizeLabel(att.size)}</span></span>
            <button type="button" aria-label="Buang lampiran" onClick={() => setAtt(null)}><X className="size-4" /></button>
          </div>
        ) : null}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ""; }} />
          {!editing ? <button type="button" aria-label="Lampirkan foto atau file" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-slate-600" onClick={() => fileRef.current?.click()}><Paperclip className="size-4" /></button> : null}
          <textarea
            ref={inputRef}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
            rows={1}
            maxLength={2000}
            placeholder={scope === "g" ? `Tulis pesan ke ${name || "grup"}... (ketik @ untuk menyebut nama)` : `Tulis pesan untuk ${name}...`}
            value={text}
            onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }}
            onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f && !editing) { e.preventDefault(); void attach(f); } }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } if (e.key === "Escape" && editing) stopEdit(); }}
          />
          <button type="submit" disabled={sending || (!text.trim() && !att)} className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-50" aria-label="Kirim">{editing ? <Check className="size-4" /> : <Send className="size-4" />}</button>
        </form>
      </div>

      {menu ? (
        <div className="fixed inset-0 z-[65] grid place-items-center bg-ink/40 p-4" onClick={() => setMenu(null)}>
          <div className="w-full max-w-xs overflow-hidden rounded-2xl bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between gap-1 border-b border-line p-3">
              {EMOJIS.map((em) => <button key={em} type="button" className="grid size-10 place-items-center rounded-full text-xl hover:bg-blue-50" onClick={() => { void react(menu, em); setMenu(null); }}>{em}</button>)}
            </div>
            <p className="truncate border-b border-line px-4 py-2 text-xs text-muted">{menu.body || menu.att?.name || menu.ref?.label || "Pesan"}</p>
            <ul className="py-1 text-sm">
              <li><button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-blue-50" onClick={() => { setReply(menu); setEditing(null); setMenu(null); window.requestAnimationFrame(() => inputRef.current?.focus()); }}><Reply className="size-4" />Balas</button></li>
              {menu.body ? <li><button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-blue-50" onClick={() => { void navigator.clipboard?.writeText(menu.body).then(() => toast.success("Pesan disalin")).catch(() => toast.error("Tidak bisa menyalin")); setMenu(null); }}><Copy className="size-4" />Salin teks</button></li> : null}
              <li><button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-blue-50" onClick={() => { void togglePin(menu); setMenu(null); }}>{menu.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{menu.pinned ? "Lepas sematan" : "Sematkan"}</button></li>
              {menu.mine ? <li><button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-blue-50" onClick={() => { startEdit(menu); setMenu(null); }}><Pencil className="size-4" />Edit</button></li> : null}
              {canPick(menu) ? <li><button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-blue-50" onClick={() => { sel.toggle(menu.id); setMenu(null); }}><Check className="size-4" />Pilih beberapa</button></li> : null}
              {canPick(menu) ? <li><button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-danger hover:bg-red-50" onClick={() => { const id = menu.id; setMenu(null); void deleteIds([id]); }}><Trash2 className="size-4" />Hapus</button></li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      {readInfo ? (
        <div className="fixed inset-0 z-[65] grid place-items-center bg-ink/40 p-4" onClick={() => setReadInfo(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-panel p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">Dibaca oleh</h3>
            <p className="mt-2 text-sm">{readInfo.readers.length ? readInfo.readers.join(", ") : "Belum ada"}</p>
            {readInfo.pending.length ? <><h3 className="mt-3 font-bold">Belum membaca</h3><p className="mt-1 text-sm">{readInfo.pending.join(", ")}</p></> : null}
            <div className="mt-4 text-right"><button type="button" className="h-10 rounded-lg bg-slate-800 px-4 text-sm font-bold text-white" onClick={() => setReadInfo(null)}>Tutup</button></div>
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt={lightbox.name} className="max-h-[88dvh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="absolute right-4 top-4 flex gap-2">
            <a href={lightbox.src} download={lightbox.name} className="rounded-lg bg-white px-3 py-2 text-xs font-bold" onClick={(e) => e.stopPropagation()}>Unduh</a>
            <button type="button" className="grid size-9 place-items-center rounded-lg bg-white" aria-label="Tutup" onClick={() => setLightbox(null)}><X className="size-4" /></button>
          </div>
        </div>
      ) : null}
    </>
  );
}
