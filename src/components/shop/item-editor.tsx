import { useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass, Mark } from "@/components/shop/shell";
import { searchProducts } from "@/lib/shop/api";
import { digits, grouped, rupiah } from "@/lib/shop/format";
import type { Product } from "@/lib/shop/types";

export type Jenis = "MASUK" | "KELUAR";

/** Info barang katalog yang dibutuhkan editor (detail + satuan Pcs/Dus). */
export type ProductInfo = Pick<
  Product,
  "merek" | "partNumber" | "partNumbersAlt" | "kodePajak" | "kategori" | "satuan" | "satuanAlt" | "isiSatuanAlt" | "hargaJual" | "hargaJualAlt" | "stok"
> & { kode?: string };

export type EditorRow = {
  id: number;
  nama: string;
  satuan: string;
  jumlah: number;
  harga: string;
  jenis: Jenis;
  productId: number | null;
  isAlt: boolean;
  /** Satuan asli baris saat nota dibuka (untuk mendeteksi perubahan Pcs <-> Dus). */
  origIsAlt?: boolean;
  info?: ProductInfo | null;
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
  info?: ProductInfo | null;
};

const hasDus = (info?: ProductInfo | null) => Boolean(info && info.satuanAlt && info.isiSatuanAlt > 0);

function infoOf(product: Product): ProductInfo {
  return {
    merek: product.merek,
    partNumber: product.partNumber,
    partNumbersAlt: product.partNumbersAlt,
    kodePajak: product.kodePajak,
    kategori: product.kategori,
    satuan: product.satuan,
    satuanAlt: product.satuanAlt,
    isiSatuanAlt: product.isiSatuanAlt,
    hargaJual: product.hargaJual,
    hargaJualAlt: product.hargaJualAlt,
    stok: product.stok,
    kode: product.kode,
  };
}

/** Bangun baris editor dari satu baris hasil getInvoice (lihat logic.server getInvoice). */
export function rowFromLine(line: Record<string, unknown>, removed = false): EditorRow {
  const productId = line.product_id == null ? null : Number(line.product_id);
  const satuan = String(line.satuan || "Pcs");
  const jumlah = Number(line.jumlah);
  const konv = jumlah > 0 ? Math.round(Number(line.jumlah_dasar ?? jumlah) / jumlah) : 1;
  const satuanAlt = String(line.product_satuan_alt ?? "");
  const isiAlt = Number(line.product_isi_alt ?? 0);
  const isAlt = Boolean(productId && satuanAlt && isiAlt > 0 && konv > 1 && satuan.toLowerCase() === satuanAlt.toLowerCase());
  const info: ProductInfo | null = productId
    ? {
        merek: String(line.product_merek ?? ""),
        partNumber: String(line.product_part ?? ""),
        partNumbersAlt: String(line.product_alt ?? ""),
        kodePajak: String(line.kode_pajak ?? ""),
        kategori: String(line.kategori ?? ""),
        satuan: String(line.product_satuan ?? "Pcs"),
        satuanAlt,
        isiSatuanAlt: isiAlt,
        hargaJual: Number(line.product_harga_jual ?? 0),
        hargaJualAlt: Number(line.product_harga_jual_alt ?? 0),
        stok: Number(line.product_stok ?? 0),
        kode: String(line.kode ?? ""),
      }
    : null;
  return {
    id: Number(line.id),
    nama: String(line.custom_item || line.product_nama || "Barang"),
    satuan,
    jumlah,
    harga: grouped(Number(line.harga_satuan || 0)),
    jenis: (String(line.jenis) === "MASUK" ? "MASUK" : "KELUAR") as Jenis,
    productId,
    isAlt,
    origIsAlt: isAlt,
    info,
    removed,
  };
}

/** Total nilai barang keluar (baris aktif + tambahan). */
export function editorSubtotal(rows: EditorRow[], adds: EditorAdd[]) {
  return rows.filter((r) => !r.removed && r.jenis === "KELUAR").reduce((s, r) => s + Math.max(1, r.jumlah || 1) * digits(r.harga), 0)
    + adds.filter((r) => r.jenis === "KELUAR").reduce((s, r) => s + Math.max(1, r.jumlah || 1) * digits(r.harga), 0);
}

