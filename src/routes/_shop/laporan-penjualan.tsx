import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PeriodPicker } from "@/components/shop/period";
import { inputClass, Panel } from "@/components/shop/shell";
import { listSoldItems } from "@/lib/shop/api";
import { grouped, rupiah, todayInput } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/laporan-penjualan")({ component: LaporanPenjualanPage });

type Row = Record<string, string | number>;

const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
const hariText = (iso: string) => new Date(`${iso}T12:00:00+08:00`).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

function LaporanPenjualanPage() {
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState(todayInput());
  const [source, setSource] = useState("Kasir");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"barang" | "hari">("barang");
  const [items, setItems] = useState<Row[]>([]);
  const [days, setDays] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      void listSoldItems({ data: { start, end, source, q } })
        .then((res) => { setItems(res.items); setDays(res.days); })
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
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return toast.error("Pop-up diblokir browser.");
    const head = view === "barang"
      ? "<tr><th>No</th><th>Nama Barang</th><th>Part Number</th><th>Terjual</th><th>Nota</th><th>Nilai</th></tr>"
      : "<tr><th>Tanggal</th><th>Nota</th><th>Qty Terjual</th><th>Nilai</th></tr>";
    const body = view === "barang"
      ? items.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.nama)}</td><td>${esc(r.part_number)}</td><td>${esc(r.qty)} ${esc(r.satuan)}</td><td>${esc(r.nota)}</td><td style="text-align:right">${rupiah(Number(r.nilai))}</td></tr>`).join("")
      : days.map((r) => `<tr><td>${esc(hariText(String(r.hari)))}</td><td>${esc(r.nota)}</td><td>${esc(r.qty)}</td><td style="text-align:right">${rupiah(Number(r.nilai))}</td></tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>Laporan Barang Terjual</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:5px;text-align:left}</style></head><body><h2>Laporan Barang Terjual</h2><p>Periode: ${esc(periode)} · Sumber: ${esc(source === "Semua" ? "Kasir + Manual" : source)}<br>Total terjual: ${grouped(totalQty)} pcs · Nilai: ${rupiah(totalNilai)}</p><table><thead>${head}</thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`);
    win.document.close();
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
              <button type="button" className="h-11 flex-1 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={cetak} disabled={!items.length}>Cetak</button>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Jenis Barang Terjual</p><p className="font-black">{grouped(items.length)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Total Qty (satuan dasar)</p><p className="num font-black">{grouped(totalQty)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Jumlah Nota</p><p className="num font-black">{grouped(totalNota)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Nilai Penjualan</p><p className="num font-black">{rupiah(totalNilai)}</p></div>
        </div>
      </Panel>

      <Panel>
        <div className="flex gap-2">
          <button type="button" onClick={() => setView("barang")} className={`h-10 rounded-lg px-4 text-sm font-bold ${view === "barang" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>Per Barang</button>
          <button type="button" onClick={() => setView("hari")} className={`h-10 rounded-lg px-4 text-sm font-bold ${view === "hari" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>Per Hari</button>
          {loading ? <span className="self-center text-xs text-muted">Memuat...</span> : null}
        </div>
        <div className="mt-3 max-h-[65vh] overflow-auto rounded-lg border border-line">
          {view === "barang" ? (
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
