import { createFileRoute } from "@tanstack/react-router";
import { Store, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel, inputClass } from "@/components/shop/shell";
import { laporanGudang } from "@/lib/shop/api";
import { formatQtyPack, rupiah, when } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/laporan-gudang")({ component: LaporanGudangPage });

type Data = Awaited<ReturnType<typeof laporanGudang>>;

const HARI = [30, 60, 90, 180, 365];

function LaporanGudangPage() {
  const [hari, setHari] = useState(90);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void laporanGudang({ data: { hari } })
      .then((res) => { if (alive) { setData(res); setError(""); } })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [hari]);

  const total = (data?.nilaiToko ?? 0) + (data?.nilaiGudang ?? 0);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Keuangan & Laporan</p>
            <h2 className="text-xl font-extrabold">Laporan Nilai Stok Toko dan Gudang</h2>
            <p className="mt-1 text-sm text-muted">Nilai dihitung dari stok x harga beli satuan dasar barang. Toko dan gudang dipisah, tidak dijumlahkan di stok.</p>
          </div>
          <label className="no-print text-sm font-semibold">
            Barang gudang tidak bergerak lebih dari
            <select className={`${inputClass} mt-1 sm:!w-44`} value={hari} onChange={(e) => setHari(Number(e.target.value))}>
              {HARI.map((h) => <option key={h} value={h}>{h} hari</option>)}
            </select>
          </label>
        </div>
      </Panel>

      {error ? <Panel><p className="text-sm font-semibold text-red-700">{error}</p></Panel> : null}
      {loading && !data ? <Panel><p className="py-6 text-center text-sm text-slate-600">Memuat…</p></Panel> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-800"><Store className="size-4" />Nilai stok toko</p>
              <p className="num mt-1 text-2xl font-extrabold text-slate-900">{rupiah(data.nilaiToko)}</p>
              <p className="text-xs text-slate-600">{data.itemToko} barang ada stok</p>
            </Panel>
            <Panel>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800"><Warehouse className="size-4" />Nilai stok gudang</p>
              <p className="num mt-1 text-2xl font-extrabold text-slate-900">{rupiah(data.nilaiGudang)}</p>
              <p className="text-xs text-slate-600">{data.itemGudang} barang ada stok</p>
            </Panel>
            <Panel>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Total nilai persediaan</p>
              <p className="num mt-1 text-2xl font-extrabold text-slate-900">{rupiah(total)}</p>
              <p className="text-xs text-slate-600">Gudang {total > 0 ? Math.round((data.nilaiGudang / total) * 100) : 0}% dari total</p>
            </Panel>
          </div>

          <Panel className="overflow-x-auto">
            <h3 className="text-base font-extrabold">Per kategori</h3>
            <table className="mt-2 w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                <tr><th className="px-2 py-2">Kategori</th><th className="px-2 py-2 text-right">Toko</th><th className="px-2 py-2 text-right">Gudang</th><th className="px-2 py-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {data.kategori.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-muted">Belum ada stok bernilai.</td></tr> : null}
                {data.kategori.map((k) => (
                  <tr key={k.kategori} className="border-t border-line">
                    <td className="px-2 py-2 font-semibold">{k.kategori}</td>
                    <td className="num px-2 py-2 text-right">{rupiah(k.nilaiToko)}</td>
                    <td className="num px-2 py-2 text-right">{rupiah(k.nilaiGudang)}</td>
                    <td className="num px-2 py-2 text-right font-bold">{rupiah(k.nilaiToko + k.nilaiGudang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel className="overflow-x-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-extrabold">Barang gudang tidak bergerak lebih dari {data.hari} hari</h3>
              <p className="text-xs font-semibold text-slate-700">{data.diamJumlah} barang · nilai {rupiah(data.diamNilai)}</p>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">Bergerak berarti ada tambah stok, ambil ke toko, atau koreksi di gudang. Opname tidak dihitung. Urut dari nilai terbesar.{data.diam.length < data.diamJumlah ? ` Menampilkan ${data.diam.length} teratas.` : ""}</p>
            <table className="mt-2 w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                <tr><th className="px-2 py-2">Barang</th><th className="px-2 py-2 text-right">Stok gudang</th><th className="px-2 py-2 text-right">Nilai</th><th className="px-2 py-2">Terakhir bergerak</th><th className="px-2 py-2 text-right">Diam</th></tr>
              </thead>
              <tbody>
                {data.diam.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-muted">Tidak ada barang gudang yang diam lebih dari {data.hari} hari.</td></tr> : null}
                {data.diam.map((r) => (
                  <tr key={r.productId} className="border-t border-line align-top">
                    <td className="px-2 py-2"><b className="block text-sm">{r.nama}</b><span className="text-xs text-slate-600">{[r.partNumber || r.kode, r.kategori].filter(Boolean).join(" · ")}</span></td>
                    <td className="px-2 py-2 text-right font-semibold">{formatQtyPack(r.stokGudang, r.satuan, r.satuanAlt, r.isiSatuanAlt)}</td>
                    <td className="num px-2 py-2 text-right font-semibold">{rupiah(r.nilai)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs">{when(r.terakhir)}</td>
                    <td className="px-2 py-2 text-right text-xs font-bold text-amber-800">{r.hariDiam} hari</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
