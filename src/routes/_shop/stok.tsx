import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass, Mark, Panel } from "@/components/shop/shell";
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
        <input className={inputClass} placeholder="Cari nama, part number, merek, atau kategori" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <details className="relative min-w-[240px]" id="kategori-dropdown">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-sm">
            <span className="truncate">
              {kategori.length === 0
                ? "Semua Kategori"
                : kategori.length <= 2
                  ? kategori.join(", ")
                  : `${kategori.length} kategori dipilih`}
            </span>
            <span className="shrink-0 text-muted">▾</span>
          </summary>
          <div className="absolute left-0 top-12 z-20 w-full min-w-[300px] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
            {/* Header: search + clear */}
            <div className="space-y-2 border-b border-line bg-white p-3">
              <input
                className="h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-blue-500"
                placeholder="Cari nama kategori..."
                value={kategoriQ}
                onChange={(e) => setKategoriQ(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-left text-sm font-bold hover:bg-slate-50"
                  onClick={() => { setPage(1); setKategori([]); setKategoriQ(""); }}
                >
                  ☑ Semua Kategori
                </button>
                {kategori.length > 0 && (
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-danger hover:bg-red-100"
                    onClick={() => { setPage(1); setKategori([]); }}
                  >
                    Hapus semua
                  </button>
                )}
              </div>
            </div>

            {/* Selected items on top */}
            {kategori.length > 0 && (
              <div className="border-b border-line bg-blue-50/60 px-3 py-2">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">Dipilih ({kategori.length})</p>
                <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {kategori.map((item) => (
                    <button
                      key={`sel-${item}`}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                      onClick={() => { setPage(1); setKategori((prev) => prev.filter((v) => v.toLowerCase() !== item.toLowerCase())); }}
                      title="Klik untuk batal pilih"
                    >
                      {item} <span className="opacity-80">×</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Checkbox list – selected ones first, then filtered */}
            <div className="max-h-52 space-y-0.5 overflow-y-auto p-2">
              {(() => {
                const all = data?.categories ?? [];
                const q = kategoriQ.trim().toLowerCase();
                const filtered = q ? all.filter((item) => item.toLowerCase().includes(q)) : all;
                // selected first, then the rest
                const selectedSet = new Set(kategori.map((v) => v.toLowerCase()));
                const ordered = [
                  ...filtered.filter((item) => selectedSet.has(item.toLowerCase())),
                  ...filtered.filter((item) => !selectedSet.has(item.toLowerCase())),
                ];
                if (ordered.length === 0) {
                  return <p className="px-2 py-4 text-center text-xs text-muted">Tidak ada kategori cocok</p>;
                }
                return ordered.map((item) => {
                  const checked = selectedSet.has(item.toLowerCase());
                  return (
                    <label
                      key={item}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 ${checked ? "bg-blue-50 font-semibold text-blue-800" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setPage(1);
                          setKategori((prev) =>
                            e.target.checked
                              ? [...prev, item]
                              : prev.filter((value) => value.toLowerCase() !== item.toLowerCase())
                          );
                        }}
                      />
                      <span>{item}</span>
                    </label>
                  );
                });
              })()}
            </div>

            {/* Footer: OK button to close */}
            <div className="border-t border-line bg-slate-50 p-3">
              <button
                type="button"
                className="h-10 w-full rounded-lg bg-slate-800 text-sm font-bold text-white hover:bg-slate-900"
                onClick={() => {
                  const el = document.getElementById("kategori-dropdown") as HTMLDetailsElement | null;
                  if (el) el.open = false;
                  setKategoriQ("");
                }}
              >
                OK — Terapkan ({kategori.length || "Semua"})
              </button>
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
                  <td className="px-2 py-3">
                    <div className="font-medium">
                      <Mark text={item.nama} q={q} />
                      {item.kodePajak ? <> (<Mark text={item.kodePajak} q={q} />)</> : null}
                    </div>
                    {item.merek ? <div className="text-[11px] text-muted"><Mark text={item.merek} q={q} /></div> : null}
                  </td>
                  <td className="px-2 text-xs font-bold"><Mark text={item.kategori || "-"} q={q} /></td>
                  <td className="px-2 font-mono text-xs"><Mark text={item.partNumber || "-"} q={q} /></td>
                  <td className="hidden px-2 font-mono text-xs md:table-cell"><Mark text={item.partNumbersAlt || "-"} q={q} /></td>
                  <td className="num px-2 text-center">{item.stokMin}</td>
                  <td className="num px-2 text-center font-semibold">
                    <div>{item.stok} {item.satuan}</div>
                    {item.satuanAlt && item.isiSatuanAlt > 0 ? <div className="text-[11px] font-medium text-blue-700">{Math.floor(item.stok / item.isiSatuanAlt)} {item.satuanAlt}</div> : null}
                  </td>
                  <td className="num hidden px-2 text-right sm:table-cell">{rupiah(item.hargaJual)}</td>
                  <td className="px-2 text-center text-xs"><Mark text={item.kodePajak || "-"} q={q} /></td>
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
