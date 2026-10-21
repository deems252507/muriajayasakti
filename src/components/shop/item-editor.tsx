import { useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass } from "@/components/shop/shell";
import { searchProducts } from "@/lib/shop/api";
import { digits, grouped, rupiah } from "@/lib/shop/format";
import type { Product } from "@/lib/shop/types";

export type Jenis = "MASUK" | "KELUAR";
export type EditorRow = {
  id: number;
  nama: string;
  satuan: string;
  jumlah: number;
  harga: string;
  jenis: Jenis;
  productId: number | null;
  isAlt: boolean;
  swapped?: boolean;
  removed?: boolean;
};
export type EditorAdd = {
  key: string;
  productId: number | null;
  nama: string;
  satuan: string;
  isAlt: boolean;
  jumlah: number;
  harga: string;
  jenis: Jenis;
};

/** Total nilai barang keluar (baris aktif + tambahan). */
export function editorSubtotal(rows: EditorRow[], adds: EditorAdd[]) {
  return rows.filter((r) => !r.removed && r.jenis === "KELUAR").reduce((s, r) => s + Math.max(1, r.jumlah || 1) * digits(r.harga), 0)
    + adds.filter((r) => r.jenis === "KELUAR").reduce((s, r) => s + Math.max(1, r.jumlah || 1) * digits(r.harga), 0);
}

/**
 * Editor barang per baris: ubah qty/harga (dan jenis bila withJenis), hapus per barang,
 * ganti barang (withSwap), tambah barang katalog (Pcs/Dus) atau custom.
 */
