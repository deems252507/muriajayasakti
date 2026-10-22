import { ArrowLeft, Copy, Pencil, Pin, PinOff, Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  groupCreate, groupDelete, groupInfo, groupUpdate, noteDelete, noteList, noteSave,
} from "@/lib/shop/api";
import { Conversation } from "./chat-core";
import { dateTime } from "./chat-time";

export { dayKey, dayLabel, hhmm, listTime } from "./chat-time";

export const roleStyle: Record<string, string> = {
  Owner: "bg-purple-100 text-purple-800",
  Admin: "bg-blue-100 text-blue-800",
  Kasir: "bg-emerald-100 text-emerald-800",
};

export function Avatar({ c, size = "size-10" }: { c: { name: string; photo: string }; size?: string }) {
  return c.photo
    ? <img src={c.photo} alt="" className={`${size} shrink-0 rounded-full object-cover ring-1 ring-line`} />
    : <span className={`${size} grid shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-accent`}>{c.name.slice(0, 1).toUpperCase()}</span>;
}

export type StaffPerson = { username: string; name: string; role: string; photo: string };
type Info = Awaited<ReturnType<typeof groupInfo>>;
type Note = Awaited<ReturnType<typeof noteList>>[number];


const fieldCls = "w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent";

/** Form buat / atur grup: nama, deskripsi, pilih anggota. */
export function GroupFormModal(props: { info?: Info | null; staff: StaffPerson[]; onClose: () => void; onSaved: (id: number) => void }) {
  const { info, staff, onClose, onSaved } = props;
  const [nama, setNama] = useState(info?.nama ?? "");
  const [deskripsi, setDeskripsi] = useState(info?.deskripsi ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set(info?.members.map((m) => m.username) ?? []));
  const [busy, setBusy] = useState(false);

  const toggle = (u: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(u)) next.delete(u); else next.add(u); return next; });

  async function submit() {
    if (!nama.trim()) return toast.error("Isi nama grup.");
    setBusy(true);
    try {
      const members = [...picked];
      if (info) {
        await groupUpdate({ data: { id: info.id, nama, deskripsi, members } });
        toast.success("Grup diperbarui");
        onSaved(info.id);
      } else {
        const res = await groupCreate({ data: { nama, deskripsi, members } });
        toast.success("Grup dibuat");
        onSaved(res.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan grup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4">
      <form className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-panel p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h3 className="font-bold">{info ? "Atur Grup" : "Grup Baru"}</h3>
        <p className="mt-1 text-xs text-muted">Hanya anggota yang bisa melihat chat dan catatan grup. Anda otomatis menjadi anggota.</p>
        <label className="mt-3 block text-sm font-medium">Nama grup
          <input className={`${fieldCls} mt-1 h-11`} maxLength={60} placeholder="Contoh: Data Supplier Oli" value={nama} onChange={(e) => setNama(e.target.value)} autoFocus />
        </label>
        <label className="mt-2 block text-sm font-medium">Deskripsi (opsional)
          <input className={`${fieldCls} mt-1 h-11`} maxLength={300} placeholder="Untuk apa grup ini" value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
        </label>
        <p className="mt-3 text-sm font-medium">Anggota ({picked.size + 1})</p>
        <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-white">
          {staff.map((p) => (
            <li key={p.username}>
              <label className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-blue-50">
                <input type="checkbox" checked={picked.has(p.username)} onChange={() => toggle(p.username)} />
                <Avatar c={p} size="size-8" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${roleStyle[p.role] ?? "bg-slate-100 text-slate-700"}`}>{p.role}</span>
              </label>
            </li>
          ))}
          {staff.length === 0 ? <li className="p-3 text-center text-xs text-muted">Belum ada staff lain.</li> : null}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-11 px-3 text-sm" onClick={onClose}>Batal</button>
          <button type="submit" disabled={busy} className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </form>
    </div>
  );
}

/** Panel satu grup: tab Chat, Catatan, Anggota. */
export function GroupPanel(props: { groupId: number; staff: StaffPerson[]; meUsername: string; role: string; onBack: () => void; onChanged: () => void; onDeleted: () => void }) {
  const { groupId, staff, meUsername, role, onBack, onChanged, onDeleted } = props;
  const [tab, setTab] = useState<"chat" | "catatan" | "anggota">("chat");
  const [info, setInfo] = useState<Info | null>(null);
  const [editing, setEditing] = useState(false);

  const loadInfo = useCallback(() => {
    void groupInfo({ data: { id: groupId } }).then(setInfo).catch((error: Error) => { toast.error(error.message); onDeleted(); });
  }, [groupId, onDeleted]);

  useEffect(() => { setInfo(null); setTab("chat"); loadInfo(); }, [groupId]);

  const tabs: Array<["chat" | "catatan" | "anggota", string]> = [["chat", "Chat"], ["catatan", "Catatan"], ["anggota", "Anggota"]];

  return (
    <>
      <div className="border-b border-line p-3">
        <div className="flex items-center gap-3">
          <button type="button" className="grid size-10 place-items-center rounded-lg border border-line md:hidden" onClick={onBack} aria-label="Kembali"><ArrowLeft className="size-4" /></button>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800"><Users className="size-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{info?.nama ?? "Memuat..."}</p>
            <p className="truncate text-[11px] text-muted">{info ? `${info.members.length} anggota${info.deskripsi ? ` · ${info.deskripsi}` : ""}` : ""}</p>
          </div>
        </div>
        <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`h-8 rounded-md px-4 text-xs font-bold ${tab === key ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "chat" ? <Conversation key={`g:${groupId}`} kind="group" target={String(groupId)} title={info?.nama ?? ""} members={info?.members ?? []} meUsername={meUsername} role={role} moderator={Boolean(info?.canManage)} onRead={onChanged} /> : null}
      {tab === "catatan" ? <GroupNotes groupId={groupId} /> : null}
      {tab === "anggota" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {info?.members.map((m) => (
              <li key={m.username} className="flex items-center gap-3 px-3 py-2">
                <Avatar c={m} size="size-9" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${roleStyle[m.role] ?? "bg-slate-100 text-slate-700"}`}>{m.role}</span>
              </li>
            ))}
          </ul>
          {info?.canManage ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="h-10 rounded-lg border border-line px-4 text-sm font-bold" onClick={() => setEditing(true)}>Atur nama & anggota</button>
              <button type="button" className="h-10 rounded-lg border border-red-200 px-4 text-sm font-bold text-danger" onClick={() => {
                if (!confirm(`Hapus grup "${info.nama}"? Semua chat dan catatan di grup ini ikut terhapus dan tidak bisa dikembalikan.`)) return;
                void groupDelete({ data: { id: groupId } }).then(() => { toast.success("Grup dihapus"); onDeleted(); }).catch((error: Error) => toast.error(error.message));
              }}>Hapus grup</button>
            </div>
          ) : <p className="mt-3 text-xs text-muted">Hanya Admin atau Owner yang bisa mengatur anggota grup.</p>}
        </div>
      ) : null}

      {editing && info ? <GroupFormModal info={info} staff={staff} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadInfo(); onChanged(); }} /> : null}
    </>
  );
}

type Draft = { id: number | null; judul: string; isi: string; pinned: boolean };

function GroupNotes({ groupId }: { groupId: number }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const draftOpen = useRef(false);
  draftOpen.current = draft !== null;

  const load = useCallback(() => {
    void noteList({ data: { groupId } }).then(setNotes).catch(() => undefined);
  }, [groupId]);

  useEffect(() => {
    setNotes(null);
    setDraft(null);
    load();
    const timer = window.setInterval(() => { if (!document.hidden && !draftOpen.current) load(); }, 10000);
    return () => window.clearInterval(timer);
  }, [groupId]);

  async function save(next: Draft) {
    setBusy(true);
    try {
      await noteSave({ data: { groupId, ...next } });
      setDraft(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan catatan");
    } finally {
      setBusy(false);
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = (notes ?? []).filter((n) => !needle || `${n.judul} ${n.isi}`.toLowerCase().includes(needle));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">
      <div className="flex gap-2">
        <input className={`${fieldCls} h-11`} placeholder="Cari catatan" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg bg-accent px-4 text-sm font-bold text-white" onClick={() => setDraft({ id: null, judul: "", isi: "", pinned: false })}><Plus className="size-4" />Catatan</button>
      </div>

      {draft ? (
        <form className="mt-3 rounded-xl border border-accent bg-white p-3" onSubmit={(e) => { e.preventDefault(); void save(draft); }}>
          <input className={`${fieldCls} h-11 font-semibold`} maxLength={120} placeholder="Judul catatan" value={draft.judul} onChange={(e) => setDraft({ ...draft, judul: e.target.value })} autoFocus />
          <textarea className={`${fieldCls} mt-2 min-h-40 py-2 leading-relaxed`} maxLength={10000} placeholder="Tulis catatan, data, nomor rekening, daftar harga, dll." value={draft.isi} onChange={(e) => setDraft({ ...draft, isi: e.target.value })} />
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} /> Sematkan di atas</label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="h-10 px-3 text-sm" onClick={() => setDraft(null)}>Batal</button>
            <button type="submit" disabled={busy} className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan"}</button>
          </div>
        </form>
      ) : null}

      <ul className="mt-3 space-y-3">
        {notes === null ? <li className="py-6 text-center text-sm text-muted">Memuat...</li> : null}
        {notes && shown.length === 0 && !draft ? <li className="py-10 text-center text-sm text-muted">{needle ? "Catatan tidak ditemukan." : "Belum ada catatan. Klik + Catatan untuk menambah data yang ingin dibagikan ke anggota grup."}</li> : null}
        {shown.map((n) => (
          <li key={n.id} className={`rounded-xl border bg-white p-3 shadow-sm ${n.pinned ? "border-amber-300" : "border-line"}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {n.pinned ? <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"><Pin className="size-3" />Disematkan</span> : null}
                <p className="break-words text-sm font-bold">{n.judul || "(Tanpa judul)"}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" title={n.pinned ? "Lepas sematan" : "Sematkan"} aria-label="Sematkan" className="grid size-8 place-items-center rounded-lg border border-line text-slate-700 hover:bg-slate-100" onClick={() => void save({ id: n.id, judul: n.judul, isi: n.isi, pinned: !n.pinned })}>{n.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</button>
                <button type="button" title="Salin isi" aria-label="Salin" className="grid size-8 place-items-center rounded-lg border border-line text-slate-700 hover:bg-slate-100" onClick={() => { void navigator.clipboard?.writeText(`${n.judul}\n${n.isi}`.trim()).then(() => toast.success("Catatan disalin")).catch(() => toast.error("Tidak bisa menyalin")); }}><Copy className="size-4" /></button>
                <button type="button" title="Ubah" aria-label="Ubah" className="grid size-8 place-items-center rounded-lg border border-line text-slate-700 hover:bg-slate-100" onClick={() => setDraft({ id: n.id, judul: n.judul, isi: n.isi, pinned: n.pinned })}><Pencil className="size-4" /></button>
                <button type="button" title="Hapus" aria-label="Hapus" className="grid size-8 place-items-center rounded-lg border border-red-200 text-danger hover:bg-red-50" onClick={() => {
                  if (!confirm("Hapus catatan ini?")) return;
                  void noteDelete({ data: { groupId, id: n.id } }).then(load).catch((error: Error) => toast.error(error.message));
                }}><Trash2 className="size-4" /></button>
              </div>
            </div>
            {n.isi ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{n.isi}</p> : null}
            <p className="mt-2 text-[11px] text-muted">Dibuat {n.createdName} · {dateTime(n.createdAt)}{n.updatedAt !== n.createdAt ? ` · Diubah ${n.updatedName} ${dateTime(n.updatedAt)}` : ""}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
