import { Check, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";

const TZ = "Asia/Makassar";
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(".", ":");
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
export function dayLabel(iso: string) {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return "Hari ini";
  if (key === dayKey(new Date(Date.now() - 86400000).toISOString())) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function listTime(iso: string) {
  if (!iso) return "";
  return dayKey(iso) === dayKey(new Date().toISOString())
    ? hhmm(iso)
    : new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "short" });
}
export const dateTime = (iso: string) => `${new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" })} ${hhmm(iso)}`;

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
/** Pilih pesan ala WhatsApp: tap pesan untuk centang, tombol Hapus muncul di bar atas. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = useCallback((id: number) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const setAll = useCallback((ids: number[]) => setSelected(new Set(ids)), []);
  return { selected, toggle, clear, setAll, active: selected.size > 0 };
}

export function SelectBar(props: { count: number; total: number; busy?: boolean; onCancel: () => void; onAll: () => void; onDelete: () => void }) {
  const { count, total, busy, onCancel, onAll, onDelete } = props;
  return (
    <div className="flex items-center gap-2 border-b border-line bg-blue-50 px-3 py-2">
      <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-blue-100" onClick={onCancel} aria-label="Batal pilih"><X className="size-5" /></button>
      <p className="text-sm font-bold">{count} dipilih</p>
      <div className="ml-auto flex items-center gap-2">
        {count < total ? <button type="button" className="h-9 rounded-lg px-3 text-xs font-bold text-accent hover:bg-blue-100" onClick={onAll}>Pilih semua</button> : null}
        <button type="button" disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-xs font-bold text-white disabled:opacity-50" onClick={onDelete}><Trash2 className="size-4" />Hapus</button>
      </div>
    </div>
  );
}

/** Lingkaran centang di samping pesan saat mode pilih aktif. */
export function PickMark({ on }: { on: boolean }) {
  return <span className={`mx-1 grid size-5 shrink-0 place-items-center self-center rounded-full border-2 ${on ? "border-accent bg-accent text-white" : "border-slate-300 bg-white"}`}>{on ? <Check className="size-3" strokeWidth={3} /> : null}</span>;
}

