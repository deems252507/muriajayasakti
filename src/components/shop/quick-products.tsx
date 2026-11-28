import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { searchProducts } from "@/lib/shop/api";
import { rupiah } from "@/lib/shop/format";
import type { Product } from "@/lib/shop/types";

// Daftar sparepart cepat: Ctrl+D dari halaman mana saja. Ketik, lihat stok & harga, Esc untuk tutup.
// ↑/↓ memilih baris, Enter menyalin part number baris terpilih.
export function QuickProducts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setSel(0);
    const t = window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const text = q.trim();
    if (!text) { setItems([]); setError(""); setLoading(false); return; }
    const id = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchProducts({ data: { q: text, limit: 30 } })
        .then((res) => { if (id !== seq.current) return; setItems(res.items); setError(""); setSel(0); })
        .catch((e: Error) => { if (id === seq.current) setError(e.message || "Gagal mencari"); })
        .finally(() => { if (id === seq.current) setLoading(false); });
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const copy = (p: Product) => {
    const text = p.partNumber || p.kode || p.nama;
    void navigator.clipboard?.writeText(text).then(() => toast.success(`Disalin: ${text}`)).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/50 p-3 pt-[8vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Daftar sparepart cepat" className="flex max-h-[80dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, part number, merek, kategori..."
            aria-label="Cari sparepart"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); onClose(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, Math.max(items.length - 1, 0))); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter" && items[sel]) { e.preventDefault(); copy(items[sel]); }
            }}
          />
          <button type="button" onClick={onClose} aria-label="Tutup" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {error ? <p className="p-4 text-sm text-red-600">{error}</p> : null}
          {!q.trim() ? <p className="p-4 text-sm text-slate-500">Ketik untuk mencari sparepart. ↑↓ pilih · Enter salin part number · Esc tutup.</p> : null}
          {q.trim() && !loading && !error && items.length === 0 ? <p className="p-4 text-sm text-slate-500">Tidak ada barang yang cocok.</p> : null}
          {items.map((p, i) => {
            const habis = p.stok <= 0;
            const kritis = !habis && p.stok <= p.stokMin;
            return (
              <button
                key={p.id}
                type="button"
                data-i={i}
                onMouseEnter={() => setSel(i)}
                onClick={() => copy(p)}
                className={`flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left ${i === sel ? "bg-blue-50" : "bg-white"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.nama}</p>
                  <p className="truncate text-xs text-slate-500">{[p.partNumber, p.merek, p.kategori].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-extrabold">{rupiah(p.hargaJual)}</p>
                  {p.satuanAlt && p.hargaJualAlt ? <p className="text-[11px] text-slate-500">{p.satuanAlt}: {rupiah(p.hargaJualAlt)}</p> : null}
                </div>
                <span className={`w-20 shrink-0 rounded-lg px-2 py-1 text-center text-xs font-bold ${habis ? "bg-red-100 text-red-700" : kritis ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                  {habis ? "Habis" : `${p.stok} ${p.satuan}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
