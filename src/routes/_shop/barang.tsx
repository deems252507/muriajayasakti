import { confirmDialog } from "@/lib/confirm";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StockTable } from "@/components/shop/stock-table";
import { Barcode, Download, Eye, History, Pencil, Plus, RotateCcw, Trash2, Truck, Upload, X } from "lucide-react";
import { ExpandButton, ExpandGroup } from "@/components/ui/button-7";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { SortPicker, hideCategoryHeaders, DEFAULT_SORTS } from "@/components/shop/sort-picker";
import { Field, inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { deleteProduct, exportProducts, importProducts, listPriceHistory, listProductSuppliers, listProducts, saveProduct } from "@/lib/shop/api";
import { CommentButton, useCommentFinder, useComments } from "@/components/shop/comment-ui";
import { digits, grouped, packFromName, rupiah } from "@/lib/shop/format";
import { stockLevel } from "@/components/shop/stock-table";
import { shopBrand } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/barang")({ component: BarangPage });

const empty = {
  id: null as number | null,
  partNumber: "",
  partNumbersAlt: "",
  nama: "",
  kategori: "SPAREPART",
  merek: "",
  satuan: "Pcs",
  stokMin: 0,
  stok: 0,
  hargaBeli: 0,
  hargaJual: 0,
  satuanAlt: "",
  isiSatuanAlt: 0,
  hargaJualAlt: 0,
  pajakStatus: "Non Pajak",
  kodePajak: "",
  keterangan: "",
};

function BarangPage() {
  const me = Route.useRouteContext().me;
  const navigate = useNavigate();
  const canEdit = me.role === "Admin";
  // Staf (pengecek barang): hanya melihat daftar; klik baris / tombol Detail membuka rincian tanpa bisa mengubah apa pun.
  const isStaf = me.role === "Staf";
  const [detail, setDetail] = useState<Product | null>(null);
  const [q, setQ] = usePersistedState("barang:q", "");
  // Staf langsung masuk ke halaman ini (bukan Dashboard), jadi notifikasi "Staf masuk · nama" ditampilkan di sini.
  useEffect(() => {
    try {
      const notice = sessionStorage.getItem("mjs-notice");
      if (notice) {
        sessionStorage.removeItem("mjs-notice");
        toast.success(notice);
      }
    } catch {
      /* abaikan */
    }
  }, []);
  useEffect(() => {
    const saved = sessionStorage.getItem("mjs-find");
    if (!saved) return;
    sessionStorage.removeItem("mjs-find");
    setQ(saved);
  }, []);
  const [dupOnly, setDupOnly] = usePersistedState("barang:dupOnly", false);
  const [kategori, setKategori] = usePersistedState<string[]>("barang:kategori", []);
  const [kategoriQ, setKategoriQ] = useState("");
  const [page, setPage] = useState(1);
  const [sorts, setSorts] = usePersistedState<string[]>("barang:sorts", DEFAULT_SORTS);
  const [data, setData] = useState<{ total: number; items: Product[]; perPage: number; categories: string[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(empty);
  const [useDus, setUseDus] = useState(false);
  const [open, setOpen] = useState(false);
  const [replaceStock, setReplaceStock] = useState(true);
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<{ item: Product; rows: PriceRow[] | null } | null>(null);
  const [origin, setOrigin] = useState<{ item: Product; data: OriginData | null } | null>(null);
  const importingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const comments = useComments("barang", (data?.items ?? []).map((i) => i.id));
  // Dari tag komentar: barang yang tidak tampil di halaman awal dicari lewat namanya, filter dikosongkan.
  useCommentFinder("barang", (t) => { setKategori([]); setDupOnly(false); setPage(1); setQ(t.label); });

  function openHistory(item: Product) {
    setHistory({ item, rows: null });
    void listPriceHistory({ data: { productId: item.id } })
      .then((rows) => setHistory((cur) => cur && cur.item.id === item.id ? { item, rows: rows as PriceRow[] } : cur))
      .catch((e: Error) => { toast.error(e.message); setHistory(null); });
  }

  function openOrigin(item: Product) {
    setOrigin({ item, data: null });
    void listProductSuppliers({ data: { productId: item.id } })
      .then((data) => setOrigin((cur) => cur && cur.item.id === item.id ? { item, data: data as OriginData } : cur))
      .catch((e: Error) => { toast.error(e.message); setOrigin(null); });
  }

  function load(next = page) {
    void listProducts({ data: { q, dupOnly, page: next, sorts, kategori } })
      .then((res) => { setLoadError(""); setData(res); })
      .catch((error: Error) => setLoadError(error.message || "Gagal memuat daftar barang."));
  }
  useEffect(() => {
    load(page);
    // Segarkan otomatis tiap 20 detik, hanya saat tab terlihat. Saat tab kembali dibuka, langsung disegarkan (onFocus).
    const timer = setInterval(() => { if (!importingRef.current && !document.hidden) load(page); }, 20000);
    const onFocus = () => { if (!importingRef.current) load(page); };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [q, dupOnly, page, sorts, kategori]);

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 15)));

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ExpandGroup align="start" className="self-start">
            {canEdit ? <ExpandButton size="md" variant="primary" label="Tambah" icon={<Plus />} onClick={() => { setForm(empty); setUseDus(false); setOpen(true); }} /> : null}
            {canEdit ? (
              <>
                <ExpandButton size="md" label="Import CSV" icon={<Upload />} disabled={importing} onClick={() => fileInputRef.current?.click()} />
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void file.text().then(async (text) => {
                      const rows = parseCsv(text);
                      if (!rows.length) throw new Error("CSV tidak dikenali. Pastikan ada kolom KODE SPAREPART dan NAMA SPAREPART.");
                      if (importingRef.current) throw new Error("Impor sedang berjalan, mohon tunggu.");
                      importingRef.current = true;
                      setImporting(true);
                      let created = 0;
                      let updated = 0;
                      const size = 40;
                      const id = toast.loading(`Mengimpor 0 / ${rows.length} baris...`);
                      try {
                        for (let i = 0; i < rows.length; i += size) {
                          const result = await importProducts({ data: { rows: rows.slice(i, i + size), replaceStock } });
                          created += result.created;
                          updated += result.updated;
                          toast.loading(`Mengimpor ${Math.min(i + size, rows.length)} / ${rows.length} baris...`, { id });
                        }
                        toast.success("Impor barang selesai", { id, description: `${created} barang baru ditambahkan, ${updated} barang diperbarui.` });
                      } catch (error) {
                        toast.error(`${(error as Error).message} (sudah masuk: ${created} baru, ${updated} diperbarui — impor ulang aman)`, { id });
                      } finally {
                        importingRef.current = false;
                        setImporting(false);
                      }
                      load(1);
                    }).catch((error: Error) => toast.error(error.message));
                  }}
                />
              </>
            ) : null}
            {!isStaf ? <ExpandButton
              size="md"
              label="Export CSV"
              icon={<Download />}
              onClick={() => {
                void exportProducts().then((csv) => {
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${shopBrand().nama.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-stok.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }).catch((error: Error) => toast.error(error.message));
              }}
            /> : null}
          </ExpandGroup>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:justify-end">
            <input className={inputClass} placeholder="Cari nama, part, atau kategori (oli)" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
            <label className="flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-white px-3 text-sm font-semibold" title="Tampilkan hanya barang dengan part number dan merek yang sama"><input type="checkbox" checked={dupOnly} onChange={(e) => { setPage(1); setDupOnly(e.target.checked); }} />Hanya yang kembar</label>
            <details className="relative min-w-[240px]" id="kategori-barang-dropdown">
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
                    const qq = kategoriQ.trim().toLowerCase();
                    const filtered = qq ? all.filter((item) => item.toLowerCase().includes(qq)) : all;
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
                      const el = document.getElementById("kategori-barang-dropdown") as HTMLDetailsElement | null;
                      if (el) el.open = false;
                      setKategoriQ("");
                    }}
                  >
                    OK — Terapkan ({kategori.length || "Semua"})
                  </button>
                </div>
              </div>
            </details>
        <SortPicker value={sorts} onChange={(next) => { setPage(1); setSorts(next); }} />
            <ExpandGroup className="self-start"><ExpandButton size="md" label="Reset" icon={<RotateCcw />} onClick={() => { setQ(""); setDupOnly(false); setKategori([]); setKategoriQ(""); setSorts(DEFAULT_SORTS); setPage(1); }} /></ExpandGroup>
          </div>
        </div>
        {canEdit ? (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={replaceStock} onChange={(e) => setReplaceStock(e.target.checked)} />
            Saat impor, timpa stok dengan angka STOK di file
          </label>
        ) : null}
        {canEdit ? <p className="mt-2 text-xs text-slate-600">
          File Google Sheet: kolom KODE SPAREPART, NAMA SPAREPART, JENIS BARANG, STOK, HARGA.
          Contoh nama `101486 / ACTUATOR IDLE SPEED AVANZA, XENIA - DAIHATSU (G)` dibaca sebagai kode pajak 101486, nama barang, merek DAIHATSU (G). Part number tetap 89690-BZ010-001. Kode SP- untuk barcode dibuat otomatis.
        </p> : null}
      </Panel>
      <Panel className="overflow-x-auto">
        {loadError ? <p className="mb-3 text-sm text-danger">{loadError}</p> : null}
        <StockTable
          variant="barang"
          rowProps={(item) => comments.row(item.id, item.nama)}
          items={data?.items ?? []}
          q={q}
          groupByPart={hideCategoryHeaders(sorts, dupOnly)}
          onOpen={(item) => { if (isStaf) { setDetail(item); return; } setForm({ ...item, id: item.id }); setUseDus(Boolean(item.satuanAlt && item.isiSatuanAlt > 0)); setOpen(true); }}
          actions={(item) => isStaf ? (
            <ExpandGroup>
              <ExpandButton label="Detail" icon={<Eye />} onClick={() => setDetail(item)} />
              <ExpandButton label="Riwayat harga" icon={<History />} onClick={() => openHistory(item)} />
            </ExpandGroup>
          ) : (
            <ExpandGroup>
              <CommentButton kind="barang" refId={item.id} label={item.nama} mark={comments.marks[String(item.id)]} />
              <ExpandButton label="Riwayat harga" icon={<History />} onClick={() => openHistory(item)} />
              {me.role !== "Kasir" ? <ExpandButton label="Pemasok" icon={<Truck />} onClick={() => openOrigin(item)} /> : null}
              <ExpandButton label="Barcode" icon={<Barcode />} onClick={() => void printBarcode(item)} />
              {canEdit ? (
                <>
                  <ExpandButton label="Ubah" icon={<Pencil />} onClick={() => { setForm({ ...item, id: item.id }); setUseDus(Boolean(item.satuanAlt && item.isiSatuanAlt > 0)); setOpen(true); }} />
                  <ExpandButton variant="danger" label="Hapus" icon={<Trash2 />} onClick={async () => { if (await confirmDialog(`Barang "${item.nama}" akan dihapus dari daftar.`, { title: "Hapus barang?", danger: true })) void deleteProduct({ data: { id: item.id } }).then(() => { toast.success("Barang berhasil dihapus", { description: item.nama }); load(); }).catch((e: Error) => toast.error(e.message)); }} />
                </>
              ) : null}
            </ExpandGroup>
          )}
        />
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-600">Menampilkan {data?.items.length ?? 0} dari {data?.total ?? 0} barang</span>
          <div className="flex items-center gap-2">
            <button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
            <span className="grid place-items-center text-sm">Hal {page} / {pages}</span>
            <button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
          </div>
        </div>
      </Panel>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4">
          <form
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-panel p-4 sm:max-w-xl sm:rounded-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              if (useDus && (!form.satuanAlt.trim() || form.isiSatuanAlt <= 0)) {
                toast.error(`Isi nama satuan kedua dan jumlah ${form.satuan || "Pcs"} di dalam 1 ${form.satuanAlt.trim() || "satuan kedua"}.`);
                return;
              }
              const payload = useDus ? form : { ...form, satuanAlt: "", isiSatuanAlt: 0, hargaJualAlt: 0 };
              void saveProduct({ data: payload })
                .then(() => { setOpen(false); toast.success(form.id ? "Barang berhasil diubah" : "Barang berhasil ditambahkan", { description: `${form.nama}${form.partNumber ? ` · ${form.partNumber}` : ""}` }); load(); })
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            <h2 className="text-lg font-semibold">{form.id ? "Ubah barang" : "Barang baru"}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Nama"><input className={inputClass} value={form.nama} onChange={(e) => {
                const nama = e.target.value;
                const pack = packFromName(nama);
                if (pack && form.isiSatuanAlt <= 0) {
                  setUseDus(true);
                  setForm({ ...form, nama, satuanAlt: form.satuanAlt || "Dus", isiSatuanAlt: pack.pcs });
                  return;
                }
                setForm({ ...form, nama });
              }} /></Field>
              <Field label="Part number"><input className={inputClass} value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} /></Field>
              <Field label="Part number lain"><input className={inputClass} value={form.partNumbersAlt} onChange={(e) => setForm({ ...form, partNumbersAlt: e.target.value })} /></Field>
              <Field label="Kategori"><input className={inputClass} value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} /></Field>
              <Field label="Merek"><input className={inputClass} value={form.merek} onChange={(e) => setForm({ ...form, merek: e.target.value })} /></Field>
              <Field label="Satuan"><input className={inputClass} value={form.satuan} onChange={(e) => setForm({ ...form, satuan: e.target.value })} /></Field>
              <Field label={`Stok (${form.satuan || "Pcs"})`}><input className={`${inputClass} num`} value={form.stok} onChange={(e) => setForm({ ...form, stok: Number(e.target.value) || 0 })} /></Field>
              <Field label={`Stok minimum (${form.satuan || "Pcs"})`}><input className={`${inputClass} num`} value={form.stokMin} onChange={(e) => setForm({ ...form, stokMin: Number(e.target.value) || 0 })} /></Field>
              <Field label="Harga beli"><input className={`${inputClass} num`} value={grouped(form.hargaBeli)} onChange={(e) => setForm({ ...form, hargaBeli: digits(e.target.value) })} /></Field>
              <Field label={`Harga jual per ${form.satuan || "Pcs"}`}><input className={`${inputClass} num`} value={grouped(form.hargaJual)} onChange={(e) => setForm({ ...form, hargaJual: digits(e.target.value) })} /></Field>
            </div>
            <div className="mt-4 rounded-xl border border-line p-3">
              <p className="text-sm font-bold">Satuan jual</p>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button type="button" className={`${!useDus ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300" : "bg-transparent text-slate-500"}`} onClick={() => setUseDus(false)}>Satu satuan</button>
                <button type="button" className={`${useDus ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300" : "bg-transparent text-slate-500"}`} onClick={() => { setUseDus(true); setForm((prev) => ({ ...prev, satuanAlt: prev.satuanAlt || "Dus" })); }}>Dua satuan</button>
              </div>
              {!useDus ? <p className="mt-2 text-xs text-slate-600">Barang ini hanya dijual per {form.satuan || "Pcs"}. Stok yang diisi adalah jumlah {form.satuan || "Pcs"}.</p> : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Nama satuan"><input className={inputClass} value={form.satuanAlt} onChange={(e) => setForm({ ...form, satuanAlt: e.target.value })} placeholder="Dus" /></Field>
                  <Field label={`Isi 1 ${form.satuanAlt || "dus"} (berapa ${form.satuan || "pcs"})`}><input className={`${inputClass} num`} value={form.isiSatuanAlt || ""} onChange={(e) => setForm({ ...form, isiSatuanAlt: Number(e.target.value) || 0 })} placeholder="12" /></Field>
                  <Field label={`Harga jual 1 ${form.satuanAlt || "dus"}`}><input className={`${inputClass} num`} value={grouped(form.hargaJualAlt)} onChange={(e) => setForm({ ...form, hargaJualAlt: digits(e.target.value) })} /></Field>
                  <p className="self-end text-xs text-blue-800">
                    {form.isiSatuanAlt > 0
                      ? `1 ${form.satuanAlt || "Dus"} = ${form.isiSatuanAlt} ${form.satuan || "Pcs"}${packFromName(form.nama) ? ` @ ${packFromName(form.nama)?.ukuran}` : ""}. Stok ${form.stok} ${form.satuan || "Pcs"} = ${Math.floor(form.stok / form.isiSatuanAlt)} ${form.satuanAlt || "Dus"}${form.stok % form.isiSatuanAlt ? ` + ${form.stok % form.isiSatuanAlt} ${form.satuan || "Pcs"}` : ""}.`
                      : `Isi berapa ${form.satuan || "Pcs"} di dalam 1 ${form.satuanAlt || "satuan kedua"}. Penjualan ${form.satuanAlt || "satuan kedua"} akan mengurangi stok ${form.satuan || "Pcs"} sebanyak angka itu.`}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Status pajak">
                <select className={inputClass} value={form.pajakStatus} onChange={(e) => setForm({ ...form, pajakStatus: e.target.value })}>
                  <option>Non Pajak</option>
                  <option>Pajak</option>
                </select>
              </Field>
              <Field label="Kode pajak"><input className={inputClass} disabled={form.pajakStatus !== "Pajak"} value={form.kodePajak} onChange={(e) => setForm({ ...form, kodePajak: e.target.value })} /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setOpen(false)}>Batal</button>
              <PrimaryButton type="submit">Simpan</PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
      {detail ? <ProductDetailModal item={detail} onClose={() => setDetail(null)} /> : null}
      {origin ? <OriginModal item={origin.item} data={origin.data} onClose={() => setOrigin(null)} onGoInvoice={(inv) => { setOrigin(null); void navigate({ to: "/pemasok", search: { inv } }); }} /> : null}
      {history ? <PriceHistoryModal item={history.item} rows={history.rows} showBeli={me.role !== "Kasir" && !isStaf} showSumber={me.role !== "Kasir"} onGoInvoice={me.role !== "Kasir" && !isStaf ? (inv) => { setHistory(null); void navigate({ to: "/pemasok", search: { inv } }); } : undefined} onClose={() => setHistory(null)} /> : null}
    </div>
  );
}

