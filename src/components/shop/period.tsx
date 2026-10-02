import { inputClass } from "@/components/shop/shell";
import { monthSpan, periodRange, todayInput } from "@/lib/shop/format";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function PeriodPicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const today = todayInput();
  const yearNow = Number(today.slice(0, 4));
  const pickedYear = Number((start || today).slice(0, 4)) || yearNow;
  const years = [yearNow, yearNow - 1, yearNow - 2, yearNow - 3, yearNow - 4];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => { const r = periodRange("today"); onChange(r.start, r.end); }}>Hari Ini</button>
      <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => { const r = periodRange("month"); onChange(r.start, r.end); }}>Bulan Ini</button>
      <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => { const r = periodRange("year"); onChange(r.start, r.end); }}>Tahun Ini</button>
      <label className="text-xs text-muted">Bulan
        <select className={`${inputClass} mt-1`} value="" onChange={(e) => { const month = Number(e.target.value); if (!month) return; const r = monthSpan(pickedYear, month); onChange(r.start, r.end); }}>
          <option value="">Pilih bulan</option>
          {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">Tahun
        <select className={`${inputClass} mt-1`} value="" onChange={(e) => { const year = Number(e.target.value); if (!year) return; onChange(`${year}-01-01`, `${year}-12-31`); }}>
          <option value="">Pilih tahun</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">Dari tanggal
        <input className={`${inputClass} mt-1`} type="date" value={start} onChange={(e) => onChange(e.target.value, end)} />
      </label>
      <label className="text-xs text-muted">Sampai tanggal
        <input className={`${inputClass} mt-1`} type="date" value={end} onChange={(e) => onChange(start, e.target.value)} />
      </label>
    </div>
  );
}
