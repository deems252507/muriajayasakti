import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, MessageSquarePlus, MoreVertical, Plus, Search, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Conversation } from "@/components/shop/chat-core";
import { PushToggle } from "@/components/shop/push-toggle";
import { Avatar, GroupFormModal, GroupPanel, listTime, roleStyle } from "@/components/shop/chat-group";
import { toast } from "sonner";
import { chatClear, chatContacts, chatHideAll, groupDelete, groupList } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/chat")({ component: ChatPage });

type Contact = Awaited<ReturnType<typeof chatContacts>>[number];
type Group = Awaited<ReturnType<typeof groupList>>[number];

function ChatPage() {
  const me = Route.useRouteContext().me;
  const canMakeGroup = me.role === "Admin" || me.role === "Owner";
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [active, setActive] = useState<string>(() => { try { return sessionStorage.getItem("mjs-chat-with") || ""; } catch { return ""; } });
  const [filter, setFilter] = useState("");
  const groupId = active.startsWith("g:") ? Number(active.slice(2)) || 0 : 0;
  const dm = groupId ? "" : active;

  const loadContacts = useCallback(() => {
    void chatContacts().then(setContacts).catch(() => undefined);
    void groupList().then(setGroups).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadContacts();
    const timer = window.setInterval(() => { if (!document.hidden) loadContacts(); }, 8000);
    return () => window.clearInterval(timer);
  }, [loadContacts]);

  useEffect(() => {
    try { sessionStorage.setItem("mjs-chat-with", active); } catch { /* abaikan */ }
  }, [active]);

  // Buka chat dari klik notifikasi (aplikasi tertutup: lewat #open=..., sedang terbuka: lewat event).
  useEffect(() => {
    const match = /#open=([^&]+)/.exec(window.location.hash);
    if (match) {
      setActive(decodeURIComponent(match[1]));
      if (/[#&]reply=1/.test(window.location.hash)) { try { sessionStorage.setItem("mjs-chat-focus", "1"); } catch { /* abaikan */ } }
      window.history.replaceState(null, "", window.location.pathname);
    }
    const onOpen = (event: Event) => {
      const target = String((event as CustomEvent).detail ?? "");
      if (target) setActive(target);
    };
    window.addEventListener("mjs-open-chat", onOpen);
    return () => window.removeEventListener("mjs-open-chat", onOpen);
  }, []);

  const current = contacts?.find((c) => c.username === dm) ?? null;
  // Staff yang dipilih tapi sudah tidak aktif / tidak ada: kembali ke daftar.
  useEffect(() => { if (contacts && dm && !current) setActive(""); }, [contacts, dm, current]);
  useEffect(() => { if (groups && groupId && !groups.some((g) => g.id === groupId)) setActive(""); }, [groups, groupId]);
  const backToList = useCallback(() => setActive(""), []);
  const afterGroupDeleted = useCallback(() => { setActive(""); loadContacts(); }, [loadContacts]);

  const [rowMenu, setRowMenu] = useState<string | null>(null);
  async function deleteChat(c: Contact, scope: "me" | "all") {
    setRowMenu(null);
    if (!confirm(scope === "me" ? `Hapus obrolan dengan ${c.name}? Obrolan hilang dari daftar Anda. Untuk chat lagi, pakai Pesan baru.` : `Hapus obrolan dengan ${c.name} untuk SEMUA orang? Tidak bisa dikembalikan.`)) return;
    try {
      if (scope === "me") await chatHideAll({ data: { kind: "dm", target: c.username } });
      else await chatClear({ data: { with: c.username } });
      if (active === c.username) setActive("");
      toast.success("Obrolan dihapus");
      loadContacts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus obrolan");
    }
  }

  const [groupMenu, setGroupMenu] = useState<number | null>(null);
  async function groupAction(g: Group, action: "clear" | "delete") {
    setGroupMenu(null);
    const ask = action === "clear" ? `Kosongkan chat grup "${g.nama}" dari tampilan Anda? Anggota lain tetap bisa melihatnya.` : `Hapus grup "${g.nama}"? Semua chat dan catatan ikut terhapus untuk SEMUA anggota dan tidak bisa dikembalikan.`;
    if (!confirm(ask)) return;
    try {
      if (action === "clear") await chatHideAll({ data: { kind: "group", target: String(g.id) } });
      else await groupDelete({ data: { id: g.id } });
      if (action === "delete" && active === `g:${g.id}`) setActive("");
      toast.success(action === "clear" ? "Chat grup dikosongkan" : "Grup dihapus");
      loadContacts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal");
    }
  }

  // Seperti WhatsApp: daftar hanya berisi obrolan yang ada pesannya (atau yang sedang dibuka). Mulai chat baru lewat "Pesan baru".
  const shown = (contacts ?? []).filter((c) => (c.lastAt || c.unread > 0 || c.username === dm) && (!filter.trim() || `${c.name} ${c.role} ${c.username}`.toLowerCase().includes(filter.trim().toLowerCase())));

  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-panel shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <div className="grid h-[calc(100vh-9.5rem)] min-h-[420px] md:grid-cols-[320px_1fr]">
        <aside className={`min-h-0 flex-col border-r border-line ${active ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-extrabold">Chat Staff</h2>
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white" onClick={() => setNewChat(true)} aria-label="Pesan baru"><MessageSquarePlus className="size-4" />Pesan baru</button>
            </div>
            <p className="text-xs text-muted">Pesan pribadi dan grup khusus (chat + catatan bersama).</p>
            <PushToggle />
            <input className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent" placeholder="Cari nama staff" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            <li className="flex items-center justify-between bg-slate-100 px-3 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Grup khusus</span>
              {canMakeGroup ? <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-[11px] font-bold text-white" onClick={() => setCreating(true)}><Plus className="size-3" />Grup</button> : null}
            </li>
            {groups && groups.length === 0 ? <li className="border-b border-line px-3 py-3 text-xs text-muted">{canMakeGroup ? "Belum ada grup. Klik + Grup untuk membuat grup berisi catatan dan chat khusus." : "Anda belum masuk grup mana pun."}</li> : null}
            {(groups ?? []).filter((g) => !filter.trim() || g.nama.toLowerCase().includes(filter.trim().toLowerCase())).map((g) => (
              <li key={`g${g.id}`} className="relative">
                <button type="button" onClick={() => setActive(`g:${g.id}`)} onContextMenu={(e) => { e.preventDefault(); setGroupMenu(g.id); }} className={`flex w-full items-center gap-3 border-b border-line py-3 pl-3 pr-9 text-left hover:bg-blue-50 ${active === `g:${g.id}` ? "bg-blue-50" : ""}`}>
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
                <button type="button" aria-label="Menu grup" className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-200" onClick={() => setGroupMenu(groupMenu === g.id ? null : g.id)}><MoreVertical className="size-4" /></button>
                {groupMenu === g.id ? (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setGroupMenu(null)} />
                    <div className="absolute right-2 top-10 z-30 w-60 rounded-xl border border-line bg-white p-1 shadow-lg">
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => void groupAction(g, "clear")}><Trash2 className="size-4" />Kosongkan chat (untuk saya)</button>
                      {canMakeGroup ? <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-red-50" onClick={() => void groupAction(g, "delete")}><Trash2 className="size-4" />Hapus grup</button> : null}
                    </div>
                  </>
                ) : null}
              </li>
            ))}
            <li className="bg-slate-100 px-3 py-1.5"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Pesan pribadi</span></li>
            {contacts === null ? <li className="p-4 text-center text-sm text-muted">Memuat...</li> : null}
            {contacts && shown.length === 0 ? <li className="p-4 text-center text-sm text-muted">Belum ada obrolan. Klik Pesan baru untuk mulai chat.</li> : null}
            {shown.map((c) => (
              <li key={c.username} className="relative">
                <button type="button" onClick={() => setActive(c.username)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(c.username); }} className={`flex w-full items-center gap-3 border-b border-line py-3 pl-3 pr-9 text-left hover:bg-blue-50 ${dm === c.username ? "bg-blue-50" : ""}`}>
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
                <button type="button" aria-label="Menu obrolan" className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-200" onClick={() => setRowMenu(rowMenu === c.username ? null : c.username)}><MoreVertical className="size-4" /></button>
                {rowMenu === c.username ? (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setRowMenu(null)} />
                    <div className="absolute right-2 top-10 z-30 w-60 rounded-xl border border-line bg-white p-1 shadow-lg">
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => void deleteChat(c, "me")}><Trash2 className="size-4" />Hapus obrolan</button>
                      {me.role === "Admin" || me.role === "Owner" ? <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-red-50" onClick={() => void deleteChat(c, "all")}><Trash2 className="size-4" />Hapus untuk semua orang</button> : null}
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>

        <section className={`min-h-0 flex-col ${active ? "flex" : "hidden md:flex"}`}>
          {groupId ? (
            <GroupPanel groupId={groupId} staff={contacts ?? []} meUsername={me.username} role={me.role} onBack={backToList} onChanged={loadContacts} onDeleted={afterGroupDeleted} />
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
              <Conversation key={`dm:${dm}`} kind="dm" target={dm} title={current.name} members={[]} meUsername={me.username} role={me.role} moderator={false} onRead={loadContacts} />
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted">Pilih staff atau grup di daftar untuk mulai.</div>
          )}
        </section>
      </div>
      {newChat ? (
        <NewChatModal
          contacts={contacts ?? []}
          canMakeGroup={canMakeGroup}
          onClose={() => setNewChat(false)}
          onPick={(username) => { setNewChat(false); setFilter(""); setActive(username); }}
          onNewGroup={() => { setNewChat(false); setCreating(true); }}
        />
      ) : null}
      {creating ? <GroupFormModal staff={contacts ?? []} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); loadContacts(); setActive(`g:${id}`); }} /> : null}
    </section>
  );
}

/** Pilih staff untuk memulai chat baru (seperti tombol "Chat baru" di WhatsApp). */
function NewChatModal(props: { contacts: Contact[]; canMakeGroup: boolean; onClose: () => void; onPick: (username: string) => void; onNewGroup: () => void }) {
  const { contacts, canMakeGroup, onClose, onPick, onNewGroup } = props;
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = [...contacts]
    .filter((c) => !needle || `${c.name} ${c.role} ${c.username}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Pesan baru</h3>
          <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-slate-100" aria-label="Tutup" onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" />
          <input autoFocus className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-accent" placeholder="Cari nama staff" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-white">
          {canMakeGroup && !needle ? (
            <li>
              <button type="button" className="flex w-full items-center gap-3 border-b border-line px-3 py-3 text-left hover:bg-blue-50" onClick={onNewGroup}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white"><Users className="size-4" /></span>
                <span className="text-sm font-bold">Grup baru</span>
              </button>
            </li>
          ) : null}
          {rows.length === 0 ? <li className="p-4 text-center text-sm text-muted">Staff tidak ditemukan.</li> : null}
          {rows.map((c) => (
            <li key={c.username}>
              <button type="button" className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-blue-50" onClick={() => onPick(c.username)}>
                <Avatar c={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{c.name}</span>
                  <span className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${roleStyle[c.role] ?? "bg-slate-100 text-slate-700"}`}>{c.role}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