type PriceRow = { tanggal: string; hargaBeli: number; hargaJual: number; hargaJualAlt: number; awal: boolean; sumber?: { tipe: "pemasok" | "manual"; invoiceNo: string; supplierName: string } | null };

function dateOnly(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Riwayat harga satu barang: tanggal dan harga setelah perubahan, terbaru di atas. */
const PRICE_HISTORY_PAGE_SIZE = 10;

/** Kontrol halaman kecil untuk popup (Sebelumnya / Hal x dari y / Berikutnya). */
function MiniPager({ page, pages, from, to, total, noun, onPage }: { page: number; pages: number; from: number; to: number; total: number; noun: string; onPage: (page: number) => void }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-600">{from}–{to} dari {total} {noun}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="h-10 rounded-lg border border-line px-3 disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
        <span className="grid place-items-center text-sm">Hal {page} / {pages}</span>
        <button type="button" className="h-10 rounded-lg border border-line px-3 disabled:opacity-50" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
      </div>
    </div>
  );
}

function PriceHistoryModal({ item, rows, showBeli, showSumber, onGoInvoice, onClose }: { item: Product; rows: PriceRow[] | null; showBeli: boolean; showSumber: boolean; onGoInvoice?: (invoiceNo: string) => void; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((rows?.length ?? 0) / PRICE_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PRICE_HISTORY_PAGE_SIZE;
  const hasDus = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
  type Key = "hargaJual" | "hargaJualAlt" | "hargaBeli";
  const cols: Array<{ key: Key; label: string }> = [
    { key: "hargaJual", label: `Harga Jual / ${item.satuan}` },
    ...(hasDus ? [{ key: "hargaJualAlt" as Key, label: `Harga Jual / ${item.satuanAlt}` }] : []),
    ...(showBeli ? [{ key: "hargaBeli" as Key, label: "Harga Beli" }] : []),
  ];
  function cell(row: PriceRow, older: PriceRow | undefined, key: Key) {
    const value = row[key];
    const diff = older ? value - older[key] : 0;
    return (
      <td key={key} className="num px-3 py-2 text-right">
        <span className={diff ? "font-bold" : ""}>{rupiah(value)}</span>
        {diff ? <span className={`ml-1 block text-[11px] font-semibold ${diff > 0 ? "text-emerald-700" : "text-danger"}`}>{diff > 0 ? "▲ naik " : "▼ turun "}{grouped(Math.abs(diff))}</span> : null}
      </td>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold">Riwayat Harga</h3>
            <p className="text-sm text-muted">{item.nama}{item.partNumber ? ` · ${item.partNumber}` : ""}</p>
          </div>
          <button type="button" className="h-10 rounded-lg border border-line px-4 text-sm font-medium" onClick={onClose}>Tutup</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {rows === null ? <p className="py-8 text-center text-sm text-muted">Memuat riwayat harga...</p> : null}
          {rows && rows.length === 0 ? <p className="py-8 text-center text-sm text-muted">Belum ada riwayat harga untuk barang ini.</p> : null}
          {rows && rows.length ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                <tr><th className="px-3 py-2 text-left">Tanggal</th>{cols.map((col) => <th key={col.key} className="px-3 py-2 text-right">{col.label}</th>)}{showSumber ? <th className="px-3 py-2 text-left">Sumber</th> : null}</tr>
              </thead>
              <tbody>
                {rows.slice(pageStart, pageStart + PRICE_HISTORY_PAGE_SIZE).map((row, i) => { const index = pageStart + i; return (
                  <tr key={`${row.tanggal}-${index}`} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold">{dateOnly(row.tanggal)}{row.awal ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Harga awal</span> : null}</td>
                    {cols.map((col) => cell(row, rows[index + 1], col.key))}
                    {showSumber ? (
                      <td className="px-3 py-2 text-xs">
                        {row.sumber?.tipe === "pemasok" ? (
                          onGoInvoice ? (
                            <button type="button" className="text-left" title="Buka invoice penerimaan ini" onClick={() => onGoInvoice(row.sumber!.invoiceNo)}>
                              <span className="block font-semibold underline decoration-dotted underline-offset-2">{row.sumber.supplierName}</span>
                              <span className="block font-mono font-bold text-accent underline">{row.sumber.invoiceNo}</span>
                            </button>
                          ) : (
                            <>
                              <span className="block font-semibold">{row.sumber.supplierName}</span>
                              <span className="block font-mono font-bold">{row.sumber.invoiceNo}</span>
                            </>
                          )
                        ) : row.sumber?.tipe === "manual" ? <span className="text-muted">Perubahan manual</span> : <span className="text-muted">-</span>}
                      </td>
                    ) : null}
                  </tr>
                ); })}
              </tbody>
            </table>
          ) : null}
          {rows && rows.length > PRICE_HISTORY_PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-600">{pageStart + 1}–{Math.min(pageStart + PRICE_HISTORY_PAGE_SIZE, rows.length)} dari {rows.length} perubahan</span>
              <div className="flex items-center gap-2">
                <button type="button" className="h-10 rounded-lg border border-line px-3 disabled:opacity-50" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button>
                <span className="grid place-items-center text-sm">Hal {currentPage} / {totalPages}</span>
                <button type="button" className="h-10 rounded-lg border border-line px-3 disabled:opacity-50" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Berikutnya</button>
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-muted">Riwayat tercatat otomatis sejak fitur ini dipasang. Angka tebal berarti harga itu berubah dibanding sebelumnya.</p>
        </div>
      </div>
    </div>
  );
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => {
    const cells = splitCsv(line).map((cell) => cell.trim().toUpperCase());
    return cells.some((cell) => cell === "KODE SPAREPART" || cell === "NAMA SPAREPART" || cell === "PART NUMBER");
  });
  if (headerIndex < 0 || headerIndex === lines.length - 1) return [];
  const headers = splitCsv(lines[headerIndex]);
  return lines.slice(headerIndex + 1).map((line) => {
    let cells = splitCsv(line);
    if (cells.length > headers.length) {
      const nameIndex = headers.findIndex((header) => {
        const name = header.trim().toUpperCase();
        return name === "NAMA SPAREPART" || name === "NAMA";
      });
      if (nameIndex >= 0) {
        const extra = cells.length - headers.length;
        const nama = cells.slice(nameIndex, nameIndex + 1 + extra).join(", ");
        cells = [...cells.slice(0, nameIndex), nama, ...cells.slice(nameIndex + 1 + extra)];
      }
    }
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => value.trim()));
}

function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if ((ch === "," || ch === ";") && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function printBarcode(item: Product) {
  const { default: JsBarcode } = await import("jsbarcode");
  const make = (code: string) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, code, { format: "CODE128", width: 1.2, height: 40, displayValue: true, fontSize: 12, margin: 4 });
    return svg.outerHTML;
  };
  const dus = item.satuanAlt
    ? `<hr><div><b>${item.nama}</b><div>${item.merek || "-"} · ${item.partNumber || "-"}</div>${item.kodePajak ? `<div>${item.kodePajak}</div>` : ""}${make(`${item.kode}-DUS`)}<div style="font-size:16px">${rupiah(item.hargaJualAlt)}</div></div>`
    : "";
  const html = `<!doctype html><html><body style="font-family:sans-serif;width:280px;margin:16px auto;text-align:center">
    <div><b>${item.nama}</b><div style="font-size:12px">${item.merek || "-"} · PN ${item.partNumber || "-"}</div>${item.kodePajak ? `<div>${item.kodePajak}</div>` : ""}${make(`${item.kode}-PCS`)}<div style="font-size:16px">${rupiah(item.hargaJual)}</div></div>
    ${dus}
  </body></html>`;
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) {
    toast.error("Popup diblokir. Izinkan popup untuk mencetak barcode.");
    return;
  }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

type OriginData = {
  suppliers: Array<{ supplierId: number; supplierName: string; totalQtyDasar: number; receiptCount: number; lastAt: string; lastInvoice: string; lastHargaBeli: number; lastSatuan: string }>;
  history: Array<{ receiptId: number; invoiceNo: string; receivedAt: string; supplierId: number; supplierName: string; qty: number; satuan: string; qtyDasar: number; hargaBeli: number }>;
};

/** Asal barang: pemasok mana saja yang pernah memasok barang ini (dari catatan Barang Masuk Pemasok). */
function OriginModal({ item, data, onClose, onGoInvoice }: { item: Product; data: OriginData | null; onClose: () => void; onGoInvoice?: (invoiceNo: string) => void }) {
  const suppliers = data?.suppliers ?? [];
  // Dibagi per halaman (5 baris) supaya popup tidak penuh.
  const PAGE = 5;
  const [supPage, setSupPage] = useState(1);
  const [histPage, setHistPage] = useState(1);
  const supPages = Math.max(1, Math.ceil(suppliers.length / PAGE));
  const supCur = Math.min(supPage, supPages);
  const supStart = (supCur - 1) * PAGE;
  const histRows = data?.history ?? [];
  const histPages = Math.max(1, Math.ceil(histRows.length / PAGE));
  const histCur = Math.min(histPage, histPages);
  const histStart = (histCur - 1) * PAGE;
  const prices = suppliers.map((s) => s.lastHargaBeli).filter((n) => n > 0);
  const cheapest = suppliers.length > 1 && prices.length ? Math.min(...prices) : 0;
  const hasDus = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
  /** Total dalam satuan dasar, plus setara satuan kedua (mis. dus) kalau barangnya punya. */
  function qtyText(dasar: number) {
    const base = `${grouped(dasar)} ${item.satuan}`;
    return hasDus && dasar >= item.isiSatuanAlt ? `${base} (± ${grouped(Math.floor(dasar / item.isiSatuanAlt))} ${item.satuanAlt})` : base;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold">Asal Barang (Pemasok)</h3>
            <p className="text-sm text-muted">{item.nama}{item.partNumber ? ` · ${item.partNumber}` : ""}</p>
          </div>
          <button type="button" className="h-10 rounded-lg border border-line px-4 text-sm font-medium" onClick={onClose}>Tutup</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {data === null ? <p className="py-8 text-center text-sm text-muted">Memuat data pemasok...</p> : null}
          {data && suppliers.length === 0 ? <p className="py-8 text-center text-sm text-muted">Belum ada catatan Barang Masuk Pemasok untuk barang ini.</p> : null}
          {data && suppliers.length ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[11px] text-muted">Stok sekarang</span><b>{qtyText(item.stok)}</b></div>
                <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[11px] text-muted">Jumlah pemasok</span><b>{suppliers.length}</b></div>
                <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[11px] text-muted">Harga beli terakhir termurah</span><b>{cheapest > 0 ? rupiah(cheapest) : "-"}</b></div>
              </div>
              <h4 className="mt-4 text-sm font-extrabold">Per pemasok{onGoInvoice ? <span className="font-normal text-muted"> · klik baris untuk membuka invoice-nya</span> : null}</h4>
              <div className="overflow-x-auto">
                <table className="mt-1 w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                    <tr><th className="px-3 py-2 text-left">Pemasok</th><th className="px-3 py-2 text-right">Total masuk</th><th className="px-3 py-2 text-left">Terakhir masuk</th><th className="px-3 py-2 text-left">Invoice</th><th className="px-3 py-2 text-right">Harga beli terakhir</th></tr>
                  </thead>
                  <tbody>
                    {suppliers.slice(supStart, supStart + PAGE).map((s, i) => { const index = supStart + i; return (
                      <tr key={s.supplierId} className={`border-t border-line align-top ${onGoInvoice ? "cursor-pointer" : ""}`} title={onGoInvoice ? "Klik untuk membuka invoice terakhir dari pemasok ini" : undefined} onClick={onGoInvoice ? () => onGoInvoice(s.lastInvoice) : undefined}>
                        <td className={`px-3 py-2 font-semibold ${onGoInvoice ? "underline decoration-dotted underline-offset-2" : ""}`}>{s.supplierName}{index === 0 ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Terbaru</span> : null}</td>
                        <td className="px-3 py-2 text-right">{qtyText(s.totalQtyDasar)}<span className="block text-[11px] text-muted">{s.receiptCount}x penerimaan</span></td>
                        <td className="whitespace-nowrap px-3 py-2">{dateOnly(s.lastAt)}</td>
                        <td className={`px-3 py-2 font-mono text-xs font-bold ${onGoInvoice ? "text-accent underline" : ""}`}>{s.lastInvoice}</td>
                        <td className={`num px-3 py-2 text-right ${cheapest > 0 && s.lastHargaBeli === cheapest ? "font-bold text-emerald-700" : ""}`}>{rupiah(s.lastHargaBeli)}<span className="block text-[11px] font-normal text-muted">per {s.lastSatuan}</span></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
                {suppliers.length > PAGE ? <MiniPager page={supCur} pages={supPages} from={supStart + 1} to={Math.min(supStart + PAGE, suppliers.length)} total={suppliers.length} noun="pemasok" onPage={setSupPage} /> : null}
              </div>
              <h4 className="mt-4 text-sm font-extrabold">Riwayat penerimaan (terbaru di atas)</h4>
              <div className="overflow-x-auto">
                <table className="mt-1 w-full text-sm">
                  <tbody>
                    {data.history.slice(histStart, histStart + PAGE).map((row, i) => { const index = histStart + i; return (
                      <tr key={`${row.receiptId}-${index}`} className={`border-t border-line ${onGoInvoice ? "cursor-pointer" : ""}`} title={onGoInvoice ? "Klik untuk membuka invoice ini" : undefined} onClick={onGoInvoice ? () => onGoInvoice(row.invoiceNo) : undefined}>
                        <td className="whitespace-nowrap px-3 py-2">{dateOnly(row.receivedAt)}</td>
                        <td className="px-3 py-2 font-semibold">{row.supplierName}</td>
                        <td className={`px-3 py-2 font-mono text-xs ${onGoInvoice ? "text-accent underline" : ""}`}>{row.invoiceNo}</td>
                        <td className="px-3 py-2 text-right">{grouped(row.qty)} {row.satuan}</td>
                        <td className="num px-3 py-2 text-right">{rupiah(row.hargaBeli)}</td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
                {histRows.length > PAGE ? <MiniPager page={histCur} pages={histPages} from={histStart + 1} to={Math.min(histStart + PAGE, histRows.length)} total={histRows.length} noun="penerimaan" onPage={setHistPage} /> : null}
              </div>
            </>
          ) : null}
          <p className="mt-3 text-xs text-muted">Data diambil dari menu Barang Masuk Pemasok. Barang yang masuk sebelum dicatat di menu itu tidak muncul di sini.</p>
        </div>
      </div>
    </div>
  );
}


/** Rincian satu barang, hanya baca. Dipakai akun Staf; harga beli sengaja tidak ditampilkan. */
function ProductDetailModal({ item, onClose }: { item: Product; onClose: () => void }) {
  const level = stockLevel(item);
  const dus = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
  const dusQty = dus ? Math.floor(item.stok / item.isiSatuanAlt) : 0;
  const sisa = dus ? item.stok % item.isiSatuanAlt : 0;
  const rows: Array<[string, ReactNode]> = [
    ["Kode barang", item.kode || "-"],
    ["Part number", item.partNumber || "-"],
    ["Part number lain", item.partNumbersAlt || "-"],
    ["Kategori", item.kategori || "-"],
    ["Merek", item.merek || "-"],
    ["Satuan", item.satuan || "-"],
    ["Stok minimum", `${item.stokMin} ${item.satuan}`],
    ["Harga jual", `${rupiah(item.hargaJual)} / ${item.satuan}`],
    ...(dus ? ([[`Isi 1 ${item.satuanAlt}`, `${item.isiSatuanAlt} ${item.satuan}`], [`Harga jual 1 ${item.satuanAlt}`, rupiah(item.hargaJualAlt)]] as Array<[string, ReactNode]>) : []),
    ["Status pajak", item.pajakStatus === "Pajak" ? `Pajak${item.kodePajak ? ` · ${item.kodePajak}` : ""}` : "Non Pajak"],
    ["Keterangan", item.keterangan || "-"],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-panel p-4 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{item.nama}</h2>
            {item.merek ? <span className="mt-1 inline-block rounded bg-blue-100 px-1.5 py-px text-[11px] font-bold text-blue-800">{item.merek}</span> : null}
          </div>
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-white" onClick={onClose} aria-label="Tutup"><X className="size-4" /></button>
        </div>
        <div className="mt-3 rounded-xl border border-line bg-white p-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Stok saat ini</p>
          <p className={`num text-3xl font-extrabold ${level === "HABIS" ? "text-red-700" : level === "MENIPIS" ? "text-amber-700" : "text-slate-900"}`}>{item.stok} {item.satuan}</p>
          {dus ? <p className="text-xs font-medium text-blue-700">= {dusQty} {item.satuanAlt}{sisa ? ` + ${sisa} ${item.satuan}` : ""}</p> : null}
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${level === "HABIS" ? "bg-red-100 text-red-700" : level === "MENIPIS" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{level === "MENIPIS" ? "KRITIS" : level}</span>
        </div>
        <dl className="mt-3 divide-y divide-line text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-slate-600">{label}</dt>
              <dd className="break-words text-right font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex justify-end">
          <button type="button" className="h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
