import { Fragment, type ReactNode } from "react";
import { Mark } from "@/components/shop/shell";
import { rupiah } from "@/lib/shop/format";
import type { Product } from "@/lib/shop/types";

export type StockLevel = "HABIS" | "MENIPIS" | "AMAN";

export function stockLevel(item: Product): StockLevel {
  if (item.stok <= 0) return "HABIS";
  if (item.stokMin > 0 && item.stok <= item.stokMin) return "MENIPIS";
  return "AMAN";
}

const th = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2.5 align-middle";

/**
 * Tabel stok Daftar Sparepart dan Laporan Stok. Kolom dan isi sama seperti sebelumnya
 * (Nama Barang, Kategori, Part Number, Part Number Alt, Stok Akhir, Harga Jual, Kode Pajak, Status Stok, Aksi);
 * yang dirapikan hanya tampilannya.
 */
export function StockTable({
  items,
  q,
  groupByPart,
  onOpen,
  actions,
  variant,
  empty = "Tidak ada barang pada filter yang dipilih.",
}: {
  items: Product[];
  q: string;
  groupByPart: boolean;
  onOpen: (item: Product) => void;
  actions: (item: Product) => ReactNode;
  /** "barang": status KRITIS, rincian dus lengkap, harga dus. "stok": status MENIPIS, dus ringkas. */
  variant: "barang" | "stok";
  empty?: string;
}) {
  let previous = "";
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100">
          <tr>
            <th className={th}>Nama Barang</th>
            <th className={th}>Kategori</th>
            <th className={th}>Part Number</th>
            <th className={th}>Part Number Alt</th>
            <th className={`${th} text-center`}>Stok Akhir</th>
            <th className={`${th} text-right`}>Harga Jual</th>
            <th className={`${th} text-center`}>Kode Pajak</th>
            <th className={`${th} text-center`}>Status Stok</th>
            <th className={`${th} text-center`}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? <tr><td colSpan={9} className="py-8 text-center text-slate-500">{empty}</td></tr> : null}
          {items.map((item) => {
            const level = stockLevel(item);
            const category = (item.kategori || "TANPA KATEGORI").trim();
            const showCategory = !groupByPart && category.toLowerCase() !== previous.toLowerCase();
            previous = category;
            const dus = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
            const dusQty = dus ? Math.floor(item.stok / item.isiSatuanAlt) : 0;
            const sisa = dus ? item.stok % item.isiSatuanAlt : 0;
            const statusText = level === "MENIPIS" && variant === "barang" ? "KRITIS" : level;
            return (
              <Fragment key={item.id}>
                {showCategory ? (
                  <tr>
                    <td colSpan={9} className="border-y border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold tracking-wide text-blue-900">{category.toUpperCase()}</td>
                  </tr>
                ) : null}
                <tr className="cursor-pointer border-b border-slate-100 bg-white transition-colors hover:bg-blue-50/70" title="Klik baris untuk melihat detail" onClick={() => onOpen(item)}>
                  <td className={`${td} min-w-[220px] max-w-[320px]`}>
                    <div className="font-semibold leading-snug text-slate-900">
                      <Mark text={item.nama} q={q} />
                      {item.kodePajak ? <> (<Mark text={item.kodePajak} q={q} />)</> : null}
                    </div>
                    {item.merek ? <div className="mt-0.5"><span className="inline-block rounded bg-blue-100 px-1.5 py-px text-[11px] font-bold text-blue-800"><Mark text={item.merek} q={q} /></span></div> : null}
                  </td>
                  <td className={`${td} text-xs font-semibold text-slate-700`}><Mark text={item.kategori || "-"} q={q} /></td>
                  <td className={`${td} whitespace-nowrap font-mono text-xs`}><Mark text={item.partNumber || item.kode || "-"} q={q} /></td>
                  <td className={`${td} whitespace-nowrap font-mono text-xs text-slate-600`}><Mark text={item.partNumbersAlt || "-"} q={q} /></td>
                  <td className={`${td} whitespace-nowrap text-center`}>
                    <div className={`num font-bold ${level === "HABIS" ? "text-red-700" : level === "MENIPIS" ? "text-amber-700" : "text-slate-900"}`}>{item.stok} {item.satuan}</div>
                    {dus ? (
                      <div className="text-[11px] font-medium text-blue-700">{dusQty} {item.satuanAlt}{variant === "barang" && sisa ? ` + ${sisa} ${item.satuan}` : ""}</div>
                    ) : variant === "barang" ? <div className="text-[11px] text-slate-500">Pcs saja</div> : null}
                  </td>
                  <td className={`${td} num whitespace-nowrap text-right font-semibold`}>
                    {rupiah(item.hargaJual)}
                    {variant === "barang" && item.hargaJualAlt ? <div className="text-[11px] font-medium text-slate-500">dus {rupiah(item.hargaJualAlt)}</div> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap text-center text-xs`}><Mark text={item.kodePajak || "-"} q={q} /></td>
                  <td className={`${td} text-center`}>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold leading-4 ${level === "HABIS" ? "bg-red-100 text-red-700" : level === "MENIPIS" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{statusText}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle" onClick={(event) => event.stopPropagation()}>
                    <div className="inline-flex items-center justify-center gap-1">{actions(item)}</div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
