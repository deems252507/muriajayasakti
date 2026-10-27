import { useId, useState } from "react";

// Dropdown sortir berbentuk daftar centang (seperti dropdown Kategori).
// Urutan centang = urutan prioritas sortir. Pilihan yang saling berlawanan otomatis saling melepas.
export const SORT_OPTIONS = [
  { key: "kategori", label: "Kategori saja (A - Z)", group: "nama" },
  { key: "nama", label: "Kategori, Nama (A - Z)", group: "nama" },
  { key: "nama_desc", label: "Kategori, Nama (Z - A)", group: "nama" },
  { key: "part", label: "Part Number (A - Z)", group: "part" },
  { key: "stok_desc", label: "Stok Terbesar", group: "stok" },
  { key: "stok_asc", label: "Stok Terkecil", group: "stok" },
  { key: "harga_desc", label: "Harga Jual ↑ Tertinggi", group: "harga" },
  { key: "harga_asc", label: "Harga Jual ↓ Terendah", group: "harga" },
  { key: "pajak", label: "Pajak (hanya barang pajak, Kode A - Z)", group: "pajak" },
] as const;

export const DEFAULT_SORTS: string[] = ["nama"];

const SHORT: Record<string, string> = {
  kategori: "Kategori",
  nama: "Kategori, Nama (A - Z)",
  part: "Part Number (A - Z)",
  nama_desc: "Kategori, Nama (Z - A)",
  stok_desc: "Stok Terbesar",
  stok_asc: "Stok Terkecil",
  harga_desc: "Harga ↑ Tertinggi",
  harga_asc: "Harga ↓ Terendah",
  pajak: "Pajak",
};

export function sortLabel(sorts: string[]) {
  return (sorts.length ? sorts : DEFAULT_SORTS).map((k) => SHORT[k] ?? k).join(" + ");
}

// Judul kelompok kategori di tabel hanya masuk akal kalau urutan utamanya per kategori.
export function hideCategoryHeaders(sorts: string[], dupOnly = false) {
  if (dupOnly) return true;
  const lead = sorts.find((k) => k !== "pajak") ?? (sorts.includes("pajak") ? "pajak" : "nama");
  return !["kategori", "nama", "nama_desc", "stok_desc", "stok_asc"].includes(lead);
}

export function toggleSort(current: string[], key: string, on: boolean): string[] {
  if (!on) {
    const next = current.filter((k) => k !== key);
    return next.length ? next : DEFAULT_SORTS;
  }
  const group = SORT_OPTIONS.find((o) => o.key === key)?.group;
  const kept = current.filter((k) => k !== key && SORT_OPTIONS.find((o) => o.key === k)?.group !== group);
  // Kalau masih urutan bawaan saja, pilihan baru menggantikannya (supaya tidak "kalah" oleh urutan nama).
  const isDefaultOnly = current.length === 1 && current[0] === "nama" && !["kategori", "nama", "nama_desc", "part"].includes(key);
  return isDefaultOnly ? [key] : [...kept, key];
}

export function SortPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const id = useId();
  const [alignLeft, setAlignLeft] = useState(false);
  const label = value.length ? value.map((k) => SHORT[k] ?? k).join(" + ") : SHORT.nama;
  return (
    <details
      className="relative min-w-[200px]"
      id={id}
      onToggle={(e) => {
        // Buka ke kanan kalau di sisi kiri layar (supaya tidak terpotong), ke kiri kalau di sisi kanan.
        const r = (e.currentTarget as HTMLDetailsElement).getBoundingClientRect();
        setAlignLeft(r.left + 320 <= window.innerWidth);
      }}
    >
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-slate-600">▾</span>
      </summary>
      <div className={`absolute ${alignLeft ? "left-0" : "right-0"} top-12 z-20 w-full min-w-[300px] overflow-hidden rounded-xl border border-line bg-white shadow-xl`}>
        <p className="border-b border-line bg-blue-50/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-blue-700">
          Centang untuk menggabungkan sortir (urut sesuai centang)
        </p>
        <div className="space-y-0.5 p-2">
          {SORT_OPTIONS.map((o) => {
            const idx = value.indexOf(o.key);
            const checked = idx >= 0;
            return (
              <label
                key={o.key}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 ${checked ? "bg-blue-50 font-semibold text-blue-800" : ""}`}
              >
                <input type="checkbox" checked={checked} onChange={(e) => onChange(toggleSort(value, o.key, e.target.checked))} />
                <span className="flex-1">{o.label}</span>
                {checked && value.length > 1 ? (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-[11px] text-white">{idx + 1}</span>
                ) : null}
              </label>
            );
          })}
        </div>
        <div className="flex gap-2 border-t border-line bg-slate-50 p-3">
          <button
            type="button"
            className="rounded-lg border border-line bg-white px-3 text-sm font-bold hover:bg-slate-100"
            onClick={() => onChange(DEFAULT_SORTS)}
          >
            Bawaan
          </button>
          <button
            type="button"
            className="h-10 flex-1 rounded-lg bg-slate-800 text-sm font-bold text-white hover:bg-slate-900"
            onClick={() => {
              const el = document.getElementById(id) as HTMLDetailsElement | null;
              if (el) el.open = false;
            }}
          >
            OK — Terapkan
          </button>
        </div>
      </div>
    </details>
  );
}
