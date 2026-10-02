import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass, Panel } from "@/components/shop/shell";
import { listProducts } from "@/lib/shop/api";
import { rupiah } from "@/lib/shop/format";
import { printStockReport } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/stok")({ component: StokPage });

function StokPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("nama");
  const [kategori, setKategori] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: Product[]; categories: string[] } | null>(null);
  useEffect(() => {
    void listProducts({ data: { q, sort, page, kategori, status } }).then(setData);
  }, [q, sort, page, kategori, status]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 15)));
  return (
    <Panel>
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <input className={inputClass} placeholder="Cari nama, part, atau kategori (oli)" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <input className={inputClass} list="kategori-stok" placeholder="Ketik kategori, contoh Oli" value={kategori} onChange={(e) => { setPage(1); setKategori(e.target.value); }} />
        <datalist id="kategori-stok">
          {data?.categories.map((item) => <option key={item} value={item} />)}
        </datalist>
        <select className={inputClass} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Semua Status</option>
          <option value="Aman">Aman</option>
          <option value="Menipis">Menipis</option>
          <option value="Habis">Habis</option>
        </select>
        <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="nama">Nama (A - Z)</option>
          <option value="nama_desc">Nama (Z - A)</option>
          <option value="stok_desc">Stok Terbesar</option>
          <option value="stok_asc">Stok Terkecil</option>
        </select>
        <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => { setQ(""); setKategori(""); setStatus(""); setSort("nama"); setPage(1); }}>Reset</button>
        <button className="h-11 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={() => {
          void listProducts({ data: { q, sort, page: 1, kategori, status, all: true } }).then((res) => {
            try { printStockReport(res.items); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
          });
        }}>Cetak PDF</button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th className="px-2 py-3">Nama Barang</th>
              <th className="px-2 py-3">Part Number</th>
              <th className="hidden px-2 py-3 md:table-cell">Part Number Alt</th>
              <th className="px-2 py-3 text-center">Stok Min</th>
              <th className="px-2 py-3 text-center">Stok Akhir</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Harga Jual</th>
              <th className="px-2 py-3 text-center">Kode Pajak</th>
              <th className="px-2 py-3 text-center">Status Stok</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-muted">Tidak ada data barang.</td></tr> : null}
            {data?.items.map((item) => {
              const label = item.stok <= 0 ? "HABIS" : item.stokMin > 0 && item.stok <= item.stokMin ? "MENIPIS" : "AMAN";
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-2 py-3 font-medium">{item.nama}</td>
                  <td className="px-2 font-mono text-xs">{item.partNumber || "-"}</td>
                  <td className="hidden px-2 font-mono text-xs md:table-cell">{item.partNumbersAlt || "-"}</td>
                  <td className="num px-2 text-center">{item.stokMin}</td>
                  <td className="num px-2 text-center font-semibold">
                    <div>{item.stok} {item.satuan}</div>
                    {item.satuanAlt && item.isiSatuanAlt > 0 ? <div className="text-[11px] font-medium text-blue-700">{Math.floor(item.stok / item.isiSatuanAlt)} {item.satuanAlt}</div> : null}
                  </td>
                  <td className="num hidden px-2 text-right sm:table-cell">{rupiah(item.hargaJual)}</td>
                  <td className="px-2 text-center text-xs">{item.kodePajak || "-"}</td>
                  <td className="px-2 text-center">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${label === "HABIS" ? "bg-red-50 text-danger" : label === "MENIPIS" ? "bg-amber-50 text-warn" : "bg-emerald-50 text-ok"}`}>{label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">Menampilkan {data?.items.length ?? 0} dari {data?.total ?? 0} barang</span>
        <div className="flex items-center gap-2">
          <button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
          <span>Hal: {page}/{pages}</span>
          <button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
        </div>
      </div>
    </Panel>
  );
}
