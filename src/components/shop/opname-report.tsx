import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KategoriPicker } from "@/components/shop/opname-kategori";
import { OpnameRows } from "@/components/shop/opname-rows";
import { Pager, filterLabel, type OpnameFilterKey } from "@/components/shop/opname-ui";
import { inputClass } from "@/components/shop/shell";
import { opnameList } from "@/lib/shop/api";
import { printOpnameReport } from "@/lib/shop/print";
import type { OpnameItem } from "@/lib/shop/types";

const JENIS: Array<{ key: OpnameFilterKey; label: string }> = [
  { key: "semua", label: "Seluruh barang" },
  { key: "belum", label: "Barang belum dicek" },
  { key: "sudah", label: "Barang sudah dicek" },
  { key: "selisih", label: "Barang ada selisih" },
  { key: "habis", label: "Barang fisik habis" },
  { key: "sistem0", label: "Barang stok sistem 0" },
  { key: "ulang", label: "Barang perlu cek ulang" },
];

export function OpnameReport({ categories }: { categories: string[] }) {
  const [jenis, setJenis] = useState<OpnameFilterKey>("semua");
  const [kategori, setKategori] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: OpnameItem[] } | null>(null);
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);

  const query = { filter: jenis, kategori, dateFrom, dateTo };

  useEffect(() => {
    let alive = true;
    void opnameList({ data: { ...query, page } })
      .then((res) => {
        if (!alive) return;
        setError("");
        setData(res);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || "Gagal memuat laporan.");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jenis, kategori, dateFrom, dateTo, page]);

  async function cetak() {
    if (printing) return;
    setPrinting(true);
    try {
      const res = await opnameList({ data: { ...query, page: 1, all: true } });
      printOpnameReport(res.items, {
        jenis: JENIS.find((j) => j.key === jenis)?.label ?? filterLabel(jenis),
        kategori: kategori.join(", ") || "Semua Kategori",
        dateFrom,
        dateTo,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencetak laporan.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
        <select className={inputClass} aria-label="Jenis laporan" value={jenis} onChange={(e) => { setPage(1); setJenis(e.target.value as OpnameFilterKey); }}>
          {JENIS.map((j) => <option key={j.key} value={j.key}>{j.label}</option>)}
        </select>
        <KategoriPicker value={kategori} options={categories} onChange={(next) => { setPage(1); setKategori(next); }} />
        <label className="block">
          <span className="sr-only">Dicek dari tanggal</span>
          <input type="date" className={inputClass} aria-label="Dicek dari tanggal" value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} />
        </label>
        <label className="block">
          <span className="sr-only">Dicek sampai tanggal</span>
          <input type="date" className={inputClass} aria-label="Dicek sampai tanggal" value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} />
        </label>
        <button type="button" aria-label="Reset filter laporan" onClick={() => { setJenis("semua"); setKategori([]); setDateFrom(""); setDateTo(""); setPage(1); }} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800">
          Reset
        </button>
        <button type="button" aria-label="Cetak atau simpan PDF" disabled={printing || !data || data.total === 0} onClick={() => void cetak()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-50">
          <Printer className="size-4" /> {printing ? "Menyiapkan..." : "Cetak / PDF"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Tanggal memakai tanggal pemeriksaan terakhir barang. Untuk menyimpan PDF, pilih “Simpan sebagai PDF” di jendela cetak.
      </p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <p className="mt-3 text-xs font-semibold text-slate-600">{data ? `${data.total.toLocaleString("id-ID")} barang` : "Memuat..."}</p>
      <div className="mt-2">
        <OpnameRows items={data?.items ?? []} q="" canSave={false} readOnly empty="Tidak ada barang pada laporan ini." />
      </div>
      {data ? <Pager page={page} total={data.total} perPage={data.perPage} onPage={setPage} /> : null}
    </div>
  );
}
