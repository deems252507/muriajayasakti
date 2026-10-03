import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
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
  const [kategori, setKategori] = useState<string[]>([]);
  const [kategoriQ, setKategoriQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: Product[]; categories: string[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    void listProducts({ data: { q, sort, page, kategori, status } })
      .then((res) => { setLoadError(""); setData(res); })
      .catch((error: Error) => setLoadError(error.message || "Gagal memuat laporan stok."));
  }, [q, sort, page, kategori, status]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 15)));
  return (
    <Panel>
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <input className={inputClass} placeholder="Cari nama atau part number" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <details className="relative min-w-[220px]">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-lg border border-line bg-white px-3 text-sm">
            <span>{kategori.length ? `${kategori.length} kategori dipilih` : "Semua Kategori"}</span><span className="text-muted">▾</span>
          </summary>
          <div className="absolute left-0 top-12 z-20 max-h-80 w-full min-w-[280px] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
            <div className="sticky top-0 z-10 space-y-2 border-b border-line bg-white p-3">
              <input
                className="h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-blue-500"
                placeholder="Cari nama kategori..."
                value={kategoriQ}
                onChange={(e) => setKategoriQ(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button type="button" className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm font-bold hover:bg-slate-50" onClick={() => { setPage(1); setKategori([]); setKategoriQ(""); }}>
                ☑ Semua Kategori
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto p-3 pt-2">
              {(data?.categories ?? [])
                .filter((item) => !kategoriQ.trim() || item.toLowerCase().includes(kategoriQ.trim().toLowerCase()))
                .map((item) => (
                <label key={item} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={kategori.some((value) => value.toLowerCase() === item.toLowerCase())} onChange={(e) => { setPage(1); setKategori((prev) => e.target.checked ? [...prev, item] : prev.filter((value) => value.toLowerCase() !== item.toLowerCase())); }} />
                  <span>{item}</span>
                </label>
              ))}
              {(data?.categories ?? []).filter((item) => !kategoriQ.trim() || item.toLowerCase().includes(kategoriQ.trim().toLowerCase())).length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted">Tidak ada kategori cocok</p>
              )}
            </div>
          </div>
        </details>
        <select className={inputClass} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Semua Status</option>
          <option value="Aman">Aman</option>
          <option value="Menipis">Menipis</option>
          <option value="Habis">Habis</option>
        </select>
        <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="nama">Kategori, Nama (A - Z)</option>
          <option value="nama_desc">Nama (Z - A)</option>
          <option value="stok_desc">Stok Terbesar</option>
          <option value="stok_asc">Stok Terkecil</option>
        </select>
        <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => { setQ(""); setKategori([]); setKategoriQ(""); setStatus(""); setSort("nama"); setPage(1); }}>Reset</button>
        <button className="h-11 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={() => {
          void listProducts({ data: { q, sort, page: 1, kategori, status, all: true } }).then((res) => {
            try {
              const tanggal = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
              printStockReport(res.items, { kategori: kategori.length ? kategori.join(" + ") : "Semua Kategori", tanggal });
            } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
          });
        }}>Cetak PDF</button>
      </div>
      <div className="mt-3 overflow-x-auto">
        {loadError ? <p className="mb-3 text-sm text-danger">{loadError}</p> : null}
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th className="px-2 py-3">Nama Barang</th>
              <th className="px-2 py-3">Kategori</th>
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
            {data?.items.length === 0 ? <tr><td colSpan={9} className="py-6 text-center text-muted">Tidak ada barang pada filter yang dipilih.</td></tr> : null}
            {(() => {
              let previousCategory = "";
              return data?.items.map((item) => {
              const label = item.stok <= 0 ? "HABIS" : item.stokMin > 0 && item.stok <= item.stokMin ? "MENIPIS" : "AMAN";
              const category = (item.kategori || "TANPA KATEGORI").trim();
              const showCategory = category.toLowerCase() !== previousCategory.toLowerCase();
              previousCategory = category;
              return (
                <Fragment key={`stock-${item.id}`}>
                {showCategory ? <tr><td colSpan={9} className="border-y border-line bg-slate-100 px-2 py-2 text-xs font-extrabold tracking-wide text-slate-700">{category.toUpperCase()}</td></tr> : null}
                <tr key={item.id} className="border-t border-line">
                  <td className="px-2 py-3 font-medium">{item.nama}</td>
                  <td className="px-2 text-xs font-bold">{item.kategori || "-"}</td>
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
                </Fragment>
              );
            });
            })()}
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