/**
 * Ubah isi editor jadi payload server. Bila satuan baris lama diganti (Pcs <-> Dus) pada barang yang sama,
 * baris lama dihapus (stok dikembalikan) dan diganti baris baru dengan satuan baru (stok dihitung ulang).
 */
export function editorPayload(rows: EditorRow[], adds: EditorAdd[]) {
  const lines: Array<{ id: number; qty: number; jenis: Jenis; harga: number; productId: number | null; isAlt: boolean }> = [];
  const add: Array<{ productId?: number | null; custom?: string; nama?: string; satuan?: string; jenis?: string; qty: number; harga?: number; isAlt?: boolean }> = [];
  for (const row of rows) {
    const qty = Math.max(1, row.jumlah || 1);
    const harga = row.jenis === "KELUAR" ? digits(row.harga) : 0;
    const replace = !row.removed && !row.swapped && row.productId != null && row.isAlt !== Boolean(row.origIsAlt);
    lines.push({ id: row.id, qty: row.removed || replace ? 0 : qty, jenis: row.jenis, harga, productId: row.productId, isAlt: row.isAlt });
    if (replace) add.push({ productId: row.productId, isAlt: row.isAlt, jenis: row.jenis, qty, harga });
  }
  for (const row of adds) {
    const qty = Math.max(1, row.jumlah || 1);
    const harga = row.jenis === "KELUAR" ? digits(row.harga) : 0;
    add.push(row.productId
      ? { productId: row.productId, isAlt: row.isAlt, jenis: row.jenis, qty, harga }
      : { custom: row.nama, nama: row.nama, satuan: row.satuan, jenis: row.jenis, qty, harga });
  }
  return { lines, add };
}

export function stokText(info: { stok: number; satuan: string; satuanAlt: string; isiSatuanAlt: number }) {
  if (!(info.satuanAlt && info.isiSatuanAlt > 0)) return `${info.stok} ${info.satuan}`;
  const dus = Math.floor(info.stok / info.isiSatuanAlt);
  const sisa = info.stok % info.isiSatuanAlt;
  return `${info.stok} ${info.satuan} (${dus} ${info.satuanAlt}${sisa ? ` + ${sisa} ${info.satuan}` : ""})`;
}

