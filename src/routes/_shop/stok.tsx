import { createFileRoute } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { inputClass, Panel } from "@/components/shop/shell";
import { StockTable } from "@/components/shop/stock-table";
import { CommentButton, useCommentFinder, useComments } from "@/components/shop/comment-ui";
import { listProducts } from "@/lib/shop/api";
import { rupiah } from "@/lib/shop/format";
import { printStockReport } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/stok")({ component: StokPage });

function StokPage() {
  const [q, setQ] = usePersistedState("stok:q", "");
  const [sort, setSort] = usePersistedState("stok:sort", "nama");
  const [dupOnly, setDupOnly] = usePersistedState("stok:dupOnly", false);
  const [kategori, setKategori] = usePersistedState<string[]>("stok:kategori", []);
  const [kategoriQ, setKategoriQ] = useState("");
  const [status, setStatus] = usePersistedState("stok:status", "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: Product[]; categories: string[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [detail, setDetail] = useState<Product | null>(null);
  const comments = useComments("barang", (data?.items ?? []).map((i) => i.id));
  useCommentFinder("barang", (t) => { setKategori([]); setDupOnly(false); setStatus(""); setPage(1); setQ(t.label); });
  useEffect(() => {
    void listProducts({ data: { q, dupOnly, sort, page, kategori, status } })
      .then((res) => { setLoadError(""); setData(res); })
      .catch((error: Error) => setLoadError(error.message || "Gagal memuat laporan stok."));
  }, [q, dupOnly, sort, page, kategori, status]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 15)));
  return (
    <Panel>
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <input className={inputClass} placeholder="Cari nama, part number, merek, atau kategori" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <label className="flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-white px-3 text-sm font-semibold" title="Tampilkan hanya barang dengan part number dan merek yang sama"><input type="checkbox" checked={dupOnly} onChange={(e) => { setPage(1); setDupOnly(e.target.checked); }} />Hanya yang kembar</label>
        <details className="relative min-w-[240px]" id="kategori-dropdown">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-sm">
            <span className="truncate">
              {kategori.length === 0
                ? "Semua Kategori"
                : kategori.length <= 2
                  ? kategori.join(", ")
                  : `${kategori.length} kategori dipilih`}
            </span>
            <span className="shrink-0 text-slate-600">▾</span>
          </summary>
          <div className="absolute left-0 top-12 z-20 w-full min-w-[300px] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
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
            <div className="max-h-52 space-y-0.5 overflow-y-auto p-2">
              {(() => {
                const all = data?.categories ?? [];
                const q = kategoriQ.trim().toLowerCase();
                const filtered = q ? all.filter((item) => item.toLowerCase().includes(q)) : all;
                const selectedSet = new Set(kategori.map((v) => v.toLowerCase()));
                const ordered = [
                  ...filtered.filter((item) => selectedSet.has(item.toLowerCase())),
                  ...filtered.filter((item) => !selectedSet.has(item.toLowerCase())),
                ];
                if (ordered.length === 0) {
                  return <p className="px-2 py-4 text-center text-xs text-slate-600">Tidak ada kategori cocok</p>;
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
<option value="part">Part Number (A - Z)</option>
          <option value="nama_desc">Nama (Z - A)</option>
          <option value="stok_desc">Stok Terbesar</option>
          <option value="stok_asc">Stok Terkecil</option>
          <option value="harga_desc">Harga ↑ (tertinggi)</option>
          <option value="harga_asc">Harga ↓ (terendah)</option>
          <option value="pajak">Kode Pajak (A - Z) — hanya barang pajak</option>
        </select>
        <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => { setQ(""); setDupOnly(false); setKategori([]); setKategoriQ(""); setStatus(""); setSort("nama"); setPage(1); }}>Reset</button>
        <button className="h-11 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={() => {
          void listProducts({ data: { q, dupOnly, sort, page: 1, kategori, status, all: true } }).then((res) => {
            try {
              const tanggal = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
              printStockReport(res.items, { kategori: kategori.length ? kategori.join(" + ") : "Semua Kategori", tanggal });
            } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
          });
        }}>Cetak PDF</button>
      </div>
      <div className="mt-3 overflow-x-auto">
        {loadError ? <p className="mb-3 text-sm text-danger">{loadError}</p> : null}
        <StockTable
          variant="stok"
          rowProps={(item) => comments.row(item.id, item.nama)}
          items={data?.items ?? []}
          q={q}
          groupByPart={dupOnly || sort === "part" || sort === "harga_desc" || sort === "harga_asc" || sort === "pajak"}
          onOpen={setDetail}
          actions={(item) => (
            <>
            <CommentButton kind="barang" refId={item.id} label={item.nama} mark={comments.marks[String(item.id)]} />
            <button type="button" title="Detail" aria-label="Detail" className="inline-grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-slate-700 hover:bg-slate-100" onClick={() => setDetail(item)}>
              <Eye className="h-4 w-4" />
            </button>
            </>
          )}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-600">Menampilkan {data?.items.length ?? 0} dari {data?.total ?? 0} barang</span>
        <div className="flex items-center gap-2">
          <button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
          <span>Hal: {page}/{pages}</span>
          <button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
        </div>
      </div>
      {detail ? <StockDetail item={detail} onClose={() => setDetail(null)} /> : null}
    </Panel>
  );
}

