import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { inputClass, Panel } from "@/components/shop/shell";
import { listTax } from "@/lib/shop/api";
import { PeriodPicker } from "@/components/shop/period";
import { rupiah, todayInput, when } from "@/lib/shop/format";
import { printTaxNotes } from "@/lib/shop/print";

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
  const groups = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const key = String(row.nomor || "-");
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [rows]);

  function cetak(nomor?: string) {
    try {
      printTaxNotes(rows, start, end, nomor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mencetak");
    }
  }

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="font-extrabold">Laporan Pajak Internal per Nota</h2>
        <p className="mt-1 text-xs text-muted">Satu blok biru = satu nota. Tombol Cetak PDF di kanan mencetak nota itu saja. Cetak PDF Semua Nota mencetak semua nota pada tanggal yang dipilih, tetap dipisah per nota.</p>
        <div className="mt-3 space-y-3">
          <PeriodPicker start={start} end={end} onChange={(nextStart, nextEnd) => { setStart(nextStart); setEnd(nextEnd); }} />
          <div className="flex flex-wrap gap-2">
          <button className="h-9 rounded-lg border border-line px-3 text-xs" onClick={() => { const t = todayInput(); setStart(t); setEnd(t); setJenis(""); setKategori(""); }}>Reset</button>
          <button className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => cetak()}>Cetak PDF Semua Nota</button>
          <button className="h-9 rounded-lg border border-line px-3 text-xs font-bold" onClick={() => {
            if (!rows.length) return toast.error("Tidak ada data untuk diexport.");
            const header = ["Tanggal", "Nota", "Part Number", "Kode Pajak", "Nama", "Jenis", "Status", "Pelanggan", "Qty", "Satuan", "DPP", "PPN %", "Nilai PPN", "Total"];
            const body = rows.map((row) => [row.tanggal, row.nomor, row.part_number, row.kode_pajak, row.nama, row.kategori, row.status_bayar, row.pelanggan, row.jumlah, row.satuan, row.dpp, row.persentase, row.nilai_pajak, Number(row.harga_satuan) * Number(row.jumlah)].map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","));
            const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Laporan_Pajak_Internal_${start}_${end}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
          }}>Export CSV</button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <select className={inputClass} value={jenis} onChange={(e) => setJenis(e.target.value)}>
            <option value="">Semua Transaksi</option>
            <option value="Tunai">CASH</option>
            <option value="Bon">BON</option>
          </select>
          <input className={inputClass} list="jenis-pajak" placeholder="Ketik jenis, contoh Oli" value={kategori} onChange={(e) => setKategori(e.target.value)} />
          <datalist id="jenis-pajak">
            {["Aki Basah", "Aki Kering", "Oli", "Air Radiator", "Minyak Rem", "Lainnya"].map((item) => <option key={item} value={item} />)}
          </datalist>
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
            {groups.length === 0 ? <tr><td colSpan={9} className="py-6 text-center text-muted">Belum ada data pajak yang tercatat.</td></tr> : null}
            {groups.map(([nomor, items]) => (
              <Fragment key={nomor}>
                <tr key={`${nomor}-head`} className="bg-blue-50">
                  <td colSpan={8} className="px-2 py-2 text-xs font-bold">NOTA {nomor} · {items.length} barang · {String(items[0].status_bayar) === "Bon" ? "BON" : "CASH"}</td>
                  <td className="px-2 py-2 text-right"><button className="text-xs font-bold text-accent" onClick={() => cetak(nomor)}>Cetak PDF</button></td>
                </tr>
                {items.map((row) => (
                  <tr key={String(row.id)}>
                    <td className="px-2 py-2 text-xs">{when(String(row.tanggal))}</td>
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
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">Harga jual sudah termasuk pajak. DPP dibulatkan ke ribuan. Kode pajak hanya label, persen mengikuti jenis barang.</p>
      </Panel>
    </div>
  );
}