/** Detail barang seperti di Daftar Sparepart: nama (kode pajak), merek, kategori, PN, PN Alt. */
function ProductDetail({ nama, info, q, compact = false }: { nama: string; info?: ProductInfo | null; q: string; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`font-semibold text-slate-900 ${compact ? "text-sm" : "text-sm"}`}>
        <Mark text={nama} q={q} />
        {info?.kodePajak ? <> (<Mark text={info.kodePajak} q={q} />)</> : null}
      </p>
      {info ? (
        <>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {info.merek ? <span className="inline-block rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-bold text-blue-800"><Mark text={info.merek} q={q} /></span> : null}
            {info.kategori ? <span className="text-[11px] font-bold text-slate-600"><Mark text={info.kategori} q={q} /></span> : null}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-slate-700">
            PN: <Mark text={info.partNumber || info.kode || "-"} q={q} />
            {info.partNumbersAlt ? <> · Alt: <Mark text={info.partNumbersAlt} q={q} /></> : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

/**
 * Editor barang per baris: ubah qty/harga/satuan (Pcs <-> Dus), jenis bila withJenis, hapus per barang,
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
  const [addJenis, setAddJenis] = useState<Jenis>("KELUAR");
  const jenisBaru: Jenis = lockKeluar ? "KELUAR" : addJenis;

  useEffect(() => {
    if (addQ.trim().length < 1) return setAddHits([]);
    const timer = setTimeout(() => void searchProducts({ data: { q: addQ, limit: 12 } }).then((res) => setAddHits(res.items)).catch((error: Error) => toast.error(error.message)), 160);
    return () => clearTimeout(timer);
  }, [addQ]);

  const patchRow = (id: number, patch: Partial<EditorRow>) => onRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchAdd = (key: string, patch: Partial<EditorAdd>) => onAdds(adds.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Harga katalog untuk satuan tertentu (0 bila belum diisi). */
  const hargaKatalog = (info: ProductInfo, isAlt: boolean) => (isAlt ? info.hargaJualAlt : info.hargaJual) || 0;

  function unitPatch(info: ProductInfo, nextAlt: boolean, jenis: Jenis, current: string) {
    const price = hargaKatalog(info, nextAlt);
    return {
      isAlt: nextAlt,
      satuan: nextAlt ? info.satuanAlt : info.satuan,
      harga: jenis === "KELUAR" && price > 0 ? grouped(price) : current,
    };
  }

  function addProduct(product: Product, isAlt: boolean) {
    if (isAlt && !(product.satuanAlt && product.isiSatuanAlt > 0)) return toast.error("Barang ini tidak punya satuan dus.");
    const hargaJual = (isAlt ? product.hargaJualAlt : product.hargaJual) || 0;
    const key = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onAdds([...adds, { key, productId: product.id, nama: product.nama, satuan: isAlt ? product.satuanAlt : product.satuan, isAlt, jumlah: 1, harga: jenisBaru === "KELUAR" ? grouped(hargaJual) : "", jenis: jenisBaru, info: infoOf(product) }]);
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

  const labelCls = "mb-0.5 block text-[10px] font-bold uppercase text-muted";

  const qtyInput = (value: number, label: string, onChange: (n: number) => void, disabled = false) => (
    <input disabled={disabled} className={`${inputClass} num text-center`} inputMode="numeric" aria-label={label} value={value || ""} placeholder="1" onFocus={(e) => e.target.select()} onChange={(e) => onChange(digits(e.target.value))} />
  );

  const jenisSelect = (value: Jenis, onChange: (j: Jenis) => void, disabled = false) => (
    <select disabled={disabled || lockKeluar} className={`${inputClass} px-1 text-xs font-bold`} value={value} onChange={(e) => onChange(e.target.value as Jenis)}>
      <option value="MASUK">Masuk</option>
      <option value="KELUAR">Keluar</option>
    </select>
  );

  /** Pilihan satuan: dropdown Pcs/Dus bila barang punya dus, selain itu label saja. */
  const satuanSelect = (info: ProductInfo | null | undefined, isAlt: boolean, satuan: string, name: string, onChange: (alt: boolean) => void, disabled = false) => {
    if (!info || !hasDus(info)) return <div className="flex h-11 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs font-semibold text-slate-700">{satuan || "Pcs"}</div>;
    return (
      <select disabled={disabled} aria-label={`Satuan ${name}`} className={`${inputClass} px-1 text-xs font-bold ${isAlt ? "border-blue-400 bg-blue-50 text-blue-800" : ""}`} value={isAlt ? "alt" : "base"} onChange={(e) => onChange(e.target.value === "alt")}>
        <option value="base">{info.satuan || "Pcs"}</option>
        <option value="alt">{info.satuanAlt}</option>
      </select>
    );
  };

  const konvHint = (info: ProductInfo | null | undefined, isAlt: boolean, jumlah: number) => (isAlt && info && info.isiSatuanAlt > 0
    ? <p className="num mt-0.5 text-center text-[11px] text-blue-700">= {Math.max(1, jumlah || 1) * info.isiSatuanAlt} {info.satuan}</p>
    : null);

  function priceBlock(value: string, jenis: Jenis, jumlah: number, name: string, onChange: (v: string) => void, disabled = false, info?: ProductInfo | null, isAlt = false) {
    const katalog = info ? hargaKatalog(info, isAlt) : 0;
    return (
      <div>
        <input disabled={disabled || jenis === "MASUK"} className={`${inputClass} num text-right`} inputMode="numeric" aria-label={`Harga ${name}`} value={jenis === "MASUK" ? "" : value} placeholder={jenis === "MASUK" ? "-" : "0"} onFocus={(e) => e.target.select()} onChange={(e) => onChange(grouped(digits(e.target.value)))} />
        <p className="num mt-0.5 text-right text-[11px] text-muted">{disabled || jenis === "MASUK" ? "" : `= ${rupiah(Math.max(1, jumlah || 1) * digits(value))}`}</p>
        {!disabled && jenis === "KELUAR" && katalog > 0 && digits(value) !== katalog ? (
          <button type="button" className="num mt-0.5 block w-full text-right text-[11px] font-semibold text-blue-700 underline" onClick={() => onChange(grouped(katalog))}>Harga jual {rupiah(katalog)}</button>
        ) : null}
      </div>
    );
  }

  /** Kolom kontrol: Jenis | Qty | Satuan | Harga | Hapus */
  const gridCls = withJenis ? "grid-cols-[5.5rem_4.5rem_5.5rem_1fr_4rem]" : "grid-cols-[4.5rem_5.5rem_1fr_4rem]";
  const heads = (
    <div className={`grid ${gridCls} gap-2`}>
      {withJenis ? <span className={labelCls}>Jenis</span> : null}
      <span className={`${labelCls} text-center`}>Qty</span>
      <span className={`${labelCls} text-center`}>Satuan</span>
      <span className={`${labelCls} text-right`}>Harga satuan</span>
      <span />
    </div>
  );

  return (
    <div>
      <ul className="mt-3 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
        {rows.map((row) => (
          <li key={row.id} className={`rounded-lg border border-line bg-white p-2 ${row.removed ? "opacity-50" : ""}`}>
            <div className={row.removed ? "line-through" : ""}>
              <ProductDetail nama={row.nama} info={row.info} q="" />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
              {row.swapped ? <span className="rounded-md bg-blue-100 px-1 py-0.5 text-[10px] font-bold text-blue-800">Diganti</span> : null}
              {!row.productId ? <span className="rounded-md bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800">Custom</span> : null}
              {row.removed ? "Akan dihapus dari nota" : row.info ? `Stok: ${stokText(row.info)}` : row.satuan}
              {!row.removed && row.productId != null && !row.swapped && row.isAlt !== Boolean(row.origIsAlt) ? <span className="rounded-md bg-blue-100 px-1 py-0.5 text-[10px] font-bold text-blue-800">Satuan diubah</span> : null}
            </p>
            <div className="mt-2">{heads}</div>
            <div className={`mt-0.5 grid ${gridCls} items-start gap-2 text-sm`}>
              {withJenis ? jenisSelect(row.jenis, (jenis) => patchRow(row.id, { jenis }), row.removed) : null}
              <div>
                {qtyInput(row.jumlah, `Qty ${row.nama}`, (jumlah) => patchRow(row.id, { jumlah }), row.removed)}
                {row.removed ? null : konvHint(row.info, row.isAlt, row.jumlah)}
              </div>
              {satuanSelect(row.info, row.isAlt, row.satuan, row.nama, (alt) => row.info && patchRow(row.id, unitPatch(row.info, alt, row.jenis, row.harga)), row.removed)}
              {priceBlock(row.harga, row.jenis, row.jumlah, row.nama, (harga) => patchRow(row.id, { harga }), row.removed, row.info, row.isAlt)}
              <button type="button" className={`h-11 rounded-lg border px-1 text-xs font-bold ${row.removed ? "border-line text-slate-700" : "border-red-200 text-danger"}`} onClick={() => patchRow(row.id, { removed: !row.removed })}>{row.removed ? "Batal" : "Hapus"}</button>
            </div>
            {withSwap && !row.removed ? (
              <div className="mt-2">
                <input className={`${inputClass} h-9 text-xs`} placeholder="Ganti barang ini: ketik nama / part number" value={swap?.id === row.id ? swap.q : ""} onChange={(e) => {
                  const q = e.target.value;
                  setSwap({ id: row.id, q, items: [] });
                  if (q.trim().length < 1) return;
                  void searchProducts({ data: { q, limit: 10 } }).then((res) => setSwap((prev) => (prev && prev.id === row.id && prev.q === q ? { ...prev, items: res.items } : prev)));
                }} />
                {swap?.id === row.id && swap.q.trim() ? (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-white">
                    {swap.items.length === 0 ? <p className="px-3 py-3 text-center text-xs text-muted">Barang tidak ditemukan.</p> : null}
                    {swap.items.map((item) => (
                      <button type="button" key={item.id} className="block w-full border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-blue-50" onClick={() => {
                        const price = item.hargaJual || 0;
                        patchRow(row.id, {
                          productId: item.id,
                          nama: item.nama,
                          satuan: item.satuan,
                          isAlt: false,
                          swapped: true,
                          info: infoOf(item),
                          harga: row.jenis === "KELUAR" && price > 0 ? grouped(price) : row.harga,
                        });
                        setSwap(null);
                      }}>
                        <ProductDetail nama={item.nama} info={infoOf(item)} q={swap.q} compact />
                        <p className="num mt-0.5 text-[11px] text-muted">Stok: {stokText(item)} · {rupiah(item.hargaJual || 0)}{item.hargaJualAlt ? ` · ${item.satuanAlt} ${rupiah(item.hargaJualAlt)}` : ""}</p>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
        {adds.map((row) => (
          <li key={row.key} className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
            <ProductDetail nama={row.nama} info={row.info} q="" />
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
              <span className="rounded-md bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-800">Baru</span>
              {row.productId ? (row.info ? `Stok: ${stokText(row.info)}` : row.satuan) : `${row.satuan} · custom`}
            </p>
            <div className="mt-2">{heads}</div>
            <div className={`mt-0.5 grid ${gridCls} items-start gap-2 text-sm`}>
              {withJenis ? jenisSelect(row.jenis, (jenis) => patchAdd(row.key, { jenis, harga: jenis === "MASUK" ? "" : row.harga })) : null}
              <div>
                {qtyInput(row.jumlah, `Qty ${row.nama}`, (jumlah) => patchAdd(row.key, { jumlah }))}
                {konvHint(row.info, row.isAlt, row.jumlah)}
              </div>
              {satuanSelect(row.info, row.isAlt, row.satuan, row.nama, (alt) => row.info && patchAdd(row.key, unitPatch(row.info, alt, row.jenis, row.harga)))}
              {priceBlock(row.harga, row.jenis, row.jumlah, row.nama, (harga) => patchAdd(row.key, { harga }), false, row.info, row.isAlt)}
              <button type="button" className="h-11 rounded-lg border border-red-200 px-1 text-xs font-bold text-danger" onClick={() => onAdds(adds.filter((r) => r.key !== row.key))}>Hapus</button>
            </div>
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
        <input className={`${inputClass} mt-2`} placeholder="Cari nama, part number, merek, atau kategori" value={addQ} onChange={(e) => setAddQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (addHits[0]) addProduct(addHits[0], e.shiftKey && hasDus(infoOf(addHits[0]))); } }} />
        {addQ.trim() ? (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line bg-white">
            {addHits.length === 0 ? <p className="px-3 py-3 text-center text-xs text-muted">Barang tidak ditemukan.</p> : null}
            {addHits.map((hit) => {
              const dusOk = Boolean(hit.satuanAlt && hit.isiSatuanAlt > 0);
              return (
                <div key={hit.id} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0 hover:bg-blue-50">
                  <div className="min-w-0 flex-1">
                    <ProductDetail nama={hit.nama} info={infoOf(hit)} q={addQ} />
                    <p className="num mt-0.5 text-[11px] text-slate-700">
                      Stok: {stokText(hit)} · <b className="text-emerald-700">{rupiah(hit.hargaJual || 0)}</b>{dusOk ? <> · {hit.satuanAlt} <b className="text-emerald-700">{hit.hargaJualAlt ? rupiah(hit.hargaJualAlt) : "-"}</b></> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => addProduct(hit, false)}>+ {hit.satuan || "Pcs"}</button>
                    {dusOk ? <button type="button" className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white" onClick={() => addProduct(hit, true)}>+ {hit.satuanAlt}</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <p className="mt-1 text-[11px] text-muted">Enter = tambah per Pcs · Shift+Enter = tambah per Dus (hasil teratas). Satuan bisa diganti Pcs/Dus di baris barang.</p>
        <div className="mt-2 grid grid-cols-[1fr_5rem_auto] gap-2">
          <input className={inputClass} placeholder="Atau barang custom (nama barang / jasa)" value={customNama} onChange={(e) => setCustomNama(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
          <input className={inputClass} aria-label="Satuan barang custom" placeholder="Satuan" value={customSatuan} onChange={(e) => setCustomSatuan(e.target.value)} />
          <button type="button" className="h-11 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={addCustom}>+ Custom</button>
        </div>
      </div>
    </div>
  );
}
