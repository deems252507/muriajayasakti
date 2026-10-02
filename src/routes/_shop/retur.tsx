import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Panel } from "@/components/shop/shell";
import { getInvoice, listMasters, listShifts, returNota, searchProducts, shiftLedger } from "@/lib/shop/api";
import { rupiah, when } from "@/lib/shop/format";
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
          <form className="mt-3 flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            setFound(false);
            void getInvoice({ data: { nomor } }).then((res) => {
              if (!res || (res.invoice as { source: string }).source !== "Kasir") {
                toast.error("Invoice belum dicari atau tidak ditemukan.");
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
            });
          }}>
            <input className={inputClass} placeholder="Nomor invoice, contoh INV.123456" value={nomor} onChange={(e) => setNomor(e.target.value)} />
            <button className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Cari</button>
          </form>
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
          ) : nomor ? <p className="mt-4 py-8 text-center text-sm text-muted">Invoice belum dicari atau tidak ditemukan.</p> : null}
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
                  const info = result as { id: string };
                  toast.success(`${info.id} tersimpan`);
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
        <h3 className="font-extrabold">Histori Retur Terbaru</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">No Retur</th><th>Invoice Asal</th><th>Tanggal</th><th>Pelanggan</th><th className="text-right">Selisih</th></tr></thead>
            <tbody>
              {history.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-muted">Belum ada retur barang.</td></tr> : null}
              {history.slice(0, 12).map((row) => (
                <tr key={String(row.id)} className="border-t border-line">
                  <td className="py-2">{String(row.id)}</td>
                  <td>{String(row.parent_invoice)}</td>
                  <td>{when(String(row.tanggal))}</td>
                  <td>{String(row.pelanggan)}</td>
                  <td className="num text-right">{rupiah(Number(row.net_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
