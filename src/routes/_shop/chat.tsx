import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar, GroupFormModal, GroupPanel, listTime, roleStyle } from "@/components/shop/chat-group";
import { Thread } from "@/components/shop/chat-thread";
import { chatContacts, groupList } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/chat")({ component: ChatPage });

type Contact = Awaited<ReturnType<typeof chatContacts>>[number];

type Group = Awaited<ReturnType<typeof groupList>>[number];

function ChatPage() {
  const me = Route.useRouteContext().me;
  const canMakeGroup = me.role === "Admin" || me.role === "Owner";
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<string>(() => { try { return sessionStorage.getItem("mjs-chat-with") || ""; } catch { return ""; } });
  const [filter, setFilter] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const groupId = active.startsWith("g:") ? Number(active.slice(2)) || 0 : 0;
  const dm = groupId ? "" : active;

  const loadContacts = useCallback(() => {
    void chatContacts().then((rows) => { setLoadErr(""); setContacts(rows); }).catch((error: Error) => setLoadErr(error?.message || "Gagal memuat chat. Cek koneksi database."));
    void groupList().then(setGroups).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadContacts();
    const timer = window.setInterval(() => { if (!document.hidden) loadContacts(); }, 5000);
    return () => window.clearInterval(timer);
  }, [loadContacts]);

  useEffect(() => {
    try { sessionStorage.setItem("mjs-chat-with", active); } catch { /* abaikan */ }
  }, [active]);

  const current = contacts?.find((c) => c.username === dm) ?? null;
  // Staff yang dipilih tapi sudah tidak aktif / tidak ada: kembali ke daftar.
  useEffect(() => { if (contacts && dm && !current) setActive(""); }, [contacts, dm, current]);
  useEffect(() => { if (groups && groupId && !groups.some((g) => g.id === groupId)) setActive(""); }, [groups, groupId]);
  const backToList = useCallback(() => setActive(""), []);
  const afterGroupDeleted = useCallback(() => { setActive(""); loadContacts(); }, [loadContacts]);

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
            {contacts === null ? <li className="p-4 text-center text-sm text-muted">{loadErr ? `Gagal memuat: ${loadErr}` : "Memuat..."}</li> : null}
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
            <GroupPanel groupId={groupId} staff={contacts ?? []} meUsername={me.username} onBack={backToList} onChanged={loadContacts} onDeleted={afterGroupDeleted} />
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
              <Thread key={`dm:${current.username}`} scope="dm" target={current.username} name={current.name} meUsername={me.username} onChanged={loadContacts} />
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
