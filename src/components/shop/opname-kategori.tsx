import { useRef, useState } from "react";

/** Pilih kategori seperti di Daftar Sparepart: bisa diketik untuk mencari, boleh pilih lebih dari satu. */
export function KategoriPicker({ value, onChange, options, alignRight = false }: { value: string[]; onChange: (next: string[]) => void; options: string[]; alignRight?: boolean }) {
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDetailsElement>(null);
  const selected = new Set(value.map((v) => v.toLowerCase()));
  const needle = search.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
  const ordered = [...filtered.filter((o) => selected.has(o.toLowerCase())), ...filtered.filter((o) => !selected.has(o.toLowerCase()))];
  const close = () => {
    if (ref.current) ref.current.open = false;
    setSearch("");
  };
  return (
    <details ref={ref} className="relative min-w-0">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm">
        <span className="truncate">{value.length === 0 ? "Semua Kategori" : value.length <= 2 ? value.join(", ") : `${value.length} kategori dipilih`}</span>
        <span className="shrink-0 text-slate-600">▾</span>
      </summary>
      <div className={`absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border border-line bg-white shadow-xl ${alignRight ? "sm:left-auto sm:right-0" : "sm:right-auto"} sm:w-[320px]`}>
        <div className="space-y-2 border-b border-line p-3">
          <input
            className="h-10 w-full rounded-lg border border-line px-3 text-base outline-none focus:border-blue-500"
            placeholder="Ketik untuk mencari kategori..."
            aria-label="Cari kategori"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" aria-label="Pilih semua kategori" className="h-10 flex-1 rounded-lg border border-line bg-white px-3 text-left text-sm font-bold text-slate-800" onClick={() => onChange([])}>
              ☑ Semua Kategori
            </button>
            {value.length > 0 ? (
              <button type="button" aria-label="Hapus semua pilihan" className="h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-danger" onClick={() => onChange([])}>
                Hapus
              </button>
            ) : null}
          </div>
        </div>
        {value.length > 0 ? (
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto border-b border-line bg-blue-50/60 px-3 py-2">
            {value.map((v) => (
              <button key={v} type="button" aria-label={`Batal pilih ${v}`} className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white" onClick={() => onChange(value.filter((x) => x.toLowerCase() !== v.toLowerCase()))}>
                {v} <span className="opacity-80">×</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="max-h-56 space-y-0.5 overflow-y-auto p-2">
          {ordered.length === 0 ? <p className="px-2 py-4 text-center text-xs text-slate-600">Tidak ada kategori cocok</p> : null}
          {ordered.map((o) => {
            const checked = selected.has(o.toLowerCase());
            return (
              <label key={o} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 ${checked ? "bg-blue-50 font-semibold text-blue-800" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x.toLowerCase() !== o.toLowerCase()))}
                />
                <span className="min-w-0 break-words">{o}</span>
              </label>
            );
          })}
        </div>
        <div className="border-t border-line bg-slate-50 p-3">
          <button type="button" aria-label="Terapkan kategori" className="h-10 w-full rounded-lg bg-slate-800 text-sm font-bold text-white" onClick={close}>
            OK — Terapkan ({value.length || "Semua"})
          </button>
        </div>
      </div>
    </details>
  );
}