function stockLabel(item: Product) {
  if (item.stok <= 0) return "HABIS";
  if (item.stokMin > 0 && item.stok <= item.stokMin) return "MENIPIS";
  return "AMAN";
}

function StockDetail({ item, onClose }: { item: Product; onClose: () => void }) {
  const label = stockLabel(item);
  const dus = item.satuanAlt && item.isiSatuanAlt > 0 ? Math.floor(item.stok / item.isiSatuanAlt) : 0;
  const sisa = item.satuanAlt && item.isiSatuanAlt > 0 ? item.stok % item.isiSatuanAlt : 0;
  const tone = label === "HABIS" ? "bg-red-100 text-red-700" : label === "MENIPIS" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800";
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-panel p-4 sm:max-w-xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Detail sparepart</h2>
            <p className="text-sm text-slate-600">Informasi barang dan kondisi stok laporan</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone}`}>{label}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="Nama barang" value={item.nama} />
          <Info label="Kategori" value={item.kategori || "-"} />
          <Info label="Merek" value={item.merek || "-"} />
          <Info label="Part number" value={item.partNumber || "-"} />
          <Info label="Part number alt" value={item.partNumbersAlt || "-"} />
          <Info label="Kode pajak" value={item.kodePajak || "-"} />
          <Info label="Status pajak" value={item.pajakStatus || "-"} />
          <Info label="Status stok" value={label} />
          <Info label="Stok akhir" value={`${item.stok} ${item.satuan || "Pcs"}`} />
          <Info label="Stok minimum" value={`${item.stokMin} ${item.satuan || "Pcs"}`} />
          <Info label={`Konversi ${item.satuanAlt || "satuan kedua"}`} value={item.satuanAlt && item.isiSatuanAlt > 0 ? `${dus} ${item.satuanAlt}${sisa ? ` + ${sisa} ${item.satuan}` : ""} · 1 ${item.satuanAlt} = ${item.isiSatuanAlt} ${item.satuan}` : "-"} />
          <Info label="Harga jual" value={rupiah(item.hargaJual)} />
          <Info label={`Harga jual ${item.satuanAlt || "satuan kedua"}`} value={item.hargaJualAlt ? rupiah(item.hargaJualAlt) : "-"} />
          <Info label="Harga beli" value={rupiah(item.hargaBeli)} />
        </div>
        <div className="mt-4 rounded-xl border border-line bg-slate-50 p-3 text-sm">
          <p className="font-semibold">Status di laporan ini</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            <li className={label === "HABIS" ? "font-bold text-red-700" : ""}>Habis — stok akhir 0</li>
            <li className={label === "MENIPIS" ? "font-bold text-amber-700" : ""}>Menipis — stok akhir menyentuh atau di bawah stok minimum</li>
            <li className={label === "AMAN" ? "font-bold text-emerald-700" : ""}>Aman — stok akhir di atas stok minimum</li>
          </ul>
        </div>
        {item.keterangan ? <p className="mt-3 text-sm text-slate-600">{item.keterangan}</p> : null}
        <div className="mt-4 flex justify-end">
          <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
