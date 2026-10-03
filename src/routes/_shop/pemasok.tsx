import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { createSupplierReceipt, listPartners, listSupplierReceipts, searchProducts } from "@/lib/shop/api";
import { rupiah, todayInput } from "@/lib/shop/format";
import { printSupplierReceiptReport } from "@/lib/shop/print";
import type { Partner, Product, SupplierReceipt } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/pemasok")({ component: PemasokPage });

type Draft = { product: Product; qty: number; satuan: string; hargaBeli: number };

function PemasokPage() {
  const me = Route.useRouteContext().me;
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [rows, setRows] = useState<SupplierReceipt[]>([]);
  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(15);
  const [open, setOpen] = useState(false);
  const [productQ, setProductQ] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [items, setItems] = useState<Draft[]>([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [receivedAt, setReceivedAt] = useState(todayInput());
  const [formSupplierId, setFormSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const canEdit = me.role !== "Kasir";

  function load(nextPage = page) {
    void listSupplierReceipts({ data: { q, supplierId: supplierId ? Number(supplierId) : 0, start, end, page: nextPage } })
      .then((res) => { setRows(res.items as SupplierReceipt[]); setTotal(res.total); setPerPage(res.perPage); })
      .catch((error: Error) => toast.error(error.message));
  }

  useEffect(() => {
    void listPartners().then((all) => setSuppliers(all.filter((row) => row.tipe === "Supplier"))).catch((error: Error) => toast.error(error.message));
  }, []);

  useEffect(() => { load(page); }, [q, supplierId, start, end, page]);

  useEffect(() => {
    if (!productQ.trim()) return setHits([]);
    const timer = setTimeout(() => void searchProducts({ data: { q: productQ } }).then((res) => setHits(res.items)).catch((error: Error) => toast.error(error.message)), 160);
    return () => clearTimeout(timer);
  }, [productQ]);

  const pages = Math.max(1, Math.ceil(total / perPage));
  const grandTotal = useMemo(() => items.reduce((sum, item) => sum + item.qty * item.hargaBeli, 0), [items]);

  function resetForm() {
    setInvoiceNo("");
    setReceivedAt(todayInput());
    setFormSupplierId("");
    setNotes("");
    setProductQ("");
    setHits([]);
    setItems([]);
  }

  function addProduct(product: Product) {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) return prev.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { product, qty: 1, satuan: product.satuan, hargaBeli: product.hargaBeli }];
    });
    setProductQ("");
    setHits([]);
  }

  if (me.role === "Kasir") return <Panel><p>Halaman Barang Masuk Pemasok hanya untuk Owner/Admin.</p></Panel>;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Transaksi & Persediaan</p>
            <h2 className="text-xl font-extrabold">Barang Masuk Pemasok</h2>
            <p className="mt-1 text-sm text-muted">Penerimaan dari supplier dicatat terpisah dari Riwayat Transaksi. Stok barang otomatis bertambah setelah disimpan.</p>
          </div>
          {canEdit ? <PrimaryButton onClick={() => { resetForm(); setOpen(true); }}>+ Barang Masuk</PrimaryButton> : null}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
          <input className={inputClass} placeholder="Cari invoice, supplier, atau barang" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          <select className={inputClass} value={supplierId} onChange={(e) => { setPage(1); setSupplierId(e.target.value); }}>
            <option value="">Semua Pemasok</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nama}</option>)}
          </select>
          <input className={inputClass} type="date" value={start} onChange={(e) => { setPage(1); setStart(e.target.value); }} />
          <input className={inputClass} type="date" value={end} onChange={(e) => { setPage(1); setEnd(e.target.value); }} />
          <div className="flex gap-2">
            <button className="h-11 flex-1 rounded-lg border border-line px-3 text-sm" onClick={() => { setQ(""); setSupplierId(""); setStart(""); setEnd(""); setPage(1); }}>Reset</button>
            <button className="h-11 flex-1 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={() => {
              void listSupplierReceipts({ data: { q, supplierId: supplierId ? Number(supplierId) : 0, start, end, page: 1, all: true } }).then((res) => {
                try { printSupplierReceiptReport(res.items as SupplierReceipt[], { start, end }); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
              }).catch((error: Error) => toast.error(error.message));
            }}>Cetak PDF</button>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            <tr><th className="px-2 py-3">Tanggal</th><th className="px-2 py-3">Pemasok</th><th className="px-2 py-3">No. Invoice</th><th className="px-2 py-3">Barang</th><th className="px-2 py-3 text-center">Qty</th><th className="px-2 py-3 text-right">Nilai</th><th className="px-2 py-3">Dicatat Oleh</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-muted">Belum ada barang masuk pemasok sesuai filter.</td></tr> : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="px-2 py-3 whitespace-nowrap">{new Date(row.receivedAt).toLocaleDateString("id-ID")}</td>
                <td className="px-2 py-3 font-semibold">{row.supplierName}</td>
                <td className="px-2 py-3 font-mono text-xs font-bold">{row.invoiceNo}</td>
                <td className="px-2 py-3"><div className="space-y-1">{row.items.map((item, index) => <div key={`${row.id}-${item.productId}-${index}`}><b>{item.nama}</b><span className="ml-2 text-[11px] text-muted">{item.partNumber || "-"}</span></div>)}</div></td>
                <td className="px-2 py-3 text-center font-semibold">{row.totalQty}</td>
                <td className="num px-2 py-3 text-right font-semibold">{rupiah(row.totalValue)}</td>
                <td className="px-2 py-3 text-xs">{row.createdBy || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">Menampilkan {rows.length} dari {total} penerimaan</span>
          <div className="flex items-center gap-2"><button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button><span>Hal: {page}/{pages}</span><button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button></div>
        </div>
      </Panel>

      {open ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 p-4">
          <div className="mx-auto my-4 w-full max-w-5xl rounded-2xl bg-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">Penerimaan Barang dari Pemasok</h3><p className="text-xs text-muted">Simpan penerimaan untuk menambah stok secara otomatis.</p></div><button className="h-10 px-3" onClick={() => setOpen(false)}>Tutup</button></div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field label="Pemasok *"><select className={inputClass} value={formSupplierId} onChange={(e) => setFormSupplierId(e.target.value)}><option value="">Pilih pemasok</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nama}</option>)}</select></Field>
              <Field label="Nomor Invoice *"><input className={inputClass} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Contoh: INV-SUP-00125" /></Field>
              <Field label="Tanggal Penerimaan *"><input className={inputClass} type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></Field>
            </div>
            <Field label="Keterangan"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" /></Field>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
              <Panel className="bg-slate-50">
                <h4 className="font-extrabold">Tambah Barang</h4>
                <input className={`${inputClass} mt-3`} placeholder="Cari nama / part number" value={productQ} onChange={(e) => setProductQ(e.target.value)} />
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line bg-white">{hits.map((product) => <button key={product.id} type="button" className="block w-full border-b border-line px-3 py-3 text-left hover:bg-blue-50" onClick={() => addProduct(product)}><p className="font-semibold"><Mark text={product.nama} q={productQ} /></p><p className="text-[11px] text-muted">{product.partNumber || product.kode} · Kategori: {product.kategori} · Stok sekarang: {product.stok} {product.satuan}</p></button>)}</div>
              </Panel>
              <Panel>
                <div className="flex items-center justify-between"><h4 className="font-extrabold">Isi Penerimaan</h4><span className="text-sm font-bold">{rupiah(grandTotal)}</span></div>
                <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line"><th className="py-2 text-left">Barang</th><th className="py-2">Satuan</th><th className="py-2">Qty</th><th className="py-2">Harga Beli</th><th></th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-muted">Belum ada barang.</td></tr> : items.map((item, index) => <tr key={item.product.id} className="border-b border-line"><td className="py-2 pr-2"><b>{item.product.nama}</b><span className="block text-[11px] text-muted">{item.product.partNumber || item.product.kode}</span></td><td className="px-1 text-center">{item.satuan}</td><td className="px-1"><input className="num h-10 w-20 rounded-lg border border-line text-center" type="number" min="1" value={item.qty} onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, qty: Math.max(1, Number(e.target.value) || 1) } : row))} /></td><td className="px-1"><input className="num h-10 w-28 rounded-lg border border-line text-right" type="number" min="0" value={item.hargaBeli} onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, hargaBeli: Math.max(0, Number(e.target.value) || 0) } : row))} /></td><td className="pl-2"><button className="text-xs font-bold text-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>Hapus</button></td></tr>)}</tbody></table></div>
              </Panel>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button className="h-11 rounded-lg border border-line px-4" onClick={() => setOpen(false)}>Batal</button><PrimaryButton disabled={!invoiceNo.trim() || !formSupplierId || !items.length} onClick={() => {
              void createSupplierReceipt({ data: { invoiceNo, supplierId: Number(formSupplierId), receivedAt, notes, items: items.map((item) => ({ productId: item.product.id, qty: item.qty, satuan: item.satuan, hargaBeli: item.hargaBeli })) } })
                .then(() => { toast.success("Barang masuk tersimpan dan stok bertambah."); setOpen(false); resetForm(); setPage(1); load(1); })
                .catch((error: Error) => toast.error(error.message));
            }}>Simpan Barang Masuk</PrimaryButton></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
