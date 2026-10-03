import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass, Panel } from "@/components/shop/shell";
import { editManual, editSale, findRetur, getInvoice, listHistoryLines, listInvoices, listMasters, removeInvoice, searchProducts } from "@/lib/shop/api";
import { PeriodPicker } from "@/components/shop/period";
import { digits, grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import { printHistoryReport, printReturSlip, printStoredManual, printStoredSale } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/riwayat")({ component: RiwayatPage });

function RiwayatPage() {
  const me = Route.useRouteContext().me;
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [jenis, setJenis] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: Array<Record<string, unknown>> } | null>(null);
  const [open, setOpen] = useState("");
  const [detail, setDetail] = useState<{ invoice: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null>(null);
  const [manual, setManual] = useState<{ nomor: string; tujuan: string; keterangan: string; lines: Array<{ id: number; nama: string; qty: number; jenis: string; satuan: string; productId: number | null; isAlt: boolean }> } | null>(null);
  const [ganti, setGanti] = useState<{ index: number; q: string; items: Product[] } | null>(null);
  const [banks, setBanks] = useState<string[]>([]);
  const [sale, setSale] = useState<{
    nomor: string;
    tujuan: string;
    diskon: string;
    metode: string;
    bank: string;
    bayar: string;
    lines: Array<{ id: number; nama: string; qty: number; harga: string; satuan: string }>;
    drop: number[];
    add: Array<{ productId: number; nama: string; qty: number; harga: string; isAlt: boolean; satuan: string }>;
    q: string;
    hits: Product[];
  } | null>(null);

  function load(next = page) {
    void listInvoices({ data: { q, source, status, jenis, start, end, page: next } })
      .then((res) => setData(res as { total: number; perPage: number; items: Array<Record<string, unknown>> }))
      .catch((error: Error) => toast.error(error.message || "Gagal memuat riwayat."));
  }
  useEffect(() => { load(page); }, [q, source, status, jenis, start, end, page]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 12)));
  const items = data?.items ?? [];
  const tunai = items.filter((i) => i.metode_bayar === "Tunai").reduce((s, i) => s + Number(i.total), 0);
  const transfer = items.filter((i) => i.metode_bayar === "Transfer" || i.metode_bayar === "Split").reduce((s, i) => s + Number(i.total), 0);

  return (
    <Panel>
      <div>
        <h2 className="text-lg font-extrabold">Laporan Riwayat Transaksi</h2>
        <p className="text-xs text-muted">Satu kartu = satu transaksi. Klik Lihat Detail untuk melihat semua barang dalam transaksi.</p>
      </div>
      <div className="mt-3 space-y-2">
        <PeriodPicker start={start} end={end} onChange={(nextStart, nextEnd) => { setPage(1); setStart(nextStart); setEnd(nextEnd); }} />
        <div className="flex flex-wrap gap-2">
        <button className="h-9 rounded-lg border border-line px-3 text-xs font-bold" onClick={() => { setQ(""); setSource(""); setStatus(""); setJenis(""); setStart(""); setEnd(""); setPage(1); }}>Reset</button>
        <button className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => {
          void listHistoryLines({ data: { q, source, status, jenis, start, end } }).then((res) => {
            try { printHistoryReport(res as Array<Record<string, unknown>>, start, end); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
          });
        }}>Cetak PDF</button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-4">
        <input className={inputClass} placeholder="Cari Transaksi" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select className={inputClass} value={jenis} onChange={(e) => { setPage(1); setJenis(e.target.value); }}>
          <option value="">Semua jenis</option>
          <option value="MASUK">Barang Masuk</option>
          <option value="KELUAR">Barang Keluar</option>
        </select>
        <select className={inputClass} value={source} onChange={(e) => { setPage(1); setSource(e.target.value); }}>
          <option value="">Semua sumber</option>
          <option value="Kasir">Kasir / Penjualan</option>
          <option value="Manual">Manual</option>
          <option value="Retur">Retur / Tukar</option>
        </select>
        <select className={inputClass} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Semua status</option>
          <option value="Lunas">Lunas</option>
          <option value="Bon">Bon</option>
        </select>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Total Transaksi</p><p className="font-black">{data?.total ?? 0}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Tunai (halaman ini)</p><p className="num font-black">{rupiah(tunai)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Transfer / QRIS</p><p className="num font-black">{rupiah(transfer)}</p></div>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((inv) => (
          <li key={String(inv.nomor)} className="rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{String(inv.nomor)}</p>
                <p className="text-xs text-muted">{when(String(inv.tanggal))} · {String(inv.source)} · {String(inv.status_bayar)}</p>
                <p className="text-xs text-muted">Kasir: {String(inv.kasir || "-")} · Pelanggan/Supplier: {String(inv.tujuan || "-")}</p>
              </div>
              <div className="text-right">
                <p className="num text-lg font-black">{rupiah(Number(inv.total))}</p>
                <button className="text-xs font-bold text-accent" onClick={() => {
                  const nomor = String(inv.nomor);
                  if (open === nomor) { setOpen(""); return; }
                  setOpen(nomor);
                  void getInvoice({ data: { nomor } }).then((res) => setDetail(res ? { invoice: res.invoice as Record<string, unknown>, lines: res.lines as Array<Record<string, unknown>> } : null));
                }}>Lihat Detail</button>
                <button className="ml-3 text-xs font-bold text-slate-700" onClick={() => {
                  const nomor = String(inv.nomor);
                  void getInvoice({ data: { nomor } }).then(async (res) => {
                    if (!res) return toast.error("Nota tidak ditemukan");
                    const invoice = res.invoice as Record<string, unknown>;
                    const lines = res.lines as Array<Record<string, unknown>>;
                    if (String(inv.source) === "Manual") printStoredManual(invoice, lines);
                    else if (String(inv.source) === "Retur") {
                      const retur = await findRetur({ data: { nomor: String(invoice.nomor) } });
                      if (!retur) return toast.error("Nota retur tidak ditemukan");
                      printReturSlip({ ...(retur as Record<string, unknown>), nomorTukar: invoice.nomor });
                    } else printStoredSale(invoice, lines);
                  }).catch((error: Error) => toast.error(error.message));
                }}>Cetak Nota</button>
              </div>
            </div>
            {open === inv.nomor && detail ? (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <p className="text-xs font-bold">Rincian Barang</p>
                {detail.lines.map((line) => (
                  <div key={String(line.id)} className="mt-2 border-t border-slate-200 pt-2">
                    <p className="font-medium">{String(line.jenis)} · {String(line.custom_item || line.product_nama || "Barang")}</p>
                    <p className="text-[11px] text-muted">PN: {String(line.part_number || "-")}{line.merek ? ` · Merek: ${String(line.merek)}` : ""}{line.kode_pajak ? ` · Kode Pajak: ${String(line.kode_pajak)}` : ""}</p>
                    <p className="text-xs">Qty {String(line.jumlah)} {String(line.satuan)} · Nilai {rupiah(Number(line.harga_satuan) * Number(line.jumlah))}</p>
                  </div>
                ))}
                <p className="mt-2 text-xs">Pembayaran: {String(inv.metode_bayar || "-")} {inv.bank_transfer ? `· ${String(inv.bank_transfer)}` : ""} · Tujuan: {String(inv.tujuan || "-")}</p>
                {String(inv.source) === "Retur" ? <p className="mt-2 text-xs text-muted">Kalau retur salah, hapus dulu. Stok dan uang kembali, lalu proses ulang dari nota asal.</p> : null}
                {me.role === "Admin" && String(inv.source) === "Kasir" && detail ? (
                  <button className="mt-2 mr-3 text-sm font-bold text-accent" onClick={() => {
                    const invoice = detail.invoice;
                    void listMasters().then((res) => setBanks(res.banks.filter((bank) => bank.aktif).map((bank) => bank.nama)));
                    setSale({
                      nomor: String(inv.nomor),
                      tujuan: String(invoice.tujuan || ""),
                      diskon: grouped(Number(invoice.diskon || 0)),
                      metode: String(invoice.metode_bayar || "Tunai"),
                      bank: String(invoice.bank_transfer || ""),
                      bayar: grouped(Number(invoice.bayar_tunai || 0)),
                      lines: detail.lines.map((line) => ({
                        id: Number(line.id),
                        nama: String(line.custom_item || line.product_nama || "Barang"),
                        qty: Number(line.jumlah),
                        harga: grouped(Number(line.harga_satuan || 0)),
                        satuan: String(line.satuan || "Pcs"),
                      })),
                      drop: [],
                      add: [],
                      q: "",
                      hits: [],
                    });
                  }}>Ubah Nota</button>
                ) : null}
                {me.role === "Admin" && String(inv.source) === "Manual" ? (
                  <button className="mt-2 mr-3 text-sm font-bold text-accent" onClick={() => setManual({
                    nomor: String(inv.nomor),
                    tujuan: String(inv.tujuan || ""),
                    keterangan: String(inv.keterangan || ""),
                    lines: detail.lines.map((line) => ({
                      id: Number(line.id),
                      nama: String(line.custom_item || line.product_nama || "Barang"),
                      qty: Number(line.jumlah),
                      jenis: String(line.jenis),
                      satuan: String(line.satuan),
                      productId: line.product_id == null ? null : Number(line.product_id),
                      isAlt: false,
                    })),
                  })}>Ubah Nota</button>
                ) : null}
                {me.role === "Admin" ? (
                  <button className="mt-2 text-sm font-bold text-danger" onClick={() => {
                    if (!confirm(String(inv.source) === "Kasir" ? "Hapus nota ini beserta retur yang terkait? Stok dan uang laci dikembalikan." : "Hapus transaksi ini dan kembalikan stok?")) return;
                    void removeInvoice({ data: { nomor: String(inv.nomor) } }).then(() => { toast.success("Nota dihapus"); setOpen(""); load(); }).catch((error: Error) => toast.error(error.message));
                  }}>Hapus Transaksi</button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? <li className="py-8 text-center text-sm text-muted">Tidak ada transaksi ditemukan. Coba ubah kata pencarian atau filter tanggal.</li> : null}
      </ul>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">Menampilkan {items.length} dari {data?.total ?? 0} transaksi · {todayInput()}</span>
        <div className="flex items-center gap-2">
          <button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
          <span>Hal: {page}/{pages}</span>
          <button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
        </div>
      </div>
      {sale ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            void editSale({
              data: {
                nomor: sale.nomor,
                tujuan: sale.tujuan,
                diskon: digits(sale.diskon),
                metode: sale.metode,
                bank: sale.bank,
                bayarTunai: digits(sale.bayar),
                lines: [
                  ...sale.lines.map((line) => ({ id: line.id, qty: line.qty, harga: digits(line.harga) })),
                  ...sale.drop.map((id) => ({ id, qty: 0, harga: 0 })),
                ],
                add: sale.add.map((line) => ({ productId: line.productId, qty: line.qty, harga: digits(line.harga), isAlt: line.isAlt })),
              },
            }).then(async () => {
              const res = await getInvoice({ data: { nomor: sale.nomor } });
              toast.success("Nota diperbaiki. Struk dicetak ulang.");
              if (res) printStoredSale(res.invoice as Record<string, unknown>, res.lines as Array<Record<string, unknown>>);
              setSale(null);
              setOpen("");
              load();
            }).catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Perbaiki {sale.nomor}</h3>
            <p className="mt-1 text-xs text-muted">Salah barang, jumlah, harga, atau bayar bisa diubah. Stok, laci, dan pajak ikut menyesuaikan.</p>
            <label className="mt-3 block text-sm">Pelanggan
              <input className={`${inputClass} mt-1`} value={sale.tujuan} onChange={(e) => setSale({ ...sale, tujuan: e.target.value })} />
            </label>
            <ul className="mt-3 space-y-2">
              {sale.lines.map((line, index) => (
                <li key={line.id} className="grid grid-cols-[1fr_4rem_7rem_auto] items-center gap-2 text-sm">
                  <span>{line.nama}<span className="block text-[11px] text-muted">{line.satuan}</span></span>
                  <input className={`${inputClass} num`} value={line.qty} onChange={(e) => {
                    const qty = Math.max(1, Number(e.target.value) || 1);
                    setSale({ ...sale, lines: sale.lines.map((row, i) => i === index ? { ...row, qty } : row) });
                  }} />
                  <input className={`${inputClass} num`} value={line.harga} onChange={(e) => {
                    const harga = grouped(digits(e.target.value));
                    setSale({ ...sale, lines: sale.lines.map((row, i) => i === index ? { ...row, harga } : row) });
                  }} />
                  <button type="button" className="text-xs font-bold text-danger" onClick={() => setSale({ ...sale, lines: sale.lines.filter((row) => row.id !== line.id), drop: [...sale.drop, line.id] })}>Hapus</button>
                </li>
              ))}
              {sale.add.map((line, index) => (
                <li key={`${line.productId}-${index}`} className="grid grid-cols-[1fr_4rem_7rem_auto] items-center gap-2 text-sm">
                  <span>{line.nama}<span className="block text-[11px] text-muted">Baru · {line.satuan}</span></span>
                  <input className={`${inputClass} num`} value={line.qty} onChange={(e) => {
                    const qty = Math.max(1, Number(e.target.value) || 1);
                    setSale({ ...sale, add: sale.add.map((row, i) => i === index ? { ...row, qty } : row) });
                  }} />
                  <input className={`${inputClass} num`} value={line.harga} onChange={(e) => {
                    const harga = grouped(digits(e.target.value));
                    setSale({ ...sale, add: sale.add.map((row, i) => i === index ? { ...row, harga } : row) });
                  }} />
                  <button type="button" className="text-xs font-bold text-danger" onClick={() => setSale({ ...sale, add: sale.add.filter((_, i) => i !== index) })}>Hapus</button>
                </li>
              ))}
            </ul>
            <input className={`${inputClass} mt-3`} placeholder="Tambah barang, ketik nama" value={sale.q} onChange={(e) => {
              const q = e.target.value;
              setSale({ ...sale, q, hits: [] });
              if (q.trim().length < 2) return;
              void searchProducts({ data: { q } }).then((res) => setSale((prev) => prev ? { ...prev, q, hits: res.items } : prev));
            }} />
            {sale.hits.length ? (
              <div className="mt-1 max-h-28 overflow-y-auto rounded border border-line">
                {sale.hits.slice(0, 6).map((item) => (
                  <button type="button" key={item.id} className="block w-full px-2 py-1 text-left text-sm hover:bg-blue-50" onClick={() => setSale({
                    ...sale,
                    q: "",
                    hits: [],
                    add: [...sale.add, { productId: item.id, nama: item.nama, qty: 1, harga: grouped(item.hargaJual), isAlt: false, satuan: item.satuan }],
                  })}>{item.nama}</button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm">Diskon
                <input className={`${inputClass} num mt-1`} value={sale.diskon} onChange={(e) => setSale({ ...sale, diskon: grouped(digits(e.target.value)) })} />
              </label>
              <label className="text-sm">Bayar
                <select className={`${inputClass} mt-1`} value={sale.metode} onChange={(e) => setSale({ ...sale, metode: e.target.value })}>
                  <option>Tunai</option>
                  <option>Transfer</option>
                  <option>Split</option>
                  <option>Bon</option>
                </select>
              </label>
              {sale.metode === "Tunai" || sale.metode === "Split" ? (
                <label className="text-sm">Uang diterima
                  <input className={`${inputClass} num mt-1`} value={sale.bayar} onChange={(e) => setSale({ ...sale, bayar: grouped(digits(e.target.value)) })} />
                </label>
              ) : null}
              {sale.metode === "Transfer" || sale.metode === "Split" ? (
                <label className="text-sm">Bank
                  <select className={`${inputClass} mt-1`} value={sale.bank} onChange={(e) => setSale({ ...sale, bank: e.target.value })}>
                    <option value="">Pilih bank</option>
                    {banks.map((nama) => <option key={nama}>{nama}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setSale(null)}>Batal</button>
              <button className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Simpan & Cetak</button>
            </div>
          </form>
        </div>
      ) : null}
      {manual ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form className="w-full max-w-lg rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            void editManual({ data: { nomor: manual.nomor, tujuan: manual.tujuan, keterangan: manual.keterangan, lines: manual.lines.map((line) => ({ id: line.id, qty: line.qty, jenis: line.jenis, productId: line.productId, isAlt: line.isAlt })) } })
              .then(() => { toast.success("Nota manual diubah. Stok ikut disesuaikan."); setManual(null); setOpen(""); load(); })
              .catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Ubah {manual.nomor}</h3>
            <p className="mt-1 text-xs text-muted">Hanya nota manual. Uang kasir tidak berubah. Stok mengikuti barang, jumlah, dan jenis baru.</p>
            <label className="mt-3 block text-sm">Tujuan
              <input className={`${inputClass} mt-1`} value={manual.tujuan} onChange={(e) => setManual({ ...manual, tujuan: e.target.value })} />
            </label>
            <label className="mt-2 block text-sm">Keterangan
              <input className={`${inputClass} mt-1`} value={manual.keterangan} onChange={(e) => setManual({ ...manual, keterangan: e.target.value })} />
            </label>
            <ul className="mt-3 space-y-2">
              {manual.lines.map((line, index) => (
                <li key={line.id} className="rounded-lg border border-line p-2 text-sm">
                  <div className="grid grid-cols-[1fr_5rem_7rem] items-center gap-2">
                    <span>{line.nama}</span>
                    <input className={`${inputClass} num`} value={line.qty} onChange={(e) => {
                      const qty = Math.max(1, Number(e.target.value) || 1);
                      setManual({ ...manual, lines: manual.lines.map((row, i) => i === index ? { ...row, qty } : row) });
                    }} />
                    <select className={inputClass} value={line.jenis} onChange={(e) => setManual({ ...manual, lines: manual.lines.map((row, i) => i === index ? { ...row, jenis: e.target.value } : row) })}>
                      <option value="MASUK">Masuk</option>
                      <option value="KELUAR">Keluar</option>
                    </select>
                  </div>
                  <input className={`${inputClass} mt-2`} placeholder="Ganti barang, ketik nama atau kategori" value={ganti?.index === index ? ganti.q : ""} onChange={(e) => {
                    const q = e.target.value;
                    setGanti({ index, q, items: [] });
                    if (q.trim().length < 2 || !manual) return;
                    void searchProducts({ data: { q } }).then((res) => setGanti({ index, q, items: res.items }));
                  }} />
                  {ganti?.index === index && ganti.items.length ? (
                    <div className="mt-1 max-h-28 overflow-y-auto rounded border border-line">
                      {ganti.items.slice(0, 6).map((item) => (
                        <button type="button" key={item.id} className="block w-full px-2 py-1 text-left hover:bg-blue-50" onClick={() => {
                          setManual({ ...manual, lines: manual.lines.map((row, i) => i === index ? { ...row, productId: item.id, nama: item.nama, satuan: item.satuan, isAlt: false } : row) });
                          setGanti(null);
                        }}>{item.nama}</button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setManual(null)}>Batal</button>
              <button className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Simpan</button>
            </div>
          </form>
        </div>
      ) : null}
    </Panel>
  );
}
