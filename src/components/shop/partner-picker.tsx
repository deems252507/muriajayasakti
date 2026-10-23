import { useState } from "react";
import { inputClass } from "@/components/shop/shell";
import type { Partner } from "@/lib/shop/types";

type Tipe = "Supplier" | "Pelanggan";

const tone: Record<Tipe, { dot: string; text: string }> = {
  Supplier: { dot: "bg-blue-500", text: "text-blue-700" },
  Pelanggan: { dot: "bg-emerald-500", text: "text-emerald-700" },
};

/**
 * Kolom nama Supplier / Pelanggan yang bisa diketik bebas, dengan daftar pilihan yang dikelompokkan:
 * Supplier sendiri, Pelanggan sendiri. `tipe` membatasi ke satu kelompok, `first` menentukan kelompok yang tampil di atas.
 */
export function PartnerPicker(props: {
  partners: Partner[];
  value: string;
  onChange: (nama: string) => void;
  tipe?: Tipe;
  first?: Tipe;
  placeholder?: string;
  id?: string;
}) {
  const { partners, value, onChange, tipe, first = "Supplier", placeholder = "Ketik atau pilih dari daftar", id } = props;
  const [open, setOpen] = useState(false);
  const needle = value.trim().toLowerCase();
  const order: Tipe[] = tipe ? [tipe] : first === "Pelanggan" ? ["Pelanggan", "Supplier"] : ["Supplier", "Pelanggan"];
  const groups = order
    .map((t) => {
      const all = partners.filter((row) => row.tipe === t && (!needle || row.nama.toLowerCase().includes(needle)));
      return { tipe: t, total: all.length, rows: all.slice(0, 30) };
    })
    .filter((group) => group.total > 0);

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={id}
          autoComplete="off"
          className={`${inputClass} h-12 pr-9`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Kosongkan"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-base leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
          >
            ×
          </button>
        ) : null}
      </div>
      {open && groups.length > 0 ? (
        <div role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-white shadow-xl">
          {groups.map((group) => (
            <div key={group.tipe}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                <span className={`flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide uppercase ${tone[group.tipe].text}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${tone[group.tipe].dot}`} />
                  {group.tipe}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{group.total}</span>
              </div>
              {group.rows.map((row) => (
                <div
                  key={row.id}
                  role="option"
                  aria-selected={row.nama === value}
                  className={`cursor-pointer truncate px-3 py-2 text-left text-sm font-medium hover:bg-blue-50 ${row.nama === value ? "bg-blue-50 text-blue-800" : "text-slate-800"}`}
                  onMouseDown={(e) => { e.preventDefault(); onChange(row.nama); setOpen(false); }}
                >
                  {row.nama}
                </div>
              ))}
              {group.total > group.rows.length ? <div className="px-3 py-1.5 text-[11px] text-slate-500">+{group.total - group.rows.length} lainnya, ketik untuk mempersempit</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
