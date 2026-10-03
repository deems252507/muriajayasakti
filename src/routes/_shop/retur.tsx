import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Panel } from "@/components/shop/shell";
import { deleteRetur, getInvoice, listInvoices, listMasters, listShifts, returNota, searchProducts, shiftLedger } from "@/lib/shop/api";
import { PeriodPicker } from "@/components/shop/period";
import { rupiah, when } from "@/lib/shop/format";
import { printReturSlip, shopBrand } from "@/lib/shop/print";
import type { Bank, Product, Shift } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/retur")({ component: ReturPage });

type Line = {
  id: number;
  nama: string;
  jumlah: number;
  returned_qty: number;
  satuan: string;
  harga_satuan: number;
  qty: number;
  tanggal: string;
};

function ReturPage() {
  const me = Route.useRouteContext().me;
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftId, setShiftId] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [nomor, setNomor] = useState("");
  const [searchMode, setSearchMode] = useState<"invoice" | "transaksi">("invoice");
  const [transactionQuery, setTransactionQuery] = useState("");
  const [transactionStart, setTransactionStart] = useState("");
  const [transactionEnd, setTransactionEnd] = useState("");
  const [transactionHits, setTransactionHits] = useState<Array<Record<string, unknown>>>([]);
  const [searchingTransactions, setSearchingTransactions] = useState(false);
  const [customer, setCustomer] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [found, setFound] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [exchange, setExchange] = useState<Array<{ product: Product; qty: number; isAlt: boolean }>>([]);
  const [metode, setMetode] = useState("Tunai");
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function loadHistory() {
    void shiftLedger({ data: {} }).then((res) => setHistory((res?.returs as Array<Record<string, unknown>>) ?? []));
  }

  useEffect(() => {
    void listShifts().then((res) => {
      const active = res.shifts.filter((s) => s.status === "AKTIF" && (me.role !== "Kasir" || s.username === me.username));
      setShifts(active);
      if (active[0]) setShiftId(active[0].id);
    });
    void listMasters().then((res) => setBanks(res.banks.filter((b) => b.aktif)));
    loadHistory();
  }, [me.role, me.username]);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const timer = setTimeout(() => {
      void searchProducts({ data: { q } }).then((res) => setHits(res.items));
    }, 160);
    return () => clearTimeout(timer);
  }, [q]);

  const returValue = lines.reduce((sum, line) => sum + line.harga_satuan * line.qty, 0);
  const exchangeValue = exchange.reduce((sum, line) => {
    const harga = line.isAlt ? line.product.hargaJualAlt : line.product.hargaJual;
    return sum + harga * line.qty;
  }, 0);
  const net = returValue - exchangeValue;
  const shown = history.filter((row) => {
    const day = String(row.tanggal || "").slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });

  if (me.role === "Owner") return <Panel><p>Halaman ini untuk operasional Admin/Kasir. Akun Owner hanya melihat laporan.</p></Panel>;
  return (
    <Panel>
      <h2 className="text-lg font-extrabold">Proses Retur / Tukar Barang</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <Field label="Shift">
            <select className={inputClass} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              {shifts.length === 0 ? <option value="">Tidak ada shift aktif</option> : null}
              {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.shift} · {shift.cashierName}</option>)}
            </select>
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`rounded-lg px-3 py-2 text-xs font-bold ${searchMode === "invoice" ? "bg-accent text-white" : "border border-line bg-white"}`} onClick={() => setSearchMode("invoice")}>Ada Invoice</button>
            <button type="button" className={`rounded-lg px-3 py-2 text-xs font-bold ${searchMode === "transaksi" ? "bg-accent text-white" : "border border-line bg-white"}`} onClick={() => setSearchMode("transaksi")}>Tidak Bawa Invoice</button>
          </div>
          {searchMode === "invoice" ? (
            <form className="mt-3 flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              setFound(false);
              void getInvoice({ data: { nomor } }).then((res) => {
                if (!res || (res.invoice as { source: string }).source !== "Kasir") {
                  toast.error("Invoice kasir tidak ditemukan.");
                  setLines([]);
                  setCustomer("");
                  return;
                }
                const inv = res.invoice as { tujuan: string; tanggal: string };
                setCustomer(inv.tujuan);
                setTanggal(inv.tanggal);
                setFound(true);
                setLines((res.lines as Array<Record<string, unknown>>).map((line) => ({
                  id: Number(line.id),
                  nama: String(line.custom_item || line.product_nama || "Barang"),
                  jumlah: Number(line.jumlah),
                  returned_qty: Number(line.returned_qty ?? 0),
                  satuan: String(line.satuan),
                  harga_satuan: Number(line.harga_satuan),
                  qty: 0,
                  tanggal: inv.tanggal,
                })));
              }).catch((error: Error) => toast.error(error.message));
            }}>
              <input className={inputClass} placeholder="Nomor invoice, contoh INV.123456" value={nomor} onChange={(e) => setNomor(e.target.value)} />
              <button className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Cari</button>
            </form>
          ) : (
            <div className="mt-3 rounded-xl border border-line bg-white p-3">
              <p className="text-xs text-muted">Cari transaksi penjualan tanpa harus mengetahui nomor invoice. Gunakan tanggal dan kata kunci barang, pelanggan, kasir, atau nominal.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className={inputClass} type="date" value={transactionStart} onChange={(e) => setTransactionStart(e.target.value)} aria-label="Tanggal mulai" />
                <input className={inputClass} type="date" value={transactionEnd} onChange={(e) => setTransactionEnd(e.target.value)} aria-label="Tanggal akhir" />
              </div>
              <form className="mt-2 flex gap-2" onSubmit={(event) => {
                event.preventDefault();
                setSearchingTransactions(true);
                void listInvoices({ data: { q: transactionQuery, source: "Kasir", start: transactionStart, end: transactionEnd, all: true } })
                  .then((res) => setTransactionHits((res?.items as Array<Record<string, unknown>>) ?? []))
                  .catch((error: Error) => toast.error(error.message))
                  .finally(() => setSearchingTransactions(false));
              }}>
                <input className={inputClass} placeholder="Cari barang / pelanggan / kasir / nomor invoice" value={transactionQuery} onChange={(e) => setTransactionQuery(e.target.value)} />
                <button className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">{searchingTransactions ? "..." : "Cari"}</button>
              </form>
              {transactionHits.length > 0 ? (
                <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-line">
                  {transactionHits.map((row) => (
                    <button key={String(row.nomor)} type="button" className="block w-full border-b border-line px-3 py-3 text-left last:border-b-0 hover:bg-slate-50" onClick={() => {
                      const selected = String(row.nomor ?? "");
                      setNomor(selected);
                      setSearchMode("invoice");
                      setTransactionHits([]);
                      void getInvoice({ data: { nomor: selected } }).then((res) => {
                        if (!res || (res.invoice as { source: string }).source !== "Kasir") return;
                        const inv = res.invoice as { tujuan: string; tanggal: string };
                        setCustomer(inv.tujuan);
                        setTanggal(inv.tanggal);
                        setFound(true);
                        setLines((res.lines as Array<Record<string, unknown>>).map((line) => ({
                          id: Number(line.id),
                          nama: String(line.custom_item || line.product_nama || "Barang"),
                          jumlah: Number(line.jumlah),
                          returned_qty: Number(line.returned_qty ?? 0),
                          satuan: String(line.satuan),
                          harga_satuan: Number(line.harga_satuan),
                          qty: 0,
                          tanggal: inv.tanggal,
                        })));
                      }).catch((error: Error) => toast.error(error.message));
                    }}>
                      <span className="font-bold">{String(row.nomor ?? "-")}</span>
                      <span className="mt-1 block text-xs text-muted">{when(String(row.tanggal ?? ""))} · {String(row.tujuan || "Pelanggan umum")} · Kasir: {String(row.kasir || "-")}</span>
                      <span className="mt-1 block text-xs">Total: {rupiah(Number(row.total ?? 0))}</span>
                    </button>
                  ))}
                </div>
              ) : transactionQuery || transactionStart || transactionEnd ? (
                <p className="mt-3 text-center text-xs text-muted">Belum ada transaksi Kasir yang cocok. Perlebar tanggal atau ubah kata kunci.</p>
              ) : null}
            </div>
          )}
          {found ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm">Pelanggan: <b>{customer}</b></p>
              <p className="text-xs text-muted">Tanggal: {when(tanggal)}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Nama Barang</th><th>Qty Beli</th><th>Qty Retur</th><th className="text-right">Refund</th></tr></thead>
                  <tbody>
                    {lines.map((line) => {
                      const sisa = line.jumlah - line.returned_qty;
                      return (
                        <tr key={line.id} className="border-t border-line">
                          <td className="py-2">{line.nama}</td>
                          <td>{line.jumlah} {line.satuan}</td>
                          <td>
                            <input className="num h-10 w-16 rounded-lg border border-line text-center" value={line.qty} onChange={(e) => {
                              const qty = Math.min(sisa, Math.max(0, Number(e.target.value) || 0));
                              setLines((prev) => prev.map((item) => item.id === line.id ? { ...item, qty } : item));
                            }} />
                            <span className="ml-1 text-[10px] text-muted">sisa {sisa}</span>
                          </td>
                          <td className="num text-right">{rupiah(line.harga_satuan * line.qty)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : searchMode === "invoice" && nomor ? <p className="mt-4 py-8 text-center text-sm text-muted">Invoice belum dicari atau tidak ditemukan.</p> : null}
        </div>
        <div>
          <h3 className="font-semibold">Tukar Dengan Barang (Opsional)</h3>
          <input className={`${inputClass} mt-3`} placeholder="Cari barang pengganti" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.length > 0 ? (
            <ul className="mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              {hits.map((item) => (
                <li key={item.id}>
                  <button className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50" onClick={() => { setExchange((prev) => [...prev, { product: item, qty: 1, isAlt: false }]); setQ(""); setHits([]); }}>
                    <span className="font-medium">{item.nama}</span>
                    <span className="block text-[10px] text-muted">PN: {item.partNumber || "-"}{item.partNumbersAlt ? ` · PN Alt: ${item.partNumbersAlt}` : ""}{item.merek ? ` · Merek: ${item.merek}` : ""} · Stok: {item.stok}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-3 divide-y divide-line">
            {exchange.map((line, index) => (
              <li key={`${line.product.id}-${index}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 py-2 text-sm">
                <span>{line.product.nama}</span>
                <span className="text-xs">{line.isAlt ? line.product.satuanAlt : line.product.satuan}</span>
                {line.product.satuanAlt ? <button className="text-xs font-bold text-accent" onClick={() => setExchange((prev) => prev.map((item, i) => i === index ? { ...item, isAlt: !item.isAlt } : item))}>Satuan</button> : <span />}
                <input className="num h-10 w-14 rounded-lg border border-line text-center" value={line.qty} onChange={(e) => {
                  const qty = Math.max(1, Number(e.target.value) || 1);
                  setExchange((prev) => prev.map((item, i) => i === index ? { ...item, qty } : item));
                }} />
                <button className="text-xs text-danger" onClick={() => setExchange((prev) => prev.filter((_, i) => i !== index))}>Hapus</button>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Nilai retur</dt><dd className="num">{rupiah(returValue)}</dd></div>
            <div className="flex justify-between"><dt>Nilai tukar</dt><dd className="num">{rupiah(exchangeValue)}</dd></div>
          </dl>
          {net !== 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold">Metode Pembayaran Selisih</p>
              <p className="mb-2 text-[11px] text-muted">Dipakai untuk pembayaran tambahan atau refund pada retur/tukar ini.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select className={inputClass} value={metode} onChange={(e) => setMetode(e.target.value)}>
                  <option value="Tunai">Cash / Tunai</option>
                  <option value="Transfer">Transfer / TF</option>
                </select>
                {metode === "Transfer" ? (
                  <select className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="">Pilih Bank / Rekening</option>
                    {banks.map((item) => <option key={item.id} value={item.nama}>{item.nama}</option>)}
                  </select>
                ) : null}
              </div>
              <p className={`mt-3 text-sm font-bold ${net > 0 ? "text-emerald-700" : "text-red-600"}`}>
                Selisih Pembayaran: {rupiah(Math.abs(net))} {net > 0 ? "(Refund)" : "(Tambahan)"}
              </p>
            </div>
          ) : null}
          <button
            className="mt-4 w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-40"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void returNota({
                data: {
                  invoice: nomor,
                  shiftId,
                  metode,
                  bank,
                  returns: lines.filter((line) => line.qty > 0).map((line) => ({ lineId: line.id, qty: line.qty })),
                  exchange: exchange.map((line) => ({ productId: line.product.id, qty: line.qty, isAlt: line.isAlt })),
                },
              })
                .then((result) => {
                  const info = result as Record<string, unknown>;
                  toast.success(`${me.role} · Retur ${String(info.id)} tersimpan`);
                  try { printReturSlip(info); } catch (error) { toast.error(error instanceof Error ? error.message : "Nota retur gagal dicetak"); }
                  setLines([]);
                  setExchange([]);
                  setCustomer("");
                  setFound(false);
                  loadHistory();
                })
                .catch((error: Error) => toast.error(error.message))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Menyimpan Retur..." : "Proses Retur/Tukar & Cetak"}
          </button>
        </div>
      </div>
      <div className="mt-8">
        <h3 className="font-extrabold">Histori Retur</h3>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <PeriodPicker start={from} end={to} onChange={(nextStart, nextEnd) => { setFrom(nextStart); setTo(nextEnd); }} />
          <button className="h-11 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => printReturList(shown, from, to)}>Cetak PDF</button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">No Retur</th><th>Invoice Asal</th><th>Tanggal</th><th>Pelanggan</th><th className="text-right">Selisih</th><th></th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-muted">Tidak ada retur pada periode ini.</td></tr> : null}
              {shown.map((row) => (
                <tr key={String(row.id)} className="border-t border-line">
                  <td className="py-2">{String(row.id)}</td>
                  <td>{String(row.parent_invoice)}</td>
                  <td>{when(String(row.tanggal))}</td>
                  <td>{String(row.pelanggan)}</td>
                  <td className="num text-right">{rupiah(Number(row.net_amount))}</td>
                  <td className="text-right">
                    <button className="text-xs font-bold text-accent" onClick={() => {
                      try { printReturSlip(row); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
                    }}>Cetak</button>
                    {me.role !== "Kasir" ? (
                      <button className="ml-3 text-xs font-bold text-danger" onClick={() => {
                        if (!confirm(`Hapus nota retur ${String(row.id)}? Stok dan uang laci dikembalikan.`)) return;
                        void deleteRetur({ data: { id: String(row.id) } })
                          .then(() => { toast.success("Retur dihapus. Stok dan kas dikembalikan."); loadHistory(); })
                          .catch((error: Error) => toast.error(error.message));
                      }}>Hapus</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function printReturList(rows: Array<Record<string, unknown>>, start: string, end: string) {
  if (!rows.length) {
    toast.error("Tidak ada retur pada periode ini.");
    return;
  }
  const body = rows.map((row) => `<tr><td>${row.id}</td><td>${row.parent_invoice || "-"}</td><td>${when(String(row.tanggal || ""))}</td><td>${row.pelanggan || "-"}</td><td style="text-align:right">${rupiah(Number(row.net_amount || 0))}</td></tr>`).join("");
  const win = window.open("", "_blank", "width=800,height=700");
  if (!win) {
    toast.error("Izinkan popup untuk mencetak.");
    return;
  }
  win.document.write(`<!doctype html><html><head><title>Laporan Retur</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:6px;text-align:left}</style></head><body><h2>${shopBrand().nama}</h2><p>${shopBrand().alamat} ${shopBrand().telepon}</p><p>Laporan Retur ${start || "awal"} s/d ${end || "sekarang"}</p><table><thead><tr><th>No Retur</th><th>Invoice</th><th>Tanggal</th><th>Pelanggan</th><th>Selisih</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`);
  win.document.close();
}
