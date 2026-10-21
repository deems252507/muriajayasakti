import { Package, Receipt, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { chatContacts, chatSend, groupList, groupSend } from "@/lib/shop/api";
import { Avatar } from "./chat-ui";

export type ShareRef = { type: "transaksi" | "barang" | "bon"; id: string; label: string };

const typeName: Record<string, string> = { transaksi: "Transaksi", barang: "Barang", bon: "Bon" };

export function RefIcon({ type, className }: { type: string; className?: string }) {
  if (type === "barang") return <Package className={className} />;
  if (type === "bon") return <Wallet className={className} />;
  return <Receipt className={className} />;
}

/** Buka halaman terkait data yang dibagikan, dengan pencarian sudah terisi. */
export function openRef(ref: { type: string; id: string }, navigate: (opts: { to: string }) => unknown) {
  const set = (key: string, value: unknown) => sessionStorage.setItem(`mjs:${key}`, JSON.stringify(value));
  try {
    if (ref.type === "transaksi") {
      for (const k of ["tujuan", "source", "status", "jenis", "start", "end"]) set(`riwayat:${k}`, "");
      set("riwayat:q", ref.id);
      set("riwayat:page", 1);
      set("riwayat:view", "transaksi");
      void navigate({ to: "/riwayat" });
    } else if (ref.type === "barang") {
      sessionStorage.setItem("mjs-find", ref.id);
      void navigate({ to: "/barang" });
    } else if (ref.type === "bon") {
      set("bon:customer", ref.id);
      set("bon:status", "Semua");
      set("bon:start", "");
      set("bon:end", "");
      void navigate({ to: "/bon" });
    }
  } catch {
    toast.error("Tidak bisa membuka halaman ini.");
  }
}

/** Jendela pilih penerima (staff atau grup) untuk membagikan data toko ke chat. */
export function ShareToChat({ data, onClose }: { data: ShareRef; onClose: () => void }) {
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof chatContacts>> | null>(null);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof groupList>>>([]);
  const [pick, setPick] = useState("");
  const [filter, setFilter] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void chatContacts().then(setContacts).catch(() => setContacts([]));
    void groupList().then(setGroups).catch(() => setGroups([]));
  }, []);

  const needle = filter.trim().toLowerCase();
  const shownGroups = groups.filter((g) => !needle || g.nama.toLowerCase().includes(needle));
  const shownStaff = (contacts ?? []).filter((c) => !needle || `${c.name} ${c.role}`.toLowerCase().includes(needle));

  async function submit() {
    if (!pick || busy) return;
    setBusy(true);
    try {
      const payload = { body: note.trim(), ref: { type: data.type, id: data.id, label: data.label } };
      if (pick.startsWith("g:")) await groupSend({ data: { id: Number(pick.slice(2)), ...payload } });
      else await chatSend({ data: { to: pick, ...payload } });
      toast.success("Terkirim ke chat");
      window.dispatchEvent(new Event("mjs-chat"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengirim");
    } finally {
      setBusy(false);
    }
  }

  const row = (key: string, label: string, sub: string, icon: React.ReactNode) => (
    <li key={key}>
      <label className={`flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 hover:bg-blue-50 ${pick === key ? "bg-blue-50" : ""}`}>
        <input type="radio" name="share-to" checked={pick === key} onChange={() => setPick(key)} />
        {icon}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
        <span className="text-[11px] text-muted">{sub}</span>
      </label>
    </li>
  );

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-line p-4">
          <div className="min-w-0">
            <h3 className="font-bold">Bagikan ke chat</h3>
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted"><RefIcon type={data.type} className="size-3.5 shrink-0" /><span className="truncate">{typeName[data.type]}: {data.label}</span></p>
          </div>
          <button type="button" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line" onClick={onClose} aria-label="Tutup"><X className="size-4" /></button>
        </div>
        <div className="p-3">
          <input className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent" placeholder="Cari staff atau grup" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto border-y border-line">
          {shownGroups.map((g) => row(`g:${g.id}`, g.nama, "Grup", <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">G</span>))}
          {shownStaff.map((c) => row(c.username, c.name, c.role, <Avatar c={c} size="size-8" />))}
          {contacts === null ? <li className="p-4 text-center text-sm text-muted">Memuat...</li> : null}
          {contacts && shownGroups.length + shownStaff.length === 0 ? <li className="p-4 text-center text-sm text-muted">Tidak ada tujuan.</li> : null}
        </ul>
        <div className="p-3">
          <input className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent" maxLength={500} placeholder="Tambah pesan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="h-10 px-3 text-sm" onClick={onClose}>Batal</button>
            <button type="button" disabled={!pick || busy} className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => void submit()}>{busy ? "Mengirim..." : "Kirim"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
