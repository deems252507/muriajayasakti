import { inputClass } from "@/components/shop/shell";
import { periodRange } from "@/lib/shop/format";

export function PeriodPicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => { const r = periodRange("today"); onChange(r.start, r.end); }}>Hari Ini</button>
      <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => { const r = periodRange("month"); onChange(r.start, r.end); }}>Bulan Ini</button>
      <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => { const r = periodRange("year"); onChange(r.start, r.end); }}>Tahun Ini</button>
      <label className="text-xs text-muted">Dari tanggal
        <input className={`${inputClass} mt-1`} type="date" value={start} onChange={(e) => onChange(e.target.value, end)} />
      </label>
      <label className="text-xs text-muted">Sampai tanggal
        <input className={`${inputClass} mt-1`} type="date" value={end} onChange={(e) => onChange(start, e.target.value)} />
      </label>
    </div>
  );
}
