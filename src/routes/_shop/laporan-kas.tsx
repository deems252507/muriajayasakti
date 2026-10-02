import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PeriodPicker } from "@/components/shop/period";
import { Panel } from "@/components/shop/shell";
import { getInvoice, shiftLedger } from "@/lib/shop/api";
import { rupiah, todayInput, when } from "@/lib/shop/format";
import { printCashDaily, printReturSlip, printStoredSale } from "@/lib/shop/print";

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
  const cashNet = invoices.filter((i) => i.status_bayar === "Lunas" && (i.metode_bayar === "Tunai" || i.metode_bayar === "Split")).reduce((s, i) => s + Number(i.bayar_tunai) - Number(i.kembalian), 0);
  const refundCash = returs.filter((r) => r.payment_direction === "REFUND" && r.metode_bayar !== "Transfer").reduce((s, r) => s + Number(r.cash_amount), 0);
  const refundTf = returs.filter((r) => r.payment_direction === "REFUND" && r.metode_bayar === "Transfer").reduce((s, r) => s + Number(r.transfer_amount), 0);
  const tambahCash = returs.filter((r) => r.payment_direction === "ADDITIONAL_PAYMENT" && r.metode_bayar !== "Transfer").reduce((s, r) => s + Number(r.cash_amount), 0);
  const tambahTf = returs.filter((r) => r.payment_direction === "ADDITIONAL_PAYMENT" && r.metode_bayar === "Transfer").reduce((s, r) => s + Number(r.transfer_amount), 0);
  const penjualan = invoices.reduce((s, i) => s + Number(i.total), 0);
  const uangMasuk = cashNet + masuk + tambahCash;
  const laci = uangMasuk - keluar - refundCash;
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-2">
          <PeriodPicker start={start} end={end} onChange={(nextStart, nextEnd) => { setStart(nextStart); setEnd(nextEnd); }} />
          <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => { const t = todayInput(); setStart(t); setEnd(t); }}>Hari ini saja</button>
          <button className="h-11 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={() => printCashDaily({ start, end, tunai, transfer, bon, masuk, keluar, refundCash, refundTf, tambahCash, tambahTf, laci, invoices, moves, returs })}>Cetak PDF</button>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-extrabold">Hasil transaksi</h2>
        <p className="mt-1 text-sm text-muted">
          Penjualan {rupiah(penjualan)}. Uang masuk laci {rupiah(uangMasuk)}, keluar {rupiah(keluar + refundCash)}, jadi laci {laci < 0 ? "berkurang" : "bertambah"} {rupiah(Math.abs(laci))}. Transfer di bank {rupiah(transfer - refundTf + tambahTf)}. Bon yang belum dibayar {rupiah(bon)}.
        </p>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Total penjualan" hint="Semua nota kasir pada periode ini" value={rupiah(penjualan)} />
        <Kpi title="Uang masuk laci" hint="Tunai, tambah kas, dan tambah bayar tunai" value={rupiah(uangMasuk)} />
        <Kpi title="Uang keluar laci" hint="Kas keluar dan retur tunai" value={rupiah(keluar + refundCash)} />
        <Kpi title="Sisa pergerakan laci" hint="Masuk dikurangi keluar. Bukan saldo kas awal." value={rupiah(laci)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi title="Tunai" hint="Nilai nota tunai, sebelum kembalian" value={rupiah(tunai)} />
        <Kpi title="Transfer / bank" hint="Sudah dikurangi refund transfer" value={rupiah(transfer - refundTf + tambahTf)} />
        <Kpi title="Bon belum dibayar" hint="Belum masuk laci" value={rupiah(bon)} />
      </div>
      <Panel>
        <h3 className="font-extrabold">Uang ini untuk apa</h3>
        <p className="mt-1 text-xs text-muted">Tambah kas dan pengeluaran ditulis sesuai keterangannya, bukan hanya angkanya. Contoh: beli makan, tambahan dari owner.</p>
        {moves.length === 0 ? <p className="mt-3 text-sm text-muted">Tidak ada tambah kas atau pengeluaran pada periode ini.</p> : (
          <ul className="mt-3 divide-y divide-slate-300">
            {moves.map((move) => {
              const keluarBaris = move.jenis === "KELUAR";
              return (
                <li key={String(move.id)} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">{String(move.keterangan || "-")}</p>
                    <p className="text-xs text-muted">{keluarBaris ? "Keluar dari laci" : "Masuk ke laci"} · {String(move.kasir || "-")} · {when(String(move.tanggal))}</p>
                  </div>
                  <p className={`num font-black ${keluarBaris ? "text-rose-600" : "text-emerald-700"}`}>{keluarBaris ? "-" : "+"}{rupiah(Number(move.jumlah))}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel className="overflow-x-auto">
        <h3 className="font-extrabold">Buku Keuangan Harian — Detail Semua Transaksi</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Waktu / Ref</th><th>Jenis</th><th>Kasir</th><th>Metode / Bank</th><th className="text-right">Laci</th><th className="text-right">Transfer</th><th className="text-right">Bon</th></tr></thead>
          <tbody>
            {invoices.length === 0 && moves.length === 0 && returs.length === 0 ? <tr><td colSpan={7} className="py-4 text-center text-muted">Tidak ada transaksi keuangan pada periode ini.</td></tr> : null}
            {invoices.map((inv) => {
              const laci = inv.status_bayar === "Lunas" && (inv.metode_bayar === "Tunai" || inv.metode_bayar === "Split") ? Number(inv.bayar_tunai) - Number(inv.kembalian) : 0;
              const tf = inv.status_bayar !== "Lunas" ? 0 : inv.metode_bayar === "Transfer" ? Number(inv.total) : inv.metode_bayar === "Split" ? Number(inv.transfer_amount) : 0;
              const hutang = inv.status_bayar === "Bon" ? Number(inv.total) : 0;
              const jenis = String(inv.keterangan) === "Bon (Lunas)" ? "Bon lunas" : String(inv.status_bayar) === "Bon" ? "Bon" : "Penjualan";
              return (
              <tr key={String(inv.nomor)} className="border-t border-line">
                <td className="py-2">{when(String(inv.tanggal))}<div><button className="text-xs font-bold text-accent" onClick={() => {
                  void getInvoice({ data: { nomor: String(inv.nomor) } }).then((res) => {
                    if (!res) return toast.error("Nota tidak ditemukan");
                    printStoredSale(res.invoice as Record<string, unknown>, res.lines as Array<Record<string, unknown>>);
                  }).catch((error: Error) => toast.error(error.message));
                }}>{String(inv.nomor)}</button></div></td>
                <td>{jenis}<div className="text-[11px] text-muted">{String(inv.tujuan || "Umum")} · {String(inv.keterangan || "-")}</div></td>
                <td>{String(inv.kasir || "-")}</td>
                <td>{String(inv.metode_bayar)}{inv.bank_transfer ? <span className="block text-indigo-600">{String(inv.bank_transfer)}</span> : null}</td>
                <td className="num text-right">{rupiah(laci)}</td>
                <td className="num text-right">{rupiah(tf)}</td>
                <td className="num text-right">{rupiah(hutang)}</td>
              </tr>
              );
            })}
            {returs.map((row) => {
              const tunaiRetur = row.metode_bayar !== "Transfer";
              const nilai = tunaiRetur ? Number(row.cash_amount) : Number(row.transfer_amount);
              const laciRetur = !tunaiRetur ? 0 : row.payment_direction === "REFUND" ? -nilai : row.payment_direction === "ADDITIONAL_PAYMENT" ? nilai : 0;
              const tfRetur = tunaiRetur ? 0 : row.payment_direction === "REFUND" ? -nilai : row.payment_direction === "ADDITIONAL_PAYMENT" ? nilai : 0;
              const jenis = row.payment_direction === "REFUND" ? "Refund retur" : row.payment_direction === "ADDITIONAL_PAYMENT" ? "Tambah bayar" : "Tukar impas";
              return (
                <tr key={String(row.id)} className="border-t border-line">
                  <td className="py-2">{when(String(row.tanggal))}<div><button className="text-xs font-bold text-accent" onClick={() => { try { printReturSlip(row); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); } }}>{String(row.id)}</button></div></td>
                  <td>{jenis}<div className="text-[11px] text-muted">{String(row.pelanggan || "Umum")}{row.parent_invoice ? ` · nota ${String(row.parent_invoice)}` : ""}</div></td>
                  <td>{String(row.kasir || "-")}</td>
                  <td>{String(row.metode_bayar)}{row.bank_transfer ? <span className="block text-indigo-600">{String(row.bank_transfer)}</span> : null}</td>
                  <td className="num text-right">{rupiah(laciRetur)}</td>
                  <td className="num text-right">{rupiah(tfRetur)}</td>
                  <td className="num text-right">{rupiah(0)}</td>
                </tr>
              );
            })}
            {moves.map((move) => {
              const masuk = move.jenis !== "KELUAR";
              return (
                <tr key={String(move.id)} className="border-t border-line">
                  <td className="py-2 text-xs">{when(String(move.tanggal))}</td>
                  <td>{masuk ? "Tambah kas" : "Kas keluar"}<div className="text-[11px] text-muted">{String(move.keterangan || "-")}</div></td>
                  <td>{String(move.kasir || "-")}</td>
                  <td>Tunai</td>
                  <td className={`num text-right ${masuk ? "text-emerald-700" : "text-rose-600"}`}>{masuk ? "" : "-"}{rupiah(Number(move.jumlah))}</td>
                  <td className="num text-right">{rupiah(0)}</td>
                  <td className="num text-right">{rupiah(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="font-extrabold">Daftar yang sama, dalam tabel</h3>
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
