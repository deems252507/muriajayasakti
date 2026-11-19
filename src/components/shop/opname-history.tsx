import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HasilBadge, MetaLine, Pager, TONE, ItemTitle, hasilTone, selisihClass, selisihText, waktuText } from "@/components/shop/opname-ui";
import { MarkWords, inputClass } from "@/components/shop/shell";
import { opnameHistory } from "@/lib/shop/api";
import type { OpnameLog } from "@/lib/shop/types";

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
}: {
  categories: string[];
  productId: number | null;
  onClearProduct: () => void;
  onOpenItem: (id: number) => void;
  canOpen: boolean;
}) {
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: OpnameLog[] } | null>(null);
  const [error, setError] = useState("");
  const dq = useDebounced(q.trim());

  useEffect(() => {
    let alive = true;
    void opnameHistory({ data: { q: dq, kategori: kategori ? [kategori] : [], productId, onlyDiff, dateFrom, dateTo, page } })
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
  }, [dq, kategori, productId, onlyDiff, dateFrom, dateTo, page]);

  const items = data?.items ?? [];
  const productName = productId != null ? items[0]?.nama || `Barang #${productId}` : "";
  const reset = () => {
    setQ("");
    setKategori("");
    setOnlyDiff(false);
    setDateFrom("");
    setDateTo("");
    setPage(1);
    onClearProduct();
  };

  return (
    <div>
      {productId != null ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span className="min-w-0 truncate">Riwayat barang: <b>{productName}</b></span>
          <button type="button" aria-label="Tampilkan riwayat semua barang" onClick={() => { setPage(1); onClearProduct(); }} className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-blue-800">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_repeat(2,minmax(0,.8fr))_auto_auto]">
        <input className={inputClass} placeholder="Cari nama, kode, part number, merek, petugas" aria-label="Cari riwayat" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select className={inputClass} aria-label="Kategori" value={kategori} onChange={(e) => { setPage(1); setKategori(e.target.value); }}>
          <option value="">Semua Kategori</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" className={inputClass} aria-label="Dari tanggal" value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} />
        <input type="date" className={inputClass} aria-label="Sampai tanggal" value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} />
        <label className="flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => { setPage(1); setOnlyDiff(e.target.checked); }} /> Hanya selisih
        </label>
        <button type="button" aria-label="Reset filter riwayat" onClick={reset} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800">Reset</button>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <p className="mt-3 text-xs text-slate-500">{data ? `${data.total.toLocaleString("id-ID")} catatan pemeriksaan` : "Memuat..."}</p>

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
              <MetaLine label="Kode" value={row.kode} q={q} mono />
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
            {row.catatan ? <p className="mt-0.5 break-words text-xs text-slate-700">Catatan: {row.catatan}</p> : null}
            {canOpen && row.productId != null ? (
              <button type="button" aria-label={`Buka barang ${row.nama}`} onClick={() => onOpenItem(row.productId as number)} className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800">Buka barang</button>
            ) : null}
          </article>
        ))}
      </div>

      {/* Layar lebar: tabel */}
      {items.length ? (
        <div className="mt-2 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white xl:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-300 bg-slate-100">
              <tr>
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
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-blue-50/50">
                  <td className={`${td} min-w-[220px] max-w-[320px]`}>
                    <ItemTitle item={row} q={q} />
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500"><MarkWords text={row.kode} q={q} /> · <MarkWords text={row.partNumber || "-"} q={q} /></div>
                  </td>
                  <td className={`${td} whitespace-nowrap text-center`}>{row.stokSebelum} {row.satuan}</td>
                  <td className={`${td} whitespace-nowrap text-center font-semibold`}>{row.stokFisik} {row.satuan}</td>
                  <td className={`${td} whitespace-nowrap text-center font-bold ${selisihClass(row.selisih)}`}>{selisihText(row.selisih)}</td>
                  <td className={`${td} whitespace-nowrap text-center`}>{row.stokSesudah} {row.satuan}</td>
                  <td className={`${td} text-center`}><HasilBadge hasil={row.hasil} /></td>
                  <td className={`${td} whitespace-nowrap text-xs`}>{dateFmt(row.dicekPada)}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>{timeFmt(row.dicekPada)}</td>
                  <td className={`${td} text-xs`}>{row.petugas || "-"}</td>
                  <td className={`${td} max-w-[220px] break-words text-xs text-slate-600`}>{row.catatan || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data ? <Pager page={page} total={data.total} perPage={data.perPage} onPage={setPage} /> : null}
    </div>
  );
}

function Mini({ label, value, valueClass = "text-slate-900" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-1 py-1.5">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`num truncate text-sm font-extrabold ${valueClass}`}>{value}</p>
    </div>
  );
}
