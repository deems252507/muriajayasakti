import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { chatContacts, chatMessages, chatSend } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/chat")({ component: ChatPage });

type Contact = Awaited<ReturnType<typeof chatContacts>>[number];
type Message = Awaited<ReturnType<typeof chatMessages>>[number];

const TZ = "Asia/Makassar";
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(".", ":");
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
function dayLabel(iso: string) {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return "Hari ini";
  if (key === dayKey(new Date(Date.now() - 86400000).toISOString())) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function listTime(iso: string) {
  if (!iso) return "";
  return dayKey(iso) === dayKey(new Date().toISOString())
    ? hhmm(iso)
    : new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "short" });
}

const roleStyle: Record<string, string> = {
  Owner: "bg-purple-100 text-purple-800",
  Admin: "bg-blue-100 text-blue-800",
  Kasir: "bg-emerald-100 text-emerald-800",
};

function Avatar({ c, size = "size-10" }: { c: Pick<Contact, "name" | "photo">; size?: string }) {
  return c.photo
    ? <img src={c.photo} alt="" className={`${size} shrink-0 rounded-full object-cover ring-1 ring-line`} />
    : <span className={`${size} grid shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-accent`}>{c.name.slice(0, 1).toUpperCase()}</span>;
}

function ChatPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [active, setActive] = useState<string>(() => { try { return sessionStorage.getItem("mjs-chat-with") || ""; } catch { return ""; } });
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const signature = useRef("");
  const activeRef = useRef(active);
  activeRef.current = active;

  const loadContacts = useCallback(() => {
    void chatContacts().then(setContacts).catch(() => undefined);
  }, []);

  const loadMessages = useCallback((who: string, force = false) => {
    if (!who) return;
    void chatMessages({ data: { with: who } }).then((rows) => {
      if (activeRef.current !== who) return;
      const sig = rows.map((r) => `${r.id}${r.read ? "r" : ""}`).join(",");
      if (force || sig !== signature.current) {
        signature.current = sig;
        setMessages(rows);
      }
      window.dispatchEvent(new Event("mjs-chat"));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadContacts();
    const timer = window.setInterval(() => { if (!document.hidden) loadContacts(); }, 5000);
    return () => window.clearInterval(timer);
  }, [loadContacts]);

  useEffect(() => {
    try { sessionStorage.setItem("mjs-chat-with", active); } catch { /* abaikan */ }
    signature.current = "";
    setMessages([]);
    if (!active) return;
    loadMessages(active, true);
    const timer = window.setInterval(() => { if (!document.hidden) loadMessages(active); }, 3000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, active]);

  const current = contacts?.find((c) => c.username === active) ?? null;
  // Staff yang dipilih tapi sudah tidak aktif / tidak ada: kembali ke daftar.
  useEffect(() => { if (contacts && active && !current) setActive(""); }, [contacts, active, current]);

  async function send() {
    const body = text.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      await chatSend({ data: { to: active, body } });
      setText("");
      loadMessages(active, true);
      loadContacts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  }

  const shown = (contacts ?? []).filter((c) => !filter.trim() || `${c.name} ${c.role} ${c.username}`.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-panel shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <div className="grid h-[calc(100vh-9.5rem)] min-h-[420px] md:grid-cols-[320px_1fr]">
        <aside className={`min-h-0 flex-col border-r border-line ${active ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-line p-3">
            <h2 className="font-extrabold">Chat Staff</h2>
            <p className="text-xs text-muted">Pesan pribadi antar Owner, Admin, dan Kasir.</p>
            <input className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent" placeholder="Cari nama staff" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {contacts === null ? <li className="p-4 text-center text-sm text-muted">Memuat...</li> : null}
            {contacts && shown.length === 0 ? <li className="p-4 text-center text-sm text-muted">Tidak ada staff lain.</li> : null}
            {shown.map((c) => (
              <li key={c.username}>
                <button type="button" onClick={() => setActive(c.username)} className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left hover:bg-blue-50 ${active === c.username ? "bg-blue-50" : ""}`}>
                  <Avatar c={c} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{c.name}</p>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${roleStyle[c.role] ?? "bg-slate-100 text-slate-700"}`}>{c.role}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{listTime(c.lastAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={`truncate text-xs ${c.unread ? "font-semibold text-slate-900" : "text-muted"}`}>{c.lastBody ? `${c.lastMine ? "Anda: " : ""}${c.lastBody}` : "Belum ada pesan"}</p>
                      {c.unread > 0 ? <span className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{c.unread}</span> : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={`min-h-0 flex-col ${active ? "flex" : "hidden md:flex"}`}>
          {current ? (
            <>
              <div className="flex items-center gap-3 border-b border-line p-3">
                <button type="button" className="grid size-10 place-items-center rounded-lg border border-line md:hidden" onClick={() => setActive("")} aria-label="Kembali"><ArrowLeft className="size-4" /></button>
                <Avatar c={current} size="size-9" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{current.name}</p>
                  <p className="text-[11px] text-muted">{current.role}</p>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-slate-50 px-3 py-3">
                {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted">Belum ada pesan. Tulis pesan pertama untuk {current.name}.</p> : null}
                {messages.map((m, i) => {
                  const newDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
                  return (
                    <div key={m.id}>
                      {newDay ? <p className="my-2 text-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-muted shadow-sm">{dayLabel(m.createdAt)}</span></p> : null}
                      <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-white text-ink"}`}>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`mt-0.5 text-right text-[10px] ${m.mine ? "text-white/70" : "text-muted"}`}>{hhmm(m.createdAt)}{m.mine ? (m.read ? " · Dibaca" : " · Terkirim") : ""}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                <textarea
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
                  rows={1}
                  maxLength={2000}
                  placeholder={`Tulis pesan untuk ${current.name}...`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                />
                <button type="submit" disabled={sending || !text.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-50" aria-label="Kirim"><Send className="size-4" /></button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted">Pilih staff di daftar untuk mulai chat.</div>
          )}
        </section>
      </div>
    </section>
  );
}
