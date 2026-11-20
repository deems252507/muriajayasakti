import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HasilBadge, ItemTitle, draftEntryText, MetaLine, Pager, StatusBadge, TONE, hasilTone, selisihClass, selisihText, waktuText } from "@/components/shop/opname-ui";
import { confirmDialog } from "@/lib/confirm";
import { MarkWords, inputClass } from "@/components/shop/shell";
import { KategoriPicker } from "@/components/shop/opname-kategori";
import { opnameApply, opnameDelete, opnameGetItem, opnameHistory } from "@/lib/shop/api";
import type { OpnameItem, OpnameLog } from "@/lib/shop/types";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const dateFmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", year: "numeric" }).format(d);
};
const timeFmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(".", ":");
};

const th = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2.5 align-middle";

export function OpnameHistory({
  categories,
  productId,
  onClearProduct,
  onOpenItem,
  canOpen,
  canDelete,
}: {
  categories: string[];
  productId: number | null;
  onClearProduct: () => void;
  onOpenItem: (id: number) => void;
  canOpen: boolean;
  /** Admin: boleh menghapus catatan riwayat. */
  canDelete: boolean;
}) {
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [del, setDel] = useState<OpnameLog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [belumDiterapkan, setBelumDiterapkan] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [applying, setApplying] = useState(false);
  const [itemInfo, setItemInfo] = useState<OpnameItem | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: OpnameLog[] } | null>(null);
  const [error, setError] = useState("");
  const dq = useDebounced(q.trim());

  useEffect(() => {
    let alive = true;
    void opnameHistory({ data: { q: dq, kategori, productId, onlyDiff, belumDiterapkan, dateFrom, dateTo, page } })
      .then((res) => {
        if (!alive) return;
        setError("");
        setData(res);
      })
      .catch((err: Error) => {
        if (!alive) return;
        setError(err.message || "Gagal memuat riwayat.");
        toast.error(err.message || "Gagal memuat riwayat.");
      });
    return () => {
      alive = false;
    };
  }, [dq, kategori, productId, onlyDiff, belumDiterapkan, dateFrom, dateTo, page, reload]);

  // Riwayat satu barang: tampilkan juga data barangnya dari Master Data.
  useEffect(() => {
    setItemInfo(null);
    if (productId == null) return;
    let alive = true;
    void opnameGetItem({ data: { productId } })
      .then((res) => { if (alive) setItemInfo(res.item); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [productId, reload]);

  useEffect(() => { setSelected([]); }, [dq, kategori, productId, onlyDiff, belumDiterapkan, dateFrom, dateTo, page]);

  const items = data?.items ?? [];
  const productName = productId != null ? items[0]?.nama || `Barang #${productId}` : "";
  const reset = () => {
    setQ("");
    setKategori([]);
    setOnlyDiff(false);
    setBelumDiterapkan(false);
    setDateFrom("");
    setDateTo("");
    setPage(1);
    onClearProduct();
  };

  return (
    <div>
      {productId != null ? (
        <section className="mb-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Riwayat satu barang</p>
            <button type="button" aria-label="Tampilkan riwayat semua barang" onClick={() => { setPage(1); onClearProduct(); }} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-bold text-blue-800">
              <X className="size-4" /> Semua barang
            </button>
          </div>
          {itemInfo ? (
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-60">
                <ItemTitle item={itemInfo} className="text-base" />
                <div className="mt-1.5 space-y-0.5">
                  <MetaLine label="Kategori" value={itemInfo.kategori} />
                  <MetaLine label="Part Number" value={itemInfo.partNumber || itemInfo.kode} mono />
                  <MetaLine label="Part Number Alt" value={itemInfo.partNumbersAlt} mono />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={itemInfo.statusCek} />
                  {itemInfo.hasil ? <HasilBadge hasil={itemInfo.hasil} stale={itemInfo.statusCek === "PERLU_CEK_ULANG"} /> : null}
                </div>
              </div>
              <div className="shrink-0 text-center">
                <div className="rounded-xl border border-blue-100 bg-white px-4 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Stok Sistem Sekarang</p>
                  <p className="num text-2xl font-extrabold leading-tight text-slate-900">{itemInfo.stok.toLocaleString("id-ID")}</p>
                  <p className="text-xs font-semibold text-slate-600">{itemInfo.satuan}</p>
                </div>
                {canOpen ? (
                  <button type="button" aria-label="Buka halaman cek barang" onClick={() => onOpenItem(itemInfo.id)} className="mt-2 h-11 w-full rounded-xl bg-accent px-4 text-sm font-extrabold text-white">
                    {canDelete ? "Cek Barang" : "Lihat Detail"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm font-semibold text-blue-900">{productName}</p>
          )}
        </section>
      ) : null}

      <div className={`grid gap-2 sm:grid-cols-2 ${productId != null ? "xl:grid-cols-[repeat(2,minmax(0,1fr))_auto_auto_auto]" : "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_repeat(2,minmax(0,.8fr))_auto_auto_auto]"}`}>
        {productId != null ? null : <input className={inputClass} placeholder="Cari nama, kode, part number, merek, petugas" aria-label="Cari riwayat" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />}
        {productId != null ? null : <KategoriPicker value={kategori} options={categories} onChange={(next) => { setPage(1); setKategori(next); }} />}
        <input type="date" className={inputClass} aria-label="Dari tanggal" value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} />
        <input type="date" className={inputClass} aria-label="Sampai tanggal" value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} />
        <label className="flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => { setPage(1); setOnlyDiff(e.target.checked); }} /> Hanya selisih
        </label>
        {canDelete ? (
          <label className="flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
            <input type="checkbox" checked={belumDiterapkan} onChange={(e) => { setPage(1); setBelumDiterapkan(e.target.checked); }} /> Belum diterapkan ke stok
          </label>
        ) : null}
        <button type="button" aria-label="Reset filter riwayat" onClick={reset} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800">Reset</button>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <p className="mt-3 text-xs text-slate-500">{data ? `${data.total.toLocaleString("id-ID")} catatan pemeriksaan` : "Memuat..."}</p>

      {canDelete && items.some((r) => r.bisaTerapkan) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <span className="min-w-0 flex-1 basis-48">Ada pemeriksaan yang belum diterapkan ke stok Master Data. Terapkan agar stok sistem sama dengan hasil fisik.</span>
          <button type="button" aria-label="Pilih semua yang bisa diterapkan" onClick={() => setSelected(items.filter((r) => r.bisaTerapkan).map((r) => r.id))} className="h-10 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900">
            Pilih semua di halaman ini
          </button>
          <button type="button" aria-label="Terapkan catatan terpilih ke stok" disabled={applying || selected.length === 0} onClick={() => void doApply(selected)} className="h-10 rounded-lg bg-amber-600 px-3 text-xs font-extrabold text-white disabled:opacity-50">
            Terapkan ke Stok ({selected.length})
          </button>
        </div>
      ) : null}

      {data && items.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada riwayat pemeriksaan pada filter ini.</div>
      ) : null}

      {/* HP & tablet: kartu */}
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2 xl:hidden">
        {items.map((row) => (
          <article key={row.id} className={`rounded-xl border border-l-4 border-slate-200 bg-white p-3 shadow-sm ${TONE[hasilTone(row.hasil)].edge}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1"><ItemTitle item={row} q={q} className="text-[15px]" /></div>
              <HasilBadge hasil={row.hasil} />
            </div>
            <div className="mt-1.5 space-y-0.5">
              <MetaLine label="Part Number" value={row.partNumber || row.kode} q={q} mono />
              {row.partNumbersAlt ? <MetaLine label="Part Number Alt" value={row.partNumbersAlt} q={q} mono /> : null}
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
              <Mini label="Sebelum" value={`${row.stokSebelum}`} />
              <Mini label="Fisik" value={`${row.stokFisik}`} />
              <Mini label="Selisih" value={selisihText(row.selisih)} valueClass={selisihClass(row.selisih)} />
              <Mini label="Sesudah" value={`${row.stokSesudah}`} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{waktuText(row.dicekPada)} · {row.petugas || "-"} · {row.satuan}{row.disesuaikan ? " · stok disesuaikan" : ""}</p>
            {row.rincian?.length ? <p className="mt-0.5 break-words text-xs text-violet-800">Rincian: {row.rincian.map(draftEntryText).join(" + ")}</p> : null}
            {row.catatan ? <p className="mt-0.5 break-words text-xs text-slate-700">Catatan: {row.catatan}</p> : null}
            {!row.disesuaikan && row.selisih !== 0 ? (
              <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">Belum diterapkan ke stok (stok tetap {row.stokSesudah} {row.satuan})</p>
            ) : null}
            {row.diterapkanPada ? <p className="mt-1 text-[11px] text-slate-500">Diterapkan ke stok {waktuText(row.diterapkanPada)}</p> : null}
            {canDelete && row.bisaTerapkan ? (
              <label className="mt-2 flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" className="size-4" checked={selected.includes(row.id)} onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, row.id] : cur.filter((x) => x !== row.id)))} /> Pilih untuk diterapkan
              </label>
            ) : null}
            {canDelete && row.bisaTerapkan ? (
              <button type="button" aria-label={`Terapkan ke stok ${row.nama}`} disabled={applying} onClick={() => void doApply([row.id])} className="mt-1 h-11 w-full rounded-xl bg-amber-600 text-sm font-extrabold text-white disabled:opacity-60">Terapkan ke Stok</button>
            ) : null}
            <div className="mt-2 flex gap-2">
              {canOpen && row.productId != null ? (
                <button type="button" aria-label={`Buka barang ${row.nama}`} onClick={() => onOpenItem(row.productId as number)} className="h-10 flex-1 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800">Buka barang</button>
              ) : null}
              {canDelete ? (
                <button type="button" aria-label={`Hapus catatan ${row.nama}`} onClick={() => setDel(row)} className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-danger">
                  <Trash2 className="size-4" /> Hapus
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {/* Layar lebar: tabel */}
      {items.length ? (
        <div className="mt-2 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white xl:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-300 bg-slate-100">
              <tr>
                {canDelete ? <th className={th}><span className="sr-only">Pilih</span></th> : null}
                <th className={th}>Nama Barang</th>
                <th className={`${th} text-center`}>Stok Sebelum</th>
                <th className={`${th} text-center`}>Stok Fisik</th>
                <th className={`${th} text-center`}>Selisih</th>
                <th className={`${th} text-center`}>Stok Sesudah</th>
                <th className={`${th} text-center`}>Hasil</th>
                <th className={th}>Tanggal</th>
                <th className={th}>Jam</th>
                <th className={th}>Petugas</th>
                <th className={th}>Catatan</th>
                {canDelete ? <th className={`${th} text-center`}>Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-blue-50/50">
                  {canDelete ? (
                    <td className="px-2 py-2.5 text-center">
                      {row.bisaTerapkan ? <input type="checkbox" className="size-4" aria-label={`Pilih ${row.nama}`} checked={selected.includes(row.id)} onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, row.id] : cur.filter((x) => x !== row.id)))} /> : null}
                    </td>
                  ) : null}
                  <td className={`${td} min-w-[220px] max-w-[320px]`}>
                    <ItemTitle item={row} q={q} />
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500"><MarkWords text={row.partNumber || row.kode || "-"} q={q} /></div>
                  </td>
                  <td className={`${td} whitespace-nowrap text-center`}>{row.stokSebelum} {row.satuan}</td>
                  <td className={`${td} whitespace-nowrap text-center font-semibold`}>{row.stokFisik} {row.satuan}</td>
                  <td className={`${td} whitespace-nowrap text-center font-bold ${selisihClass(row.selisih)}`}>{selisihText(row.selisih)}</td>
                  <td className={`${td} whitespace-nowrap text-center`}>{row.stokSesudah} {row.satuan}</td>
                  <td className={`${td} text-center`}>
                    <HasilBadge hasil={row.hasil} />
                    {!row.disesuaikan && row.selisih !== 0 ? <div className="mt-1 text-[10px] font-bold text-amber-700">Belum diterapkan</div> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap text-xs`}>{dateFmt(row.dicekPada)}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>{timeFmt(row.dicekPada)}</td>
                  <td className={`${td} text-xs`}>{row.petugas || "-"}</td>
                  <td className={`${td} max-w-[220px] break-words text-xs text-slate-600`}>
                    {row.rincian?.length ? <div className="font-semibold text-violet-800">Rincian: {row.rincian.map(draftEntryText).join(" + ")}</div> : null}
                    {row.catatan || (row.rincian?.length ? "" : "-")}
                  </td>
                  {canDelete ? (
                    <td className="whitespace-nowrap px-2 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        {row.bisaTerapkan ? (
                          <button type="button" aria-label={`Terapkan ke stok ${row.nama}`} disabled={applying} onClick={() => void doApply([row.id])} className="h-10 rounded-xl bg-amber-600 px-3 text-xs font-extrabold text-white disabled:opacity-60">Terapkan ke Stok</button>
                        ) : null}
                        <button type="button" aria-label={`Hapus catatan ${row.nama}`} onClick={() => setDel(row)} className="grid size-10 place-items-center rounded-xl border border-red-200 bg-red-50 text-danger">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data ? <Pager page={page} total={data.total} perPage={data.perPage} onPage={setPage} /> : null}

      {del ? (
        <div className="fixed inset-0 z-[70] grid place-items-end bg-ink/45 p-0 sm:place-items-center sm:p-4" onClick={() => !deleting && setDel(null)}>
          <div role="alertdialog" aria-modal="true" className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-slate-900">Hapus catatan pemeriksaan?</h3>
            <p className="mt-1 text-sm text-slate-700">
              <b>{del.nama}</b> · {waktuText(del.dicekPada)}<br />
              Sistem {del.stokSebelum} · Fisik {del.stokFisik} · Stok sesudah {del.stokSesudah} {del.satuan}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {del.bisaKembali
                ? `Stok barang sekarang masih ${del.stokSesudah} ${del.satuan}, hasil pemeriksaan ini. Anda bisa sekalian mengembalikan stok ke ${del.stokSebelum} ${del.satuan}.`
                : del.disesuaikan
                  ? "Stok barang sudah berubah sejak pemeriksaan ini (atau ada pemeriksaan yang lebih baru), jadi hanya catatannya yang dihapus. Stok tidak berubah."
                  : "Hanya catatannya yang dihapus. Stok tidak berubah."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {del.bisaKembali ? (
                <button type="button" aria-label="Hapus dan kembalikan stok" disabled={deleting} onClick={() => void doDelete(del, true)} className="h-12 rounded-xl bg-danger text-sm font-extrabold text-white disabled:opacity-60">
                  Hapus & kembalikan stok ke {del.stokSebelum} {del.satuan}
                </button>
              ) : null}
              <button type="button" aria-label="Hapus catatan saja" disabled={deleting} onClick={() => void doDelete(del, false)} className={`h-12 rounded-xl text-sm font-extrabold disabled:opacity-60 ${del.bisaKembali ? "border border-red-200 bg-red-50 text-danger" : "bg-danger text-white"}`}>
                {del.bisaKembali ? "Hapus catatan saja (stok tetap)" : "Hapus catatan"}
              </button>
              <button type="button" aria-label="Batal" disabled={deleting} onClick={() => setDel(null)} className="h-12 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800">Batal</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  async function doApply(ids: number[]) {
    if (applying || ids.length === 0) return;
    const ok = await confirmDialog(
      ids.length === 1 ? "Terapkan hasil pemeriksaan ini ke stok Master Data? Stok barang akan diubah menjadi jumlah fisik." : `Terapkan ${ids.length} hasil pemeriksaan ke stok Master Data? Stok masing-masing barang akan diubah menjadi jumlah fisiknya.`,
      { title: "Terapkan ke stok?", confirmText: "Ya, terapkan" },
    );
    if (!ok) return;
    setApplying(true);
    try {
      const res = await opnameApply({ data: { logIds: ids } });
      if (res.berhasil > 0) toast.success(`${res.berhasil} barang stoknya sudah diterapkan`);
      if (res.gagal.length > 0) {
        toast.warning(`${res.gagal.length} tidak bisa diterapkan: ${res.gagal.slice(0, 3).map((g) => `${g.nama} (${g.alasan})`).join("; ")}${res.gagal.length > 3 ? "; ..." : ""}`, { duration: 9000 });
      }
      setSelected([]);
      setReload((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menerapkan ke stok.");
    } finally {
      setApplying(false);
    }
  }

  async function doDelete(row: OpnameLog, kembalikan: boolean) {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await opnameDelete({ data: { logId: row.id, kembalikan } });
      if (!res.ok) {
        toast.warning("Stok barang sudah berubah, jadi tidak bisa dikembalikan. Pilih hapus catatan saja.");
      } else {
        toast.success(res.dikembalikan ? `Catatan dihapus, stok dikembalikan menjadi ${res.stokSekarang} ${row.satuan}` : "Catatan dihapus");
      }
      setDel(null);
      setReload((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus catatan.");
    } finally {
      setDeleting(false);
    }
  }
}

function Mini({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-1 py-1.5">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`num truncate text-sm font-extrabold ${valueClass}`}>{value}</p>
    </div>
  );
}