export function ItemEditor(props: {
  rows: EditorRow[];
  adds: EditorAdd[];
  onRows: (rows: EditorRow[]) => void;
  onAdds: (adds: EditorAdd[]) => void;
  withJenis?: boolean;
  withSwap?: boolean;
  lockKeluar?: boolean;
}) {
  const { rows, adds, onRows, onAdds, withJenis = false, withSwap = false, lockKeluar = false } = props;
  const [addQ, setAddQ] = useState("");
  const [addHits, setAddHits] = useState<Product[]>([]);
  const [customNama, setCustomNama] = useState("");
  const [customSatuan, setCustomSatuan] = useState("Item");
  const [swap, setSwap] = useState<{ id: number; q: string; items: Product[] } | null>(null);
  const defaultJenis: Jenis = lockKeluar ? "KELUAR" : "KELUAR";
  const [addJenis, setAddJenis] = useState<Jenis>(defaultJenis);
  const jenisBaru: Jenis = lockKeluar ? "KELUAR" : addJenis;
  const cols = withJenis ? "grid-cols-[1fr_5.5rem_4.5rem_6.5rem_4rem]" : "grid-cols-[1fr_4.5rem_6.5rem_4rem]";

  useEffect(() => {
    if (addQ.trim().length < 1) return setAddHits([]);
    const timer = setTimeout(() => void searchProducts({ data: { q: addQ, limit: 8 } }).then((res) => setAddHits(res.items)).catch((error: Error) => toast.error(error.message)), 160);
    return () => clearTimeout(timer);
  }, [addQ]);

  const patchRow = (id: number, patch: Partial<EditorRow>) => onRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchAdd = (key: string, patch: Partial<EditorAdd>) => onAdds(adds.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addProduct(product: Product, isAlt: boolean) {
    if (isAlt && !(product.satuanAlt && product.isiSatuanAlt > 0)) return toast.error("Barang ini tidak punya satuan dus.");
    const hargaJual = (isAlt ? product.hargaJualAlt : product.hargaJual) || 0;
    const key = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onAdds([...adds, { key, productId: product.id, nama: product.nama, satuan: isAlt ? product.satuanAlt : product.satuan, isAlt, jumlah: 1, harga: jenisBaru === "KELUAR" ? grouped(hargaJual) : "", jenis: jenisBaru }]);
    setAddQ("");
    setAddHits([]);
  }

  function addCustom() {
    const nama = customNama.trim();
    if (!nama) return toast.error("Isi nama barang custom dulu.");
    const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onAdds([...adds, { key, productId: null, nama, satuan: customSatuan.trim() || "Item", isAlt: false, jumlah: 1, harga: "", jenis: jenisBaru }]);
    setCustomNama("");
  }

  const qtyInput = (value: number, label: string, onChange: (n: number) => void, disabled = false) => (
    <input disabled={disabled} className={`${inputClass} num text-center`} inputMode="numeric" aria-label={label} value={value || ""} placeholder="1" onFocus={(e) => e.target.select()} onChange={(e) => onChange(digits(e.target.value))} />
  );

  const jenisSelect = (value: Jenis, onChange: (j: Jenis) => void, disabled = false) => (
    <select disabled={disabled || lockKeluar} className={`${inputClass} px-1 text-xs font-bold`} value={value} onChange={(e) => onChange(e.target.value as Jenis)}>
      <option value="MASUK">Masuk</option>
      <option value="KELUAR">Keluar</option>
    </select>
  );

  return (
    <div>
      <div className={`mt-3 grid ${cols} gap-2 text-[11px] font-bold uppercase text-muted`}>
        <span>Barang</span>{withJenis ? <span>Jenis</span> : null}<span className="text-center">Qty</span><span className="text-right">Harga satuan</span><span />
      </div>
      <ul className="mt-1 max-h-[34vh] space-y-2 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.id} className={`rounded-lg ${row.removed ? "opacity-50" : ""}`}>
            <div className={`grid ${cols} items-start gap-2 text-sm`}>
              <span className={`font-medium ${row.removed ? "line-through" : ""}`}>
                {row.nama}{row.swapped ? <span className="ml-1 rounded-md bg-blue-100 px-1 py-0.5 text-[10px] font-bold text-blue-800">Diganti</span> : null}
                <span className="block text-[11px] font-normal text-muted">{row.removed ? "Akan dihapus dari nota" : row.satuan}</span>
              </span>
              {withJenis ? jenisSelect(row.jenis, (jenis) => patchRow(row.id, { jenis }), row.removed) : null}
              {qtyInput(row.jumlah, `Qty ${row.nama}`, (jumlah) => patchRow(row.id, { jumlah }), row.removed)}
              <div>
                <input disabled={row.removed || row.jenis === "MASUK"} className={`${inputClass} num text-right`} inputMode="numeric" aria-label={`Harga ${row.nama}`} value={row.jenis === "MASUK" ? "" : row.harga} placeholder={row.jenis === "MASUK" ? "-" : "0"} onFocus={(e) => e.target.select()} onChange={(e) => patchRow(row.id, { harga: grouped(digits(e.target.value)) })} />
                <p className="num mt-0.5 text-right text-[11px] text-muted">{row.removed || row.jenis === "MASUK" ? "" : `= ${rupiah(Math.max(1, row.jumlah || 1) * digits(row.harga))}`}</p>
              </div>
              <button type="button" className={`h-11 rounded-lg border px-1 text-xs font-bold ${row.removed ? "border-line text-slate-700" : "border-red-200 text-danger"}`} onClick={() => patchRow(row.id, { removed: !row.removed })}>{row.removed ? "Batal" : "Hapus"}</button>
            </div>
            {withSwap && !row.removed ? (
              <div className="mt-1">
                <input className={`${inputClass} h-9 text-xs`} placeholder="Ganti barang ini: ketik nama / part number" value={swap?.id === row.id ? swap.q : ""} onChange={(e) => {
                  const q = e.target.value;
                  setSwap({ id: row.id, q, items: [] });
                  if (q.trim().length < 2) return;
                  void searchProducts({ data: { q, limit: 6 } }).then((res) => setSwap((prev) => (prev && prev.id === row.id && prev.q === q ? { ...prev, items: res.items } : prev)));
                }} />
                {swap?.id === row.id && swap.items.length ? (
                  <div className="mt-1 max-h-28 overflow-y-auto rounded border border-line bg-white">
                    {swap.items.slice(0, 6).map((item) => (
                      <button type="button" key={item.id} className="block w-full px-2 py-1 text-left text-sm hover:bg-blue-50" onClick={() => {
                        patchRow(row.id, { productId: item.id, nama: item.nama, satuan: item.satuan, isAlt: false, swapped: true });
                        setSwap(null);
                      }}>{item.nama}<span className="ml-2 text-[11px] text-muted">Stok {item.stok} {item.satuan}</span></button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
        {adds.map((row) => (
          <li key={row.key} className={`grid ${cols} items-start gap-2 rounded-lg bg-emerald-50 p-1 text-sm`}>
            <span className="font-medium">{row.nama}<span className="ml-1 rounded-md bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-800">Baru</span><span className="block text-[11px] font-normal text-muted">{row.satuan}{row.productId ? "" : " · custom"}</span></span>
            {withJenis ? jenisSelect(row.jenis, (jenis) => patchAdd(row.key, { jenis, harga: jenis === "MASUK" ? "" : row.harga })) : null}
            {qtyInput(row.jumlah, `Qty ${row.nama}`, (jumlah) => patchAdd(row.key, { jumlah }))}
            <div>
              <input disabled={row.jenis === "MASUK"} className={`${inputClass} num text-right`} inputMode="numeric" aria-label={`Harga ${row.nama}`} value={row.jenis === "MASUK" ? "" : row.harga} placeholder={row.jenis === "MASUK" ? "-" : "0"} onFocus={(e) => e.target.select()} onChange={(e) => patchAdd(row.key, { harga: grouped(digits(e.target.value)) })} />
              <p className="num mt-0.5 text-right text-[11px] text-muted">{row.jenis === "MASUK" ? "" : `= ${rupiah(Math.max(1, row.jumlah || 1) * digits(row.harga))}`}</p>
            </div>
            <button type="button" className="h-11 rounded-lg border border-red-200 px-1 text-xs font-bold text-danger" onClick={() => onAdds(adds.filter((r) => r.key !== row.key))}>Hapus</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-lg border border-dashed border-slate-400 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">Tambah barang</p>
          {withJenis && !lockKeluar ? (
            <div className="inline-flex rounded-lg bg-white p-0.5 text-xs font-bold">
              <button type="button" className={`h-8 rounded-md px-3 ${addJenis === "KELUAR" ? "bg-red-600 text-white" : "text-slate-600"}`} onClick={() => setAddJenis("KELUAR")}>Keluar</button>
              <button type="button" className={`h-8 rounded-md px-3 ${addJenis === "MASUK" ? "bg-emerald-600 text-white" : "text-slate-600"}`} onClick={() => setAddJenis("MASUK")}>Masuk</button>
            </div>
          ) : null}
        </div>
        <input className={`${inputClass} mt-2`} placeholder="Cari nama / part number barang" value={addQ} onChange={(e) => setAddQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (addHits[0]) addProduct(addHits[0], false); } }} />
        {addQ.trim() ? (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-line bg-white">
            {addHits.length === 0 ? <p className="px-3 py-3 text-center text-xs text-muted">Barang tidak ditemukan.</p> : null}
            {addHits.map((hit) => {
              const dusOk = Boolean(hit.satuanAlt && hit.isiSatuanAlt > 0);
              return (
                <div key={hit.id} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{hit.nama}</p>
                    <p className="text-[11px] text-muted">PN: {hit.partNumber || hit.kode || "-"} · Stok: {hit.stok} {hit.satuan} · {rupiah(hit.hargaJual || 0)}</p>
                  </div>
                  <button type="button" className="h-10 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => addProduct(hit, false)}>+ {hit.satuan || "Pcs"}</button>
                  {dusOk ? <button type="button" className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white" onClick={() => addProduct(hit, true)}>+ {hit.satuanAlt}</button> : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-[1fr_5rem_auto] gap-2">
          <input className={inputClass} placeholder="Atau barang custom (nama barang / jasa)" value={customNama} onChange={(e) => setCustomNama(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
          <input className={inputClass} aria-label="Satuan barang custom" placeholder="Satuan" value={customSatuan} onChange={(e) => setCustomSatuan(e.target.value)} />
          <button type="button" className="h-11 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={addCustom}>+ Custom</button>
        </div>
      </div>
    </div>
  );
}
