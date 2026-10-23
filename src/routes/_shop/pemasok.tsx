import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { createSupplierReceipt, deleteSupplierReceipt, listPartners, listSupplierReceipts, searchProducts, updateSupplierReceipt } from "@/lib/shop/api";
import { digits, grouped, rupiah, todayInput } from "@/lib/shop/format";
import { printSupplierReceiptReport } from "@/lib/shop/print";
import type { Partner, Product, SupplierReceipt } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/pemasok")({ component: PemasokPage });

type Draft = { product: Product; qty: number; satuan: string; hargaBeli: number };

/** Kolom pemasok yang bisa diketik; daftar baru muncul setelah ada huruf yang diketik. */
function SupplierPicker({ suppliers, value, onChange, placeholder }: { suppliers: Partner[]; value: string; onChange: (id: string) => void; placeholder: string }) {
  const selected = suppliers.find((row) => String(row.id) === value);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  useEffect(() => { setText(selected?.nama ?? ""); }, [value, suppliers]);
  const needle = text.trim().toLowerCase();
  const showList = focus && needle !== "" && text !== (selected?.nama ?? "");
  const matches = showList ? suppliers.filter((row) => row.nama.toLowerCase().includes(needle)).slice(0, 8) : [];
  return (
    <div className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={text}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setText(selected?.nama ?? ""); }}
        onChange={(e) => { setText(e.target.value); if (!e.target.value.trim() && value) onChange(""); }}
      />
      {showList ? (
        <div className="absolute left-0 top-12 z-30 max-h-64 w-full overflow-auto rounded-xl border border-line bg-white shadow-xl">
          {matches.length ? matches.map((row) => (
            <div
              key={row.id}
              role="option"
              aria-selected={String(row.id) === value}
              className="cursor-pointer truncate px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-blue-50"
              onMouseDown={(e) => { e.preventDefault(); onChange(String(row.id)); setText(row.nama); setFocus(false); }}
            >
              {row.nama}
            </div>
          )) : <div className="px-3 py-2 text-sm text-muted">Pemasok tidak ditemukan</div>}
        </div>
      ) : null}
    </div>
  );
}

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [productQ, setProductQ] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [items, setItems] = useState<Draft[]>([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [receivedAt, setReceivedAt] = useState(todayInput());
  const [formSupplierId, setFormSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  const [justAdded, setJustAdded] = useState<{ id: number; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const canEdit = me.role === "Admin";

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
    const timer = setTimeout(() => void searchProducts({ data: { q: productQ, limit: 20 } }).then((res) => setHits(res.items)).catch((error: Error) => toast.error(error.message)), 160);
    return () => clearTimeout(timer);
  }, [productQ]);

  useEffect(() => { setActiveHit(0); }, [hits]);
  useEffect(() => {
    if (!justAdded) return;
    const el = cellRefs.current[`q-${justAdded.id}`];
    el?.focus();
    el?.select();
  }, [justAdded]);

  const pages = Math.max(1, Math.ceil(total / perPage));
  const grandTotal = useMemo(() => items.reduce((sum, item) => sum + item.qty * item.hargaBeli, 0), [items]);

  function resetForm() {
    setEditingId(null);
    setInvoiceNo("");
    setReceivedAt(todayInput());
    setFormSupplierId("");
    setNotes("");
    setProductQ("");
    setHits([]);
    setItems([]);
    setJustAdded(null);
  }

  function dateInput(iso: string) {
    if (!iso) return todayInput();
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return todayInput();
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function openEdit(row: SupplierReceipt) {
    setEditingId(row.id);
    setInvoiceNo(row.invoiceNo);
    setReceivedAt(dateInput(row.receivedAt));
    setFormSupplierId(String(row.supplierId));
    setNotes(row.notes || "");
    setItems(row.items.map((item) => ({
      product: {
        id: item.productId,
        kode: "",
        partNumber: item.partNumber,
        partNumbersAlt: "",
        nama: item.nama,
        kategori: item.kategori || "",
        merek: "",
        satuan: item.satuan || "Pcs",
        stokMin: 0,
        stok: 0,
        hargaBeli: item.hargaBeli,
        hargaJual: 0,
        satuanAlt: "",
        isiSatuanAlt: 0,
        hargaJualAlt: 0,
        pajakStatus: "",
        kodePajak: "",
        keterangan: "",
      },
      qty: item.qty,
      satuan: item.satuan,
      hargaBeli: item.hargaBeli,
    })));
    setProductQ("");
    setHits([]);
    setOpen(true);
  }

  function removeReceipt(row: SupplierReceipt) {
    if (!window.confirm(`Hapus penerimaan ${row.invoiceNo}? Stok barang akan dikurangi.`)) return;
    void deleteSupplierReceipt({ data: { id: row.id } })
      .then(() => { toast.success(`Penerimaan ${row.invoiceNo} berhasil dihapus`, { description: "Stok barang dikurangi sesuai penerimaan." }); load(page); })
      .catch((error: Error) => toast.error(error.message));
  }

  function addProduct(product: Product) {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) return prev.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { product, qty: 1, satuan: product.satuan, hargaBeli: product.hargaBeli }];
    });
    setProductQ("");
    setHits([]);
    setJustAdded({ id: product.id, n: Date.now() });
  }

  if (me.role === "Owner") return <Panel><p>Halaman ini untuk operasional Admin/Kasir. Akun Owner hanya melihat laporan.</p></Panel>;
  if (me.role === "Kasir") return <Panel><p>Halaman Barang Masuk Pemasok hanya untuk Admin.</p></Panel>;

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
          <SupplierPicker suppliers={suppliers} value={supplierId} onChange={(id) => { setPage(1); setSupplierId(id); }} placeholder="Ketik nama pemasok" />
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
            <tr><th className="px-2 py-3">Tanggal</th><th className="px-2 py-3">Pemasok</th><th className="px-2 py-3">No. Invoice</th><th className="px-2 py-3">Barang</th><th className="px-2 py-3 text-center">Qty</th><th className="px-2 py-3 text-right">Nilai</th><th className="px-2 py-3">Dicatat Oleh</th><th className="px-2 py-3">Aksi</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-muted">Belum ada barang masuk pemasok sesuai filter.</td></tr> : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="px-2 py-3 whitespace-nowrap">{new Date(row.receivedAt).toLocaleDateString("id-ID")}</td>
                <td className="px-2 py-3 font-semibold">{row.supplierName}</td>
                <td className="px-2 py-3 font-mono text-xs font-bold">{row.invoiceNo}</td>
                <td className="px-2 py-3"><div className="space-y-1">{row.items.map((item, index) => <div key={`${row.id}-${item.productId}-${index}`}><b>{item.nama}</b><span className="ml-2 text-[11px] text-muted">{item.partNumber || "-"}</span></div>)}</div></td>
                <td className="px-2 py-3 text-center font-semibold">{row.totalQty}</td>
                <td className="num px-2 py-3 text-right font-semibold">{rupiah(row.totalValue)}</td>
                <td className="px-2 py-3 text-xs">{row.createdBy || "-"}</td>
                <td className="px-2 py-3 whitespace-nowrap">{canEdit ? <><button className="mr-2 text-xs font-bold text-blue-700" onClick={() => openEdit(row)}>Edit</button><button className="text-xs font-bold text-danger" onClick={() => removeReceipt(row)}>Hapus</button></> : null}</td>
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
        <div className="fixed inset-0 z-50 flex bg-ink/40 p-2 sm:p-4">
          <div className="mx-auto flex h-full max-h-[96vh] w-full max-w-[1500px] flex-col rounded-2xl bg-panel shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold">{editingId ? "Ubah Barang Masuk Pemasok" : "Penerimaan Barang dari Pemasok"}</h3>
                <p className="text-sm text-muted">{editingId ? "Stok lama dikembalikan, lalu stok baru ditambahkan sesuai form ini." : "Simpan penerimaan untuk menambah stok secara otomatis."}</p>
              </div>
              <button className="h-11 rounded-lg border border-line px-4 text-sm font-medium" onClick={() => { setOpen(false); setEditingId(null); }}>Tutup</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Pemasok *"><SupplierPicker suppliers={suppliers} value={formSupplierId} onChange={setFormSupplierId} placeholder="Ketik nama pemasok" /></Field>
                <Field label="Nomor Invoice *"><input className={inputClass} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Contoh: INV-SUP-00125" /></Field>
                <Field label="Tanggal Penerimaan *"><input className={inputClass} type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></Field>
                <Field label="Keterangan"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" /></Field>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(340px,1fr)_2fr]">
                <section className="rounded-xl border border-line bg-slate-50 p-4">
                  <h4 className="text-base font-extrabold">1. Cari & Tambah Barang</h4>
                  <input
                    ref={searchRef}
                    className="mt-3 h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:border-blue-500"
                    placeholder="Ketik nama / part number, lalu Enter"
                    value={productQ}
                    onChange={(e) => setProductQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") { e.preventDefault(); setActiveHit((i) => Math.min(hits.length - 1, i + 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveHit((i) => Math.max(0, i - 1)); }
                      else if (e.key === "Enter" && hits[activeHit]) { e.preventDefault(); addProduct(hits[activeHit]); }
                    }}
                  />
                  <p className="mt-2 text-xs text-muted">Tips: panah atas/bawah untuk memilih, Enter untuk menambah. Kursor langsung pindah ke kolom Qty.</p>
                  <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-lg border border-line bg-white">
                    {!productQ.trim() ? <p className="px-3 py-6 text-center text-sm text-muted">Hasil pencarian muncul di sini.</p> : null}
                    {productQ.trim() && hits.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">Barang tidak ditemukan.</p> : null}
                    {hits.map((product, index) => (
                      <button
                        key={product.id}
                        type="button"
                        className={`block w-full border-b border-line px-3 py-3 text-left ${index === activeHit ? "bg-blue-50" : "hover:bg-blue-50"}`}
                        onMouseEnter={() => setActiveHit(index)}
                        onClick={() => addProduct(product)}
                      >
                        <p className="text-sm font-semibold"><Mark text={product.nama} q={productQ} /></p>
                        <p className="mt-0.5 text-xs text-muted">PN: <Mark text={product.partNumber || product.kode || "-"} q={productQ} />{product.partNumbersAlt ? <> · Alt: <Mark text={product.partNumbersAlt} q={productQ} /></> : null} · {product.merek || "-"} · Stok: {product.stok} {product.satuan}</p>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-base font-extrabold">2. Isi Penerimaan <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{items.length} barang</span></h4>
                    <span className="text-base font-extrabold">{rupiah(grandTotal)}</span>
                  </div>
                  <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-line">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
                        <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2 text-left">Barang</th><th className="px-2 py-2">Satuan</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2 text-right">Harga Beli</th><th className="px-2 py-2 text-right">Subtotal</th><th className="w-20"></th></tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted">Belum ada barang. Cari barang di sebelah kiri lalu tekan Enter.</td></tr> : items.map((item, index) => (
                          <tr key={item.product.id} className={`border-t border-line ${justAdded?.id === item.product.id ? "bg-yellow-50" : ""}`}>
                            <td className="px-2 py-2 text-muted">{index + 1}</td>
                            <td className="px-2 py-2"><b className="text-sm">{item.product.nama}</b><span className="block text-xs text-muted">{item.product.partNumber || item.product.kode}</span></td>
                            <td className="px-2 text-center">{item.satuan}</td>
                            <td className="px-2">
                              <input
                                ref={(el) => { cellRefs.current[`q-${item.product.id}`] = el; }}
                                className="num h-12 w-24 rounded-lg border border-line text-center text-base"
                                inputMode="numeric"
                                value={item.qty}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = cellRefs.current[`h-${item.product.id}`]; el?.focus(); el?.select(); } }}
                                onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, qty: Math.max(1, digits(e.target.value)) } : row))}
                              />
                            </td>
                            <td className="px-2">
                              <input
                                ref={(el) => { cellRefs.current[`h-${item.product.id}`] = el; }}
                                className="num h-12 w-36 rounded-lg border border-line text-right text-base"
                                inputMode="numeric"
                                value={grouped(item.hargaBeli)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchRef.current?.focus(); } }}
                                onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, hargaBeli: digits(e.target.value) } : row))}
                              />
                            </td>
                            <td className="num px-2 text-right font-semibold">{rupiah(item.qty * item.hargaBeli)}</td>
                            <td className="px-2 text-right"><button type="button" className="h-10 rounded-lg border border-red-200 px-3 text-xs font-bold text-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>Hapus</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <span className="text-muted">{items.length} barang · {items.reduce((sum, item) => sum + item.qty, 0)} qty · Total</span>
                <b className="ml-2 text-lg">{rupiah(grandTotal)}</b>
              </div>
              <div className="flex justify-end gap-2">
                <button className="h-12 rounded-lg border border-line px-5" onClick={() => { setOpen(false); setEditingId(null); }}>Batal</button>
                <PrimaryButton disabled={!invoiceNo.trim() || !formSupplierId || !items.length} onClick={() => {
                  const payload = { invoiceNo, supplierId: Number(formSupplierId), receivedAt, notes, items: items.map((item) => ({ productId: item.product.id, qty: item.qty, satuan: item.satuan, hargaBeli: item.hargaBeli })) };
                  const run = editingId ? updateSupplierReceipt({ data: { id: editingId, ...payload } }) : createSupplierReceipt({ data: payload });
                  void run
                    .then(() => { toast.success(editingId ? `Penerimaan ${invoiceNo} berhasil diubah` : `Barang masuk ${invoiceNo} berhasil disimpan`, { description: editingId ? "Stok disesuaikan." : "Stok barang bertambah." }); setOpen(false); resetForm(); setPage(1); load(1); })
                    .catch((error: Error) => toast.error(error.message));
                }}>{editingId ? "Simpan Perubahan" : "Simpan Barang Masuk"}</PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
