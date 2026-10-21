import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Plus, Send, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, GroupFormModal, GroupPanel, PickMark, SelectBar, dayKey, dayLabel, hhmm, listTime, roleStyle, useSelection } from "@/components/shop/chat-group";
import { chatContacts, chatDeleteMessages, chatMessages, chatSend, groupList } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/chat")({ component: ChatPage });

type Contact = Awaited<ReturnType<typeof chatContacts>>[number];
type Message = Awaited<ReturnType<typeof chatMessages>>[number];

type Group = Awaited<ReturnType<typeof groupList>>[number];

function ChatPage() {
  const me = Route.useRouteContext().me;
  const canMakeGroup = me.role === "Admin" || me.role === "Owner";
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<string>(() => { try { return sessionStorage.getItem("mjs-chat-with") || ""; } catch { return ""; } });
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sel = useSelection();
  const [filter, setFilter] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const signature = useRef("");
  const activeRef = useRef(active);
  activeRef.current = active;
  const groupId = active.startsWith("g:") ? Number(active.slice(2)) || 0 : 0;
  const dm = groupId ? "" : active;

  const loadContacts = useCallback(() => {
    void chatContacts().then(setContacts).catch(() => undefined);
    void groupList().then(setGroups).catch(() => undefined);
  }, []);

  const loadMessages = useCallback((who: string, force = false) => {
    if (!who) return;
    void chatMessages({ data: { with: who } }).then((rows) => {
      if (activeRef.current !== who) return;
      const sig = rows.map((r) => `${r.id}${r.read ? "r" : ""}${r.deleted ? "d" : ""}`).join(",");
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
    sel.clear();
    if (!dm) return;
    loadMessages(dm, true);
    const timer = window.setInterval(() => { if (!document.hidden) loadMessages(dm); }, 3000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, active]);

  const current = contacts?.find((c) => c.username === dm) ?? null;
  // Staff yang dipilih tapi sudah tidak aktif / tidak ada: kembali ke daftar.
  useEffect(() => { if (contacts && dm && !current) setActive(""); }, [contacts, dm, current]);
  useEffect(() => { if (groups && groupId && !groups.some((g) => g.id === groupId)) setActive(""); }, [groups, groupId]);
  const backToList = useCallback(() => setActive(""), []);
  const afterGroupDeleted = useCallback(() => { setActive(""); loadContacts(); }, [loadContacts]);

  async function send() {
    const body = text.trim();
    if (!body || !dm || sending) return;
    setSending(true);
    try {
      await chatSend({ data: { to: dm, body } });
      setText("");
      loadMessages(dm, true);
      loadContacts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  }

  const pickable = messages.filter((m) => m.mine && !m.deleted).map((m) => m.id);

  async function deleteSelected() {
    const ids = [...sel.selected];
    if (!ids.length || deleting) return;
    if (!confirm(`Hapus ${ids.length} pesan? Pesan hilang untuk Anda dan lawan bicara.`)) return;
    setDeleting(true);
    try {
      const res = await chatDeleteMessages({ data: { ids } });
      toast.success(`${res.deleted} pesan dihapus`);
      sel.clear();
      loadMessages(dm, true);
      loadContacts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pesan");
    } finally {
      setDeleting(false);
    }
  }

  const shown = (contacts ?? []).filter((c) => !filter.trim() || `${c.name} ${c.role} ${c.username}`.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-panel shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <div className="grid h-[calc(100vh-9.5rem)] min-h-[420px] md:grid-cols-[320px_1fr]">
        <aside className={`min-h-0 flex-col border-r border-line ${active ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-line p-3">
            <h2 className="font-extrabold">Chat Staff</h2>
            <p className="text-xs text-muted">Pesan pribadi dan grup khusus (chat + catatan bersama).</p>
            <input className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent" placeholder="Cari nama staff" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            <li className="flex items-center justify-between bg-slate-100 px-3 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Grup khusus</span>
              {canMakeGroup ? <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-[11px] font-bold text-white" onClick={() => setCreating(true)}><Plus className="size-3" />Grup</button> : null}
            </li>
            {groups && groups.length === 0 ? <li className="border-b border-line px-3 py-3 text-xs text-muted">{canMakeGroup ? "Belum ada grup. Klik + Grup untuk membuat grup berisi catatan dan chat khusus." : "Anda belum masuk grup mana pun."}</li> : null}
            {(groups ?? []).filter((g) => !filter.trim() || g.nama.toLowerCase().includes(filter.trim().toLowerCase())).map((g) => (
              <li key={`g${g.id}`}>
                <button type="button" onClick={() => setActive(`g:${g.id}`)} className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left hover:bg-blue-50 ${active === `g:${g.id}` ? "bg-blue-50" : ""}`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800"><Users className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{g.nama}</p>
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{listTime(g.lastAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={`truncate text-xs ${g.unread ? "font-semibold text-slate-900" : "text-muted"}`}>{g.lastBody ? `${g.lastName}: ${g.lastBody}` : `${g.memberCount} anggota · catatan & chat`}</p>
                      {g.unread > 0 ? <span className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{g.unread}</span> : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
            <li className="bg-slate-100 px-3 py-1.5"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Pesan pribadi</span></li>
            {contacts === null ? <li className="p-4 text-center text-sm text-muted">Memuat...</li> : null}
            {contacts && shown.length === 0 ? <li className="p-4 text-center text-sm text-muted">Tidak ada staff lain.</li> : null}
            {shown.map((c) => (
              <li key={c.username}>
                <button type="button" onClick={() => setActive(c.username)} className={`flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left hover:bg-blue-50 ${dm === c.username ? "bg-blue-50" : ""}`}>
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
          {groupId ? (
            <GroupPanel groupId={groupId} staff={contacts ?? []} onBack={backToList} onChanged={loadContacts} onDeleted={afterGroupDeleted} />
          ) : current ? (
            <>
              <div className="flex items-center gap-3 border-b border-line p-3">
                <button type="button" className="grid size-10 place-items-center rounded-lg border border-line md:hidden" onClick={() => setActive("")} aria-label="Kembali"><ArrowLeft className="size-4" /></button>
                <Avatar c={current} size="size-9" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{current.name}</p>
                  <p className="text-[11px] text-muted">{current.role}</p>
                </div>
              </div>
              {sel.active ? <SelectBar count={sel.selected.size} total={pickable.length} busy={deleting} onCancel={sel.clear} onAll={() => sel.setAll(pickable)} onDelete={() => void deleteSelected()} /> : null}
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-slate-50 px-3 py-3">
                {messages.length === 0 ? <p className="py-10 text-center text-sm text-muted">Belum ada pesan. Tulis pesan pertama untuk {current.name}.</p> : null}
                {messages.map((m, i) => {
                  const newDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
                  const pick = m.mine && !m.deleted;
                  const on = sel.selected.has(m.id);
                  return (
                    <div key={m.id}>
                      {newDay ? <p className="my-2 text-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-muted shadow-sm">{dayLabel(m.createdAt)}</span></p> : null}
                      <div className={`flex rounded-lg py-0.5 ${m.mine ? "justify-end" : "justify-start"} ${on ? "bg-blue-100/70" : ""}`}>
                        <div
                          role={pick ? "button" : undefined}
                          onClick={pick ? () => sel.toggle(m.id) : undefined}
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${pick ? "cursor-pointer select-none" : ""} ${m.mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-white text-ink"}`}
                        >
                          {m.deleted ? <p className="italic opacity-70">Pesan ini telah dihapus</p> : <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          <p className={`mt-0.5 flex items-center justify-end text-[10px] ${m.mine ? "text-white/70" : "text-muted"}`}>
                            <span>{hhmm(m.createdAt)}{m.mine && !m.deleted ? (m.read ? " · Dibaca" : " · Terkirim") : ""}</span>
                          </p>
                        </div>
                        {sel.active && pick ? <PickMark on={on} /> : null}
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
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted">Pilih staff atau grup di daftar untuk mulai.</div>
          )}
        </section>
      </div>
      {creating ? <GroupFormModal staff={contacts ?? []} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); loadContacts(); setActive(`g:${id}`); }} /> : null}
    </section>
  );
}
