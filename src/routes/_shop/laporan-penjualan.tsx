import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { PeriodPicker } from "@/components/shop/period";
import { inputClass, Panel } from "@/components/shop/shell";
import { listSalesNotes, listSoldItems, type SalesNote } from "@/lib/shop/api";
import { grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import { printSalesReport } from "@/lib/shop/print";

export const Route = createFileRoute("/_shop/laporan-penjualan")({ component: LaporanPenjualanPage });

type Row = Record<string, string | number>;

const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
const hariText = (iso: string) => new Date(`${iso}T12:00:00+08:00`).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

function LaporanPenjualanPage() {
  const [start, setStart] = usePersistedState("lapjual:start", todayInput());
  const [end, setEnd] = usePersistedState("lapjual:end", todayInput());
  const [source, setSource] = usePersistedState("lapjual:source", "Kasir");
  const [q, setQ] = usePersistedState("lapjual:q", "");
  const [view, setView] = useState<"nota" | "barang" | "hari">("nota");
  const [items, setItems] = useState<Row[]>([]);
  const [days, setDays] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [notes, setNotes] = useState<SalesNote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      void Promise.all([listSoldItems({ data: { start, end, source, q } }), listSalesNotes({ data: { start, end, source, q } })])
        .then(([res, nts]) => { setItems(res.items); setDays(res.days); setSummary(res.summary); setNotes(nts); })
        .catch((error: Error) => toast.error(error.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [start, end, source, q]);

  const totalQty = useMemo(() => items.reduce((sum, row) => sum + Number(row.qty), 0), [items]);
  const totalNilai = useMemo(() => items.reduce((sum, row) => sum + Number(row.nilai), 0), [items]);
  const totalNota = useMemo(() => days.reduce((sum, row) => sum + Number(row.nota), 0), [days]);
  const periode = start === end ? start : `${start} s/d ${end}`;

  function exportCsv() {
    const lines = view === "barang"
      ? [["No", "Nama Barang", "Part Number", "Kode Pajak", "Terjual (satuan dasar)", "Satuan", "Jumlah Nota", "Nilai (Rp)"], ...items.map((r, i) => [i + 1, r.nama, r.part_number, r.kode_pajak, r.qty, r.satuan, r.nota, r.nilai])]
      : [["Tanggal", "Jumlah Nota", "Qty Terjual", "Nilai (Rp)"], ...days.map((r) => [r.hari, r.nota, r.qty, r.nilai])];
    const csv = lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `penjualan-${view}-${start || "awal"}_${end || "akhir"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function cetak() {
    try {
      printSalesReport(notes, summary, start, end, source === "Semua" ? "Kasir + Manual" : source === "Manual" ? "Transaksi Manual" : "Penjualan Kasir");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mencetak");
    }
  }

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-lg font-extrabold">Laporan Barang Terjual</h2>
        <p className="text-xs text-muted">Semua barang yang keluar (terjual) pada periode yang dipilih, dijumlahkan per barang atau per hari. Retur belum dikurangkan.</p>
        <div className="mt-3 space-y-2">
          <PeriodPicker start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
          <div className="grid gap-2 md:grid-cols-3">
            <input className={inputClass} placeholder="Cari nama barang / part number / kode pajak" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="Kasir">Penjualan Kasir saja</option>
              <option value="Manual">Keluar dari Transaksi Manual saja</option>
              <option value="Semua">Kasir + Manual</option>
            </select>
            <div className="flex gap-2">
              <button type="button" className="h-11 flex-1 rounded-lg border border-line px-3 text-sm font-bold" onClick={exportCsv} disabled={!items.length}>Unduh Excel (CSV)</button>
              <button type="button" className="h-11 flex-1 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={cetak} disabled={!notes.length}>Cetak / Simpan PDF</button>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-lg bg-emerald-50 p-3"><p className="text-[10px] text-muted">Total Penjualan Kasir</p><p className="num font-black">{rupiah(Number(summary.omzet ?? 0))}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Tunai</p><p className="num font-black">{rupiah(Number(summary.tunai ?? 0))}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Transfer / QRIS</p><p className="num font-black">{rupiah(Number(summary.transfer ?? 0))}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Bon</p><p className="num font-black">{rupiah(Number(summary.bon ?? 0))}</p></div>
        </div>
        {Number(summary.manual_nota ?? 0) > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] text-muted">Total Transaksi Manual</p><p className="num font-black">{rupiah(Number(summary.manual_total ?? 0))}</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] text-muted">Nota Manual</p><p className="num font-black">{grouped(Number(summary.manual_nota ?? 0))}</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] text-muted">Bon Manual</p><p className="num font-black">{rupiah(Number(summary.manual_bon ?? 0))}</p></div>
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Jenis Barang Terjual</p><p className="font-black">{grouped(items.length)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Total Qty (satuan dasar)</p><p className="num font-black">{grouped(totalQty)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Jumlah Nota</p><p className="num font-black">{grouped(totalNota)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Nilai Penjualan</p><p className="num font-black">{rupiah(totalNilai)}</p></div>
        </div>
      </Panel>

      <Panel>
        <div className="flex gap-2">
          <button type="button" onClick={() => setView("nota")} className={`h-10 rounded-lg px-4 text-sm font-bold ${view === "nota" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>Per Nota</button>
          <button type="button" onClick={() => setView("barang")} className={`h-10 rounded-lg px-4 text-sm font-bold ${view === "barang" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>Per Barang</button>
          <button type="button" onClick={() => setView("hari")} className={`h-10 rounded-lg px-4 text-sm font-bold ${view === "hari" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>Per Hari</button>
          {loading ? <span className="self-center text-xs text-muted">Memuat...</span> : null}
        </div>
        <div className="mt-3 max-h-[65vh] overflow-auto rounded-lg border border-line">
          {view === "nota" ? (
            <div className="space-y-3 p-3">
              {notes.length === 0 ? <p className="py-10 text-center text-muted">Belum ada transaksi pada periode ini.</p> : notes.map((n) => (
                <div key={n.nomor} className="rounded-xl border border-line">
                  <div className="flex flex-wrap items-start justify-between gap-2 bg-slate-50 px-3 py-2">
                    <div>
                      <p className="font-bold">{n.nomor} <span className="ml-1 text-xs font-medium text-muted">{n.source}</span></p>
                      <p className="text-xs text-muted">{when(n.tanggal)} · {n.source === "Manual" ? "Admin" : "Kasir"}: {n.kasir || "-"} · Pelanggan: {n.tujuan || "Umum"} · {n.metode_bayar || "-"}{n.status_bayar === "Bon" ? " · BON" : ""}</p>
                    </div>
                    <p className="num font-black">{rupiah(n.total)}</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {n.lines.map((l, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-1.5">{l.nama}{l.part_number ? <span className="block text-[11px] text-muted">PN: {l.part_number}</span> : null}</td>
                          <td className="num px-2 text-right whitespace-nowrap">{grouped(l.jumlah)} {l.satuan}</td>
                          <td className="num px-2 text-right whitespace-nowrap">{rupiah(l.harga_satuan)}</td>
                          <td className="num px-3 text-right whitespace-nowrap font-semibold">{rupiah(l.harga_satuan * l.jumlah)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : view === "barang" ? (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
                <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2 text-left">Barang</th><th className="px-2 py-2 text-right">Terjual</th><th className="px-2 py-2 text-right">Nota</th><th className="px-2 py-2 text-right">Nilai</th></tr>
              </thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-muted">Belum ada barang terjual pada periode ini.</td></tr> : items.map((row, index) => (
                  <tr key={`${row.nama}-${row.part_number}-${index}`} className="border-t border-line">
                    <td className="px-2 py-2 text-muted">{index + 1}</td>
                    <td className="px-2 py-2"><b>{row.nama}</b><span className="block text-xs text-muted">PN: {row.part_number || "-"}{row.kode_pajak ? ` · Pajak ${row.kode_pajak}` : ""}</span></td>
                    <td className="num px-2 text-right font-semibold">{grouped(row.qty)} {row.satuan}</td>
                    <td className="num px-2 text-right">{row.nota}</td>
                    <td className="num px-2 text-right">{rupiah(Number(row.nilai))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
                <tr><th className="px-2 py-2 text-left">Tanggal</th><th className="px-2 py-2 text-right">Nota</th><th className="px-2 py-2 text-right">Qty Terjual</th><th className="px-2 py-2 text-right">Nilai</th></tr>
              </thead>
              <tbody>
                {days.length === 0 ? <tr><td colSpan={4} className="py-10 text-center text-muted">Belum ada penjualan pada periode ini.</td></tr> : days.map((row) => (
                  <tr key={String(row.hari)} className="border-t border-line">
                    <td className="px-2 py-2 font-medium">{hariText(String(row.hari))}</td>
                    <td className="num px-2 text-right">{row.nota}</td>
                    <td className="num px-2 text-right">{grouped(row.qty)}</td>
                    <td className="num px-2 text-right">{rupiah(Number(row.nilai))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
