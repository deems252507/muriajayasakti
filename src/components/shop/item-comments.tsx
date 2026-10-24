import { MessageSquare, Reply, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { itemCommentAdd, itemCommentDelete, itemCommentList } from "@/lib/shop/api";
import { dateTime } from "@/components/shop/chat-time";

type Data = Awaited<ReturnType<typeof itemCommentList>>;
type Comment = Data["comments"][number];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Avatar({ name, photo }: { name: string; photo: string }) {
  return photo
    ? <img src={photo} alt="" className="size-8 shrink-0 rounded-full object-cover ring-1 ring-line" />
    : <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-accent">{name.slice(0, 1).toUpperCase()}</span>;
}

/** Isi komentar: @Nama disorot ungu. */
function Body({ text, names }: { text: string; names: string[] }) {
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${[...names].sort((a, b) => b.length - a.length).map(esc).join("|")}))(?![\\p{L}\\p{N}_])`, "giu");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1
          ? <span key={i} className="rounded bg-violet-100 px-1 font-bold text-violet-800">{part}</span>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}

/**
 * Jendela komentar satu barang: tulis komentar, tag Admin lain dengan @, balas, dan hapus komentar sendiri.
 * Komentar yang men-tag saya dan belum pernah dibuka diberi warna ungu + label "Untuk Anda".
 */
export function ItemComments({ kind, refId, label, onClose, onChanged }: { kind: string; refId: string; label?: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [caret, setCaret] = useState(0);
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Penanda "untuk Anda" hanya dihitung saat jendela pertama dibuka (server langsung menandai sudah dibaca).
  const firstLoad = useRef(true);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());

  function load(scroll = false) {
    void itemCommentList({ data: { kind, ref: refId, label } })
      .then((res) => {
        setData(res);
        setError("");
        if (firstLoad.current) {
          firstLoad.current = false;
          setNewIds(new Set(res.comments.filter((c) => c.taggedMeNew).map((c) => c.id)));
          onChanged();
        } else if (res.comments.some((c) => c.taggedMeNew)) {
          setNewIds((cur) => new Set([...cur, ...res.comments.filter((c) => c.taggedMeNew).map((c) => c.id)]));
          onChanged();
        }
        if (scroll) window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .catch((e: Error) => setError(e.message || "Gagal memuat komentar."));
  }
  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 8000);
    return () => window.clearInterval(timer);
  }, [kind, refId]);

  const names = useMemo(() => (data?.members ?? []).map((m) => m.name), [data]);
  const roots = (data?.comments ?? []).filter((c) => c.parentId == null);
  const repliesOf = (id: number) => (data?.comments ?? []).filter((c) => c.parentId === id);

  // Saran @nama
  const mentionQuery = useMemo(() => {
    const m = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
    return m ? m[2].toLowerCase() : null;
  }, [text, caret]);
  const suggestions = mentionQuery == null || !data
    ? []
    : data.members.filter((m) => m.username !== data.me && m.name.toLowerCase().includes(mentionQuery)).slice(0, 6);
  function pick(name: string) {
    const before = text.slice(0, caret).replace(/@[^\s@]*$/, `@${name} `);
    const next = before + text.slice(caret);
    setText(next);
    window.setTimeout(() => { boxRef.current?.focus(); boxRef.current?.setSelectionRange(before.length, before.length); setCaret(before.length); }, 0);
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await itemCommentAdd({ data: { kind, ref: refId, label, body, parentId: replyTo?.id ?? null } });
      setText("");
      setReplyTo(null);
      load(true);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function remove(c: Comment) {
    const hasReplies = c.parentId == null && repliesOf(c.id).length > 0;
    if (!confirm(hasReplies ? "Hapus komentar ini beserta semua balasannya?" : "Hapus komentar ini?")) return;
    void itemCommentDelete({ data: { id: c.id } })
      .then(() => { if (replyTo?.id === c.id) setReplyTo(null); load(); onChanged(); })
      .catch((e: Error) => toast.error(e.message));
  }

  function Card({ c, reply }: { c: Comment; reply?: boolean }) {
    const fresh = newIds.has(c.id);
    return (
      <div className={`rounded-xl border p-3 ${fresh ? "border-violet-400 bg-violet-50 ring-2 ring-violet-300" : c.mine ? "border-blue-100 bg-blue-50/50" : "border-slate-200 bg-white"} ${reply ? "ml-6" : ""}`}>
        <div className="flex items-start gap-2">
          <Avatar name={c.authorName} photo={c.authorPhoto} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-extrabold text-slate-900">{c.authorName}</span>
              <span className="text-[11px] text-slate-500">{dateTime(c.createdAt)}</span>
              {fresh ? <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Untuk Anda</span> : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-snug text-slate-800"><Body text={c.body} names={names} /></p>
            <div className="mt-2 flex gap-2">
              {data?.canComment ? <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => { setReplyTo(c); setText((t) => (t.startsWith(`@${c.authorName} `) || c.mine ? t : `@${c.authorName} ${t}`)); window.setTimeout(() => boxRef.current?.focus(), 0); }}>
                <Reply className="h-3.5 w-3.5" /> Balas
              </button> : null}
              {c.mine ? (
                <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-xs font-semibold text-danger hover:bg-red-50" onClick={() => remove(c)}>
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-panel sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-700"><MessageSquare className="h-3.5 w-3.5" /> Komentar · {data?.target.kindName ?? ""}</p>
            <p className="truncate text-sm font-extrabold text-slate-900">{data?.target.label ?? label ?? "Memuat..."}</p>
            {data?.target.sub ? <p className="truncate font-mono text-[11px] text-slate-500">{data.target.sub}</p> : null}
          </div>
          <button type="button" aria-label="Tutup" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-[160px] flex-1 space-y-3 overflow-y-auto p-4">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {data && roots.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Belum ada komentar. Tulis catatan di bawah supaya Admin lain tidak perlu bertanya lagi, ketik @ untuk men-tag.</p> : null}
          {roots.map((c) => (
            <div key={c.id} className="space-y-2">
              <Card c={c} />
              {repliesOf(c.id).map((r) => <Card key={r.id} c={r} reply />)}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {!data ? null : !data.canComment ? <p className="border-t border-line bg-white p-3 text-center text-xs text-slate-500">Hanya Admin yang dapat menulis komentar.</p> : <div className="relative border-t border-line bg-white p-3">
          {suggestions.length > 0 ? (
            <ul className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
              {suggestions.map((m) => (
                <li key={m.username}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m.name)}>
                    <Avatar name={m.name} photo={m.photo} /> <span className="font-semibold">@{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {replyTo ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs text-violet-800">
              <span className="truncate">Membalas <b>{replyTo.authorName}</b>: {replyTo.body}</span>
              <button type="button" aria-label="Batal membalas" className="shrink-0 font-bold" onClick={() => setReplyTo(null)}>×</button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={boxRef}
              rows={2}
              maxLength={1000}
              value={text}
              placeholder="Tulis komentar... (ketik @ untuk men-tag Admin lain)"
              className="min-h-[44px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
              onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }}
              onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions.length > 0) { e.preventDefault(); pick(suggestions[0].name); return; }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); }
              }}
            />
            <button type="button" aria-label="Kirim komentar" disabled={sending || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40" onClick={() => void send()}>
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>}
      </div>
    </div>
  );
}
