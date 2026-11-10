import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { STOCK_COLUMNS } from "@/lib/shop/print";

/** Kotak pilih kolom sebelum cetak PDF Laporan Stok. Esc / klik di luar menutup. */
export function PrintColumnsDialog({
  selected,
  onCancel,
  onConfirm,
}: {
  selected: string[];
  onCancel: () => void;
  onConfirm: (keys: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(() => STOCK_COLUMNS.filter((col) => selected.includes(col.key)).map((col) => col.key));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const toggle = (key: string) => setPicked((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  const allKeys = STOCK_COLUMNS.map((col) => col.key);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/45 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-cols-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid size-11 place-items-center rounded-full bg-blue-50 text-accent">
          <Printer className="size-5" />
        </div>
        <h2 id="print-cols-title" className="mt-4 text-lg font-bold text-ink">Pilih kolom yang dicetak</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Hanya kolom yang dicentang yang masuk ke PDF. Kertas otomatis memanjang (landscape) bila kolomnya banyak.</p>
        <div className="mt-3 flex gap-4 text-sm">
          <button type="button" className="btn-inline text-accent" onClick={() => setPicked(allKeys)}>Pilih semua</button>
          <button type="button" className="btn-inline text-slate-600" onClick={() => setPicked([])}>Kosongkan</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {STOCK_COLUMNS.map((col) => (
            <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink">
              <input type="checkbox" className="size-4" checked={picked.includes(col.key)} onChange={() => toggle(col.key)} />
              {col.label}
            </label>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{picked.length} kolom dipilih</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-10 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onCancel}
            >
              Batal
            </button>
            <button
              type="button"
              disabled={picked.length === 0}
              className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              onClick={() => onConfirm(picked)}
            >
              <Printer className="size-4" /> Cetak PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
