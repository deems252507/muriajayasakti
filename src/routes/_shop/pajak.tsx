import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { inputClass, Panel } from "@/components/shop/shell";
import { listTax } from "@/lib/shop/api";
import { periodRange, rupiah, todayInput, when } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/pajak")({ component: PajakPage });

function PajakPage() {
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState(todayInput());
  const [jenis, setJenis] = useState("");
  const [kategori, setKategori] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void listTax({ data: { start, end, jenis, kategori } }).then((data) => setRows(data as Array<Record<string, unknown>>));
  }, [start, end, jenis, kategori]);

  const dpp = rows.reduce((sum, row) => sum + Number(row.dpp), 0);
  const ppn = rows.reduce((sum, row) => sum + Number(row.nilai_pajak), 0);
  const bruto = rows.reduce((sum, row) => sum + Number(row.harga_satuan) * Number(row.jumlah), 0);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month"] as const).map((kind) => (
            <button key={kind} className="h-9 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => {
              const range = periodRange(kind);
              setStart(range.start);
              setEnd(range.end);
            }}>{kind === "today" ? "Hari Ini" : kind === "week" ? "Minggu Ini" : "Bulan Ini"}</button>
          ))}
          <button className="h-9 rounded-lg border border-line px-3 text-xs" onClick={() => { const t = todayInput(); setStart(t); setEnd(t); setJenis(""); setKategori(""); }}>Reset</button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input className={inputClass} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className={inputClass} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <select className={inputClass} value={jenis} onChange={(e) => setJenis(e.target.value)}>
            <option value="">Semua Transaksi</option>
            <option value="Tunai">CASH</option>
            <option value="Bon">BON</option>
          </select>
          <select className={inputClass} value={kategori} onChange={(e) => setKategori(e.target.value)}>
            <option value="">Semua Jenis</option>
            {["Aki Basah", "Aki Kering", "Oli", "Air Radiator", "Minyak Rem", "Lainnya"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><p className="text-[11px] font-bold text-muted uppercase">Total Nota</p><p className="num text-xl font-black">{new Set(rows.map((row) => row.nomor)).size}</p></Panel>
        <Panel><p className="text-[11px] font-bold text-muted uppercase">Total Barang</p><p className="num text-xl font-black">{rows.reduce((sum, row) => sum + Number(row.jumlah), 0)}</p></Panel>
        <Panel><p className="text-[11px] font-bold text-muted uppercase">Total DPP</p><p className="num text-xl font-black">{rupiah(dpp)}</p></Panel>
        <Panel><p className="text-[11px] font-bold text-muted uppercase">PPN Internal</p><p className="num text-xl font-black">{rupiah(ppn)}</p></Panel>
        <Panel><p className="text-[11px] font-bold text-muted uppercase">Total Penjualan</p><p className="num text-xl font-black">{rupiah(bruto)}</p></Panel>
        <Panel><p className="text-[11px] font-bold text-muted uppercase">Total CASH</p><p className="num text-xl font-black">{rupiah(rows.filter((row) => row.status_bayar === "Lunas").reduce((sum, row) => sum + Number(row.harga_satuan) * Number(row.jumlah), 0))}</p></Panel>
        <Panel><p className="text-[11px] font-bold text-muted uppercase">Total BON</p><p className="num text-xl font-black">{rupiah(rows.filter((row) => row.status_bayar === "Bon").reduce((sum, row) => sum + Number(row.harga_satuan) * Number(row.jumlah), 0))}</p></Panel>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wide text-muted uppercase"><tr><th className="px-2 py-2">Tanggal</th><th>Barang</th><th>Part Number</th><th>Kode Pajak</th><th>Qty</th><th>DPP</th><th>%</th><th>Nilai PPN</th><th>Nota</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={9} className="py-6 text-center text-muted">Belum ada data pajak yang tercatat.</td></tr> : null}
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-line">
                <td className="px-2 py-2 text-xs">{when(String(row.tanggal))}<div className="text-muted">{String(row.status_bayar)}</div></td>
                <td>{String(row.nama)}<div className="text-xs text-muted">{String(row.kategori)}</div></td>
                <td className="font-mono text-xs">{String(row.part_number || "-")}</td>
                <td>{String(row.kode_pajak || "-")}</td>
                <td className="num">{String(row.jumlah)} {String(row.satuan)}</td>
                <td className="num">{rupiah(Number(row.dpp))}</td>
                <td className="num">{String(row.persentase)}</td>
                <td className="num">{rupiah(Number(row.nilai_pajak))}</td>
                <td className="text-xs">{String(row.nomor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">Harga jual sudah termasuk pajak. DPP dibulatkan ke ribuan. Kode pajak hanya label, persen mengikuti jenis barang.</p>
      </Panel>
    </div>
  );
}
