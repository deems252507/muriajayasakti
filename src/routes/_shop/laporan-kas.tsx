import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { inputClass, Panel } from "@/components/shop/shell";
import { shiftLedger } from "@/lib/shop/api";
import { rupiah, todayInput, when } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/laporan-kas")({ component: LaporanKasPage });

function LaporanKasPage() {
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState(todayInput());
  const [data, setData] = useState<Awaited<ReturnType<typeof shiftLedger>> | null>(null);
  useEffect(() => {
    void shiftLedger({ data: { start, end } }).then(setData);
  }, [start, end]);
  const invoices = (data?.invoices ?? []) as Array<Record<string, unknown>>;
  const moves = (data?.moves ?? []) as Array<Record<string, unknown>>;
  const returs = (data?.returs ?? []) as Array<Record<string, unknown>>;
  const tunai = invoices.filter((i) => i.status_bayar === "Lunas" && i.metode_bayar === "Tunai").reduce((s, i) => s + Number(i.total), 0);
  const transfer = invoices.filter((i) => i.status_bayar === "Lunas" && (i.metode_bayar === "Transfer" || i.metode_bayar === "Split")).reduce((s, i) => s + (i.metode_bayar === "Split" ? Number(i.transfer_amount) : Number(i.total)), 0);
  const bon = invoices.filter((i) => i.status_bayar === "Bon").reduce((s, i) => s + Number(i.total), 0);
  const masuk = moves.filter((m) => m.jenis === "MASUK").reduce((s, m) => s + Number(m.jumlah), 0);
  const keluar = moves.filter((m) => m.jenis === "KELUAR").reduce((s, m) => s + Number(m.jumlah), 0);
  const refundCash = returs.filter((r) => r.payment_direction === "REFUND" && r.metode_bayar !== "Transfer").reduce((s, r) => s + Number(r.cash_amount), 0);
  const refundTf = returs.filter((r) => r.payment_direction === "REFUND" && r.metode_bayar === "Transfer").reduce((s, r) => s + Number(r.transfer_amount), 0);
  const laci = invoices.filter((i) => i.status_bayar === "Lunas" && (i.metode_bayar === "Tunai" || i.metode_bayar === "Split")).reduce((s, i) => s + Number(i.bayar_tunai) - Number(i.kembalian), 0) + masuk - keluar - refundCash;
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">Dari<input className={`${inputClass} mt-1`} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <span className="pb-3 text-sm text-muted">s/d</span>
          <label className="text-xs text-muted">Sampai<input className={`${inputClass} mt-1`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          <button className="mb-0.5 h-11 rounded-lg border border-line px-3 text-sm" onClick={() => { const t = todayInput(); setStart(t); setEnd(t); }}>Reset Filter</button>
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Penjualan Cash (Gross)" hint="Sebelum retur" value={rupiah(tunai)} />
        <Kpi title="Penjualan TF" hint="Masuk bank" value={rupiah(transfer)} />
        <Kpi title="Bon / Piutang" hint="Belum dibayar" value={rupiah(bon)} />
        <Kpi title="Uang Masuk Laci" hint="Tunai + tambahan" value={rupiah(masuk + tunai)} />
        <Kpi title="Uang Keluar Laci" hint="Pengeluaran + refund cash" value={rupiah(keluar + refundCash)} />
        <Kpi title="Transfer Bersih" hint="Setelah refund TF" value={rupiah(Math.max(0, transfer - refundTf))} />
        <Kpi title="Pergerakan Laci" hint="Masuk − keluar" value={rupiah(laci)} />
        <Kpi title="Total Penjualan" hint="Cash + TF + Bon" value={rupiah(tunai + transfer + bon)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Kpi title="Refund Cash" hint="Mengurangi laci" value={rupiah(refundCash)} />
        <Kpi title="Refund Transfer" hint="Mengurangi bank, bukan laci" value={rupiah(refundTf)} />
      </div>
      <Panel className="overflow-x-auto">
        <h3 className="font-extrabold">Buku Keuangan Harian — Detail Semua Transaksi</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Waktu / Ref</th><th>Jenis</th><th>Kasir</th><th>Metode / Bank</th><th className="text-right">Nominal</th></tr></thead>
          <tbody>
            {invoices.length === 0 ? <tr><td colSpan={5} className="py-4 text-center text-muted">Tidak ada transaksi keuangan pada periode ini.</td></tr> : null}
            {invoices.map((inv) => (
              <tr key={String(inv.nomor)} className="border-t border-line">
                <td className="py-2">{when(String(inv.tanggal))}<div className="text-xs text-muted">{String(inv.nomor)}</div></td>
                <td>{String(inv.status_bayar) === "Bon" ? "Bon" : "Penjualan"}</td>
                <td>{String(inv.kasir || "-")}</td>
                <td>{String(inv.metode_bayar)}{inv.bank_transfer ? <span className="block text-indigo-600">{String(inv.bank_transfer)}</span> : null}</td>
                <td className="num text-right">{rupiah(Number(inv.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="font-extrabold">Rincian Pengeluaran & Tambahan Kas</h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Waktu</th><th>Keterangan</th><th className="text-right">Jumlah</th></tr></thead>
            <tbody>
              {moves.length === 0 ? <tr><td colSpan={3} className="py-4 text-center text-muted">Tidak ada arus kas keluar/masuk.</td></tr> : null}
              {moves.map((move) => (
                <tr key={String(move.id)} className="border-t border-line">
                  <td className="py-2 text-xs">{when(String(move.tanggal))}</td>
                  <td>{String(move.keterangan)}</td>
                  <td className={`num text-right ${move.jenis === "KELUAR" ? "text-rose-600" : "text-emerald-700"}`}>{move.jenis === "KELUAR" ? "-" : "+"}{rupiah(Number(move.jumlah))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs">Pengeluaran: <b>{rupiah(keluar)}</b> · Tambahan Modal: <b>{rupiah(masuk)}</b></p>
        </Panel>
        <Panel>
          <h3 className="font-extrabold">Rincian Pemasukan Kas (Penjualan)</h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Invoice</th><th>Bayar</th><th className="text-right">Kembalian</th></tr></thead>
            <tbody>
              {invoices.filter((i) => i.metode_bayar === "Tunai" || i.metode_bayar === "Split").length === 0 ? <tr><td colSpan={3} className="py-4 text-center text-muted">Tidak ada transaksi tunai.</td></tr> : null}
              {invoices.filter((i) => i.metode_bayar === "Tunai" || i.metode_bayar === "Split").map((inv) => (
                <tr key={String(inv.nomor)} className="border-t border-line">
                  <td className="py-2">{String(inv.nomor)}</td>
                  <td className="num">{rupiah(Number(inv.bayar_tunai))}</td>
                  <td className="num text-right">{rupiah(Number(inv.kembalian))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      <Panel>
        <h3 className="font-extrabold">Rincian Penjualan Transfer / QRIS</h3>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Invoice</th><th>Metode</th><th>Bank / Rekening</th><th className="text-right">Nominal</th></tr></thead>
          <tbody>
            {invoices.filter((i) => i.metode_bayar === "Transfer" || i.metode_bayar === "Split").length === 0 ? <tr><td colSpan={4} className="py-4 text-center text-muted">Tidak ada transaksi transfer/QRIS.</td></tr> : null}
            {invoices.filter((i) => i.metode_bayar === "Transfer" || i.metode_bayar === "Split").map((inv) => (
              <tr key={String(inv.nomor)} className="border-t border-line">
                <td className="py-2">{String(inv.nomor)}</td>
                <td>{String(inv.metode_bayar)}</td>
                <td>{String(inv.bank_transfer || "-")}</td>
                <td className="num text-right">{rupiah(inv.metode_bayar === "Split" ? Number(inv.transfer_amount) : Number(inv.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Kpi({ title, hint, value }: { title: string; hint: string; value: string }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{title}</p>
      <p className="num mt-2 text-xl font-black">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </section>
  );
}
