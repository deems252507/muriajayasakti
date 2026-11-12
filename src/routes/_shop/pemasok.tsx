import { confirmDialog } from "@/lib/confirm";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { ExpandButton, ExpandGroup } from "@/components/ui/button-7";
import { Field, inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { CommentButton, useCommentFinder, useComments } from "@/components/shop/comment-ui";
import { createSupplierReceipt, deleteSupplierReceipt, listPartners, listSupplierReceipts, searchProducts, updateSupplierReceipt } from "@/lib/shop/api";
import { digits, grouped, rupiah, todayInput } from "@/lib/shop/format";
import { printSupplierInvoice, printSupplierReceiptReport, shopBrand } from "@/lib/shop/print";
import type { Partner, Product, SupplierReceipt } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/pemasok")({
  component: PemasokPage,
  // ?inv=NO-INVOICE: dibuka dari popup Asal Barang (Daftar Sparepart), langsung menyaring ke invoice itu.
  validateSearch: (search: Record<string, unknown>): { inv?: string } => ({ inv: typeof search.inv === "string" && search.inv.trim() ? search.inv.trim() : undefined }),
});

type Draft = { product: Product; qty: number; satuan: string; hargaBeli: number; hargaJual: number; markup: string };

/** Pembulatan harga jual ke ribuan terdekat: 250.399 -> 250.000, 250.550 -> 251.000. */
function roundThousand(n: number) { return Math.round(n / 1000) * 1000; }
function parsePct(text: string) { const n = Number(String(text).replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; }
/** Harga jual dari harga beli + persen markup. Hasil 0 kalau persen/harga beli belum diisi. */
function jualFromMarkup(beli: number, pct: string) { const p = parsePct(pct); return p > 0 && beli > 0 ? roundThousand(beli * (1 + p / 100)) : 0; }
function hasAlt(product: Product) { return Boolean(product.satuanAlt) && product.isiSatuanAlt > 0; }
/** Pilihan satuan: satuan dasar (mis. Pcs) dan satuan kedua (mis. Dus) kalau barangnya punya. */
function unitOptions(product: Product, current: string) {
  const list = [product.satuan || "Pcs"];
  if (hasAlt(product) && product.satuanAlt !== list[0]) list.push(product.satuanAlt);
  if (current && !list.includes(current)) list.push(current);
  return list;
}
function isAltUnit(product: Product, satuan: string) { return hasAlt(product) && satuan === product.satuanAlt && satuan !== product.satuan; }
function masterJual(product: Product, satuan: string) { return isAltUnit(product, satuan) ? product.hargaJualAlt : product.hargaJual; }
function masterBeli(product: Product, satuan: string) { return isAltUnit(product, satuan) ? product.hargaBeli * product.isiSatuanAlt : product.hargaBeli; }

/** Identitas barang: nama, merek, Kode (kode pajak/barang), part number, part number alt, kategori. */
function ProductInfo({ nama, partNumber, partNumbersAlt, merek, kodePajak, kategori, hidePn }: { nama: string; partNumber?: string; partNumbersAlt?: string; merek?: string; kodePajak?: string; kategori?: string; hidePn?: boolean }) {
  return (
    <div className="leading-snug">
      <b className="text-sm">{nama}</b>
      {merek ? <span className="ml-2 inline-block rounded bg-blue-100 px-1.5 py-px align-middle text-[11px] font-bold text-blue-800">{merek}</span> : null}
      {kodePajak ? <span className="ml-1.5 inline-block rounded bg-slate-100 px-1.5 py-px align-middle font-mono text-[11px] font-bold text-slate-700">Kode {kodePajak}</span> : null}
      {hidePn ? null : <span className="mt-0.5 block text-xs text-slate-600">PN: <span className="font-mono font-semibold">{partNumber || "-"}</span></span>}
      {partNumbersAlt ? <span className="block text-xs text-slate-600">PN Alt: <span className="font-mono">{partNumbersAlt}</span></span> : null}
      {kategori ? <span className="block text-[11px] text-muted">{kategori}</span> : null}
    </div>
  );
}

/** Tampilan faktur pembelian per invoice (hanya untuk dilihat; Admin bisa lanjut ke Ubah). */
function FakturModal({ row, supplier, canEdit, onClose, onEdit }: { row: SupplierReceipt; supplier?: Partner; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const brand = shopBrand();
  const tanggal = row.receivedAt ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "long", year: "numeric" }).format(new Date(row.receivedAt)) : "-";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h3 className="text-lg font-extrabold">Faktur Pembelian</h3>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-line px-4 text-sm font-medium" onClick={() => { try { printSupplierInvoice(row, supplier); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); } }}>Cetak</button>
            {canEdit ? <button type="button" className="h-10 rounded-lg border border-line px-4 text-sm font-medium" onClick={onEdit}>Ubah</button> : null}
            <button type="button" className="h-10 rounded-lg border border-line px-4 text-sm font-medium" onClick={onClose}>Tutup</button>
          </div>
        </div>
        <div className="no-row-hover min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
          <div className="mx-auto max-w-3xl rounded-lg bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xl font-extrabold tracking-wide">{brand.nama}</p>
                <p className="text-xs text-slate-600">{[brand.alamat, brand.telepon].filter(Boolean).join(" | ")}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xl font-bold">Faktur Pembelian</p>
                <p className="mt-1 text-sm">No. Invoice: <b className="font-mono">{row.invoiceNo}</b></p>
                <p className="text-sm">Tanggal: <b>{tanggal}</b></p>
                {row.createdBy ? <p className="text-xs text-slate-600">Dicatat oleh: {row.createdBy}</p> : null}
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dari (Pemasok)</p>
              <p className="text-base font-extrabold">{row.supplierName}</p>
              {supplier?.alamat ? <p className="text-xs text-slate-600">{supplier.alamat}</p> : null}
              {supplier?.telp ? <p className="text-xs text-slate-600">Telp: {supplier.telp}</p> : null}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                  <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2 text-left">Kode</th><th className="px-2 py-2 text-left">Nama Barang</th><th className="px-2 py-2 text-right">Kts</th><th className="px-2 py-2 text-right">@Harga</th><th className="px-2 py-2 text-right">Total Harga</th></tr>
                </thead>
                <tbody>
                  {row.items.map((item, index) => (
                    <tr key={`${item.productId}-${index}`} className="align-top">
                      <td className="px-2 py-2 text-muted">{index + 1}</td>
                      <td className="px-2 py-2 font-mono text-xs font-semibold">{item.kodePajak || "-"}</td>
                      <td className="px-2 py-2"><ProductInfo nama={item.nama} partNumber={item.partNumber} partNumbersAlt={item.partNumbersAlt} merek={item.merek} kategori={item.kategori} /></td>
                      <td className="px-2 py-2 text-right font-semibold">{grouped(item.qty)} {item.satuan}</td>
                      <td className="num px-2 py-2 text-right">{rupiah(item.hargaBeli)}</td>
                      <td className="num px-2 py-2 text-right font-semibold">{rupiah(item.hargaBeli * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <div className="flex-1 text-sm"><p className="font-bold">Keterangan</p><p className="text-slate-700">{row.notes || "-"}</p></div>
              <div className="w-full rounded-lg border border-line sm:w-64">
                <div className="flex justify-between px-3 py-1.5 text-sm"><span>Total Qty</span><span>{grouped(row.totalQty)}</span></div>
                <div className="flex justify-between border-t-2 border-slate-800 px-3 py-2 text-base font-extrabold"><span>Total</span><span className="num">{rupiah(row.totalValue)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kolom pemasok: daftar muncul saat diklik, dan bisa disaring dengan mengetik. */
function SupplierPicker({ suppliers, value, onChange, placeholder }: { suppliers: Partner[]; value: string; onChange: (id: string) => void; placeholder: string }) {
  const selected = suppliers.find((row) => String(row.id) === value);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  useEffect(() => { setText(selected?.nama ?? ""); }, [value, suppliers]);
  const needle = text.trim().toLowerCase();
  const typing = needle !== "" && text !== (selected?.nama ?? "");
  const showList = focus;
  const matches = showList ? suppliers.filter((row) => !typing || row.nama.toLowerCase().includes(needle)).slice(0, 50) : [];
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
          )) : <div className="px-3 py-2 text-sm text-muted">{suppliers.length ? "Pemasok tidak ditemukan" : "Belum ada pemasok. Tambahkan dulu di menu Mitra (tipe Supplier)."}</div>}
        </div>
      ) : null}
    </div>
  );
}

function PemasokPage() {
  const me = Route.useRouteContext().me;
  const { inv } = Route.useSearch();
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [rows, setRows] = useState<SupplierReceipt[]>([]);
  const [q, setQ] = useState(inv ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(15);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<SupplierReceipt | null>(null);
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
  const [defaultMarkup, setDefaultMarkup] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const canEdit = me.role === "Admin";
  // Owner boleh membuka dan melihat detail penerimaan, tetapi tidak bisa mengubah (server juga menolak).
  const readOnly = me.role === "Owner";

  function load(nextPage = page) {
    void listSupplierReceipts({ data: { q, supplierId: supplierId ? Number(supplierId) : 0, start, end, page: nextPage } })
      .then((res) => { setRows(res.items as SupplierReceipt[]); setTotal(res.total); setPerPage(res.perPage); })
      .catch((error: Error) => toast.error(error.message));
  }

  useEffect(() => {
    void listPartners().then((all) => setSuppliers(all.filter((row) => row.tipe === "Supplier"))).catch((error: Error) => toast.error(error.message));
  }, []);

  useEffect(() => { load(page); }, [q, supplierId, start, end, page]);
  useEffect(() => { if (inv) { setSupplierId(""); setStart(""); setEnd(""); setPage(1); setQ(inv); } }, [inv]);

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
    setDefaultMarkup("");
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
        partNumbersAlt: item.partNumbersAlt || "",
        nama: item.nama,
        kategori: item.kategori || "",
        merek: item.merek || "",
        satuan: item.satuan || "Pcs",
        stokMin: 0,
        stok: 0,
        hargaBeli: item.hargaBeli,
        hargaJual: 0,
        satuanAlt: "",
        isiSatuanAlt: 0,
        hargaJualAlt: 0,
        pajakStatus: "",
        kodePajak: item.kodePajak || "",
        keterangan: "",
      },
      qty: item.qty,
      satuan: item.satuan,
      hargaBeli: item.hargaBeli,
      hargaJual: 0,
      markup: "",
    })));
    setDefaultMarkup("");
    setProductQ("");
    setHits([]);
    setOpen(true);
    // Lengkapi data barang (satuan kedua & harga jual saat ini) supaya pilihan Pcs/Dus dan harga jual tampil.
    void Promise.allSettled(row.items.map((item) => searchProducts({ data: { q: item.partNumber || item.nama, limit: 50 } }).then((res) => res.items.find((hit) => hit.id === item.productId))))
      .then((results) => {
        const found = new Map<number, Product>();
        results.forEach((res) => { if (res.status === "fulfilled" && res.value) found.set(res.value.id, res.value); });
        if (!found.size) return;
        setItems((prev) => prev.map((draft) => {
          const full = found.get(draft.product.id);
          return full ? { ...draft, product: full, hargaJual: draft.hargaJual || masterJual(full, draft.satuan) } : draft;
        }));
      });
  }

  async function removeReceipt(row: SupplierReceipt) {
    if (!(await confirmDialog(`Hapus penerimaan ${row.invoiceNo}? Stok barang akan dikurangi.`, { title: "Hapus penerimaan?", danger: true }))) return;
    void deleteSupplierReceipt({ data: { id: row.id } })
      .then(() => { toast.success(`Penerimaan ${row.invoiceNo} berhasil dihapus`, { description: "Stok barang dikurangi sesuai penerimaan." }); load(page); })
      .catch((error: Error) => toast.error(error.message));
  }

  function patchItem(index: number, fn: (row: Draft) => Draft) {
    setItems((prev) => prev.map((row, i) => i === index ? fn(row) : row));
  }

  function changeUnit(index: number, satuan: string) {
    patchItem(index, (row) => {
      // Harga beli yang belum diubah ikut menyesuaikan satuan; yang sudah diketik tetap.
      const untouched = row.hargaBeli === masterBeli(row.product, row.satuan);
      const hargaBeli = untouched ? masterBeli(row.product, satuan) : row.hargaBeli;
      const hargaJual = jualFromMarkup(hargaBeli, row.markup) || masterJual(row.product, satuan);
      return { ...row, satuan, hargaBeli, hargaJual };
    });
  }

  function changeMarkupAll(text: string) {
    const clean = text.replace(/[^\d.,]/g, "");
    setDefaultMarkup(clean);
    setItems((prev) => prev.map((row) => ({ ...row, markup: clean, hargaJual: jualFromMarkup(row.hargaBeli, clean) || row.hargaJual })));
  }

  function addProduct(product: Product) {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) return prev.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      const hargaJual = jualFromMarkup(product.hargaBeli, defaultMarkup) || product.hargaJual;
      return [...prev, { product, qty: 1, satuan: product.satuan, hargaBeli: product.hargaBeli, hargaJual, markup: defaultMarkup }];
    });
    setProductQ("");
    setHits([]);
    setJustAdded({ id: product.id, n: Date.now() });
  }

  if (me.role === "Kasir") return <Panel><p>Halaman Barang Masuk Pemasok hanya untuk Admin.</p></Panel>;

  const comments = useComments("masuk", rows.map((r) => r.id));
  // Label komentar: "Barang masuk <no. invoice> · <supplier>". Cari lewat no. invoice, filter dikosongkan.
  useCommentFinder("masuk", (t) => {
    const m = /^Barang masuk (.+?) · /.exec(t.label);
    setSupplierId(""); setStart(""); setEnd(""); setPage(1); setQ(m ? m[1] : "");
  });

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Transaksi & Persediaan</p>
            <h2 className="text-xl font-extrabold">Barang Masuk Pemasok</h2>
            <p className="mt-1 text-sm text-muted">Penerimaan dari supplier dicatat terpisah dari Riwayat Transaksi. Stok barang otomatis bertambah setelah disimpan.</p>
          </div>
          {canEdit ? <ExpandGroup align="end" className="self-start"><ExpandButton size="md" variant="primary" label="Barang Masuk" icon={<Plus />} onClick={() => { resetForm(); setOpen(true); }} /></ExpandGroup> : null}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
          <input className={inputClass} placeholder="Cari invoice, supplier, atau barang" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          <SupplierPicker suppliers={suppliers} value={supplierId} onChange={(id) => { setPage(1); setSupplierId(id); }} placeholder="Ketik nama pemasok" />
          <input className={inputClass} type="date" value={start} onChange={(e) => { setPage(1); setStart(e.target.value); }} />
          <input className={inputClass} type="date" value={end} onChange={(e) => { setPage(1); setEnd(e.target.value); }} />
          <div className="flex gap-2">
            <ExpandGroup align="start" className="self-start">
            <ExpandButton size="md" label="Reset" icon={<RotateCcw />} onClick={() => { setQ(""); setSupplierId(""); setStart(""); setEnd(""); setPage(1); }} />
            <ExpandButton size="md" label="Cetak PDF" icon={<Printer />} onClick={() => {
              void listSupplierReceipts({ data: { q, supplierId: supplierId ? Number(supplierId) : 0, start, end, page: 1, all: true } }).then((res) => {
                try { printSupplierReceiptReport(res.items as SupplierReceipt[], { start, end }); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
              }).catch((error: Error) => toast.error(error.message));
            }} />
            </ExpandGroup>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            <tr><th className="px-2 py-3">Tanggal</th><th className="px-2 py-3">Pemasok</th><th className="px-2 py-3">No. Invoice</th><th className="px-2 py-3">Barang</th><th className="px-2 py-3 text-center">Item</th><th className="px-2 py-3 text-center">Qty</th><th className="px-2 py-3 text-right">Nilai</th><th className="px-2 py-3">Dicatat Oleh</th><th className="px-2 py-3">Aksi</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={9} className="py-8 text-center text-muted">Belum ada barang masuk pemasok sesuai filter.</td></tr> : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                {...comments.row(row.id, `Barang masuk ${row.invoiceNo} · ${row.supplierName}`)}
                className="cursor-pointer border-t border-line align-top"
                title="Klik baris untuk melihat faktur"
                onClick={() => { if (!window.getSelection()?.toString()) setViewing(row); }}
              >
                <td className="px-2 py-3 whitespace-nowrap">{new Date(row.receivedAt).toLocaleDateString("id-ID")}</td>
                <td className="px-2 py-3 font-semibold">{row.supplierName}</td>
                <td className="px-2 py-3 font-mono text-xs font-bold">{row.invoiceNo}</td>
                <td className="max-w-[360px] px-2 py-3">
                  {row.items[0] ? (
                    <div className="leading-snug">
                      <p className="truncate text-sm font-bold" title={row.items.map((i) => i.nama).join("\n")}>{row.items[0].nama}</p>
                      <p className="truncate text-xs text-slate-600">{row.items[0].kodePajak ? <>Kode <span className="font-mono font-semibold">{row.items[0].kodePajak}</span> · </> : null}PN: <span className="font-mono">{row.items[0].partNumber || "-"}</span></p>
                      {row.items.length > 1 ? <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">+{row.items.length - 1} barang lainnya</span> : null}
                    </div>
                  ) : "-"}
                </td>
                <td className="px-2 py-3 text-center text-xs font-semibold text-slate-600">{row.items.length}</td>
                <td className="px-2 py-3 text-center font-semibold">{row.totalQty}</td>
                <td className="num px-2 py-3 text-right font-semibold">{rupiah(row.totalValue)}</td>
                <td className="px-2 py-3 text-xs">{row.createdBy || "-"}</td>
                <td className="px-2 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}><span className="mr-2 inline-block align-middle"><CommentButton kind="masuk" refId={row.id} label={`Barang masuk ${row.invoiceNo} · ${row.supplierName}`} mark={comments.marks[String(row.id)]} /></span>{canEdit ? <ExpandGroup align="start"><ExpandButton label="Edit" icon={<Pencil />} onClick={() => openEdit(row)} /><ExpandButton variant="danger" label="Hapus" icon={<Trash2 />} onClick={() => removeReceipt(row)} /></ExpandGroup> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">Menampilkan {rows.length} dari {total} penerimaan</span>
          <div className="flex items-center gap-2"><button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button><span>Hal: {page}/{pages}</span><button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button></div>
        </div>
      </Panel>

      {viewing ? (
        <FakturModal
          row={viewing}
          supplier={suppliers.find((s) => s.id === viewing.supplierId)}
          canEdit={canEdit}
          onClose={() => setViewing(null)}
          onEdit={() => { const r = viewing; setViewing(null); openEdit(r); }}
        />
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex bg-ink/40 p-2 sm:p-4">
          <div className="mx-auto flex h-full max-h-[96vh] w-full max-w-[1500px] flex-col rounded-2xl bg-panel shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold">{readOnly ? "Detail Barang Masuk Pemasok" : editingId ? "Ubah Barang Masuk Pemasok" : "Penerimaan Barang dari Pemasok"}</h3>
                <p className="text-sm text-muted">{readOnly ? "Hanya untuk dilihat. Akun Owner tidak dapat mengubah penerimaan." : editingId ? "Stok lama dikembalikan, lalu stok baru ditambahkan sesuai form ini." : "Simpan penerimaan untuk menambah stok secara otomatis."}</p>
              </div>
              <button className="h-11 rounded-lg border border-line px-4 text-sm font-medium" onClick={() => { setOpen(false); setEditingId(null); }}>Tutup</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
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
                        <p className="mt-0.5 text-xs text-muted">{product.kodePajak ? <>Kode: {product.kodePajak} · </> : null}PN: <Mark text={product.partNumber || product.kode || "-"} q={productQ} />{product.partNumbersAlt ? <> · Alt: <Mark text={product.partNumbersAlt} q={productQ} /></> : null} · {product.merek || "-"} · Stok: {product.stok} {product.satuan}</p>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-base font-extrabold">2. Isi Penerimaan <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{items.length} barang</span></h4>
                    <span className="text-base font-extrabold">{rupiah(grandTotal)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-semibold">Persen harga jual untuk semua barang</span>
                    <input
                      className="num h-10 w-20 rounded-lg border border-line bg-white text-center"
                      inputMode="decimal"
                      placeholder="0"
                      value={defaultMarkup}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => changeMarkupAll(e.target.value)}
                    />
                    <span className="font-semibold">%</span>
                    <span className="text-xs text-muted">Harga jual = harga beli + persen, dibulatkan ke ribuan terdekat. Tiap barang tetap bisa diubah sendiri.</span>
                  </div>
                  <div className="no-row-hover mt-3 max-h-[60vh] overflow-auto rounded-lg border border-line">
                    <table className="w-full min-w-[960px] text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
                        <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2 text-left">Barang</th><th className="px-2 py-2">Satuan</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2 text-right">Harga Beli</th><th className="px-2 py-2 text-center">Persen</th><th className="px-2 py-2 text-right">Harga Jual</th><th className="px-2 py-2 text-right">Subtotal</th><th className="w-20"></th></tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? <tr><td colSpan={9} className="py-10 text-center text-muted">Belum ada barang. Cari barang di sebelah kiri lalu tekan Enter.</td></tr> : items.map((item, index) => (
                          <tr key={item.product.id} className={`border-t border-line ${justAdded?.id === item.product.id ? "bg-yellow-50" : ""}`}>
                            <td className="px-2 py-2 text-muted">{index + 1}</td>
                            <td className="min-w-[200px] px-2 py-2"><ProductInfo nama={item.product.nama} partNumber={item.product.partNumber || item.product.kode} partNumbersAlt={item.product.partNumbersAlt} merek={item.product.merek} kodePajak={item.product.kodePajak} kategori={item.product.kategori} /></td>
                            <td className="px-2 text-center">
                              {unitOptions(item.product, item.satuan).length > 1 ? (
                                <select
                                  className="h-12 rounded-lg border border-line bg-white px-2 text-sm font-semibold"
                                  value={item.satuan}
                                  onChange={(e) => changeUnit(index, e.target.value)}
                                >
                                  {unitOptions(item.product, item.satuan).map((unit) => (
                                    <option key={unit} value={unit}>{isAltUnit(item.product, unit) ? `${unit} (isi ${item.product.isiSatuanAlt} ${item.product.satuan})` : unit}</option>
                                  ))}
                                </select>
                              ) : item.satuan}
                            </td>
                            <td className="px-2">
                              <input
                                ref={(el) => { cellRefs.current[`q-${item.product.id}`] = el; }}
                                className="num h-12 w-24 rounded-lg border border-line text-center text-base selection:bg-amber-200 selection:text-slate-900"
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
                                className="num h-12 w-36 rounded-lg border border-line text-right text-base selection:bg-amber-200 selection:text-slate-900"
                                inputMode="numeric"
                                value={grouped(item.hargaBeli)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = cellRefs.current[`m-${item.product.id}`]; el?.focus(); el?.select(); } }}
                                onChange={(e) => { const hargaBeli = digits(e.target.value); patchItem(index, (row) => ({ ...row, hargaBeli, hargaJual: jualFromMarkup(hargaBeli, row.markup) || row.hargaJual })); }}
                              />
                            </td>
                            <td className="px-2">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  ref={(el) => { cellRefs.current[`m-${item.product.id}`] = el; }}
                                  className="num h-12 w-20 rounded-lg border border-line text-center text-base selection:bg-amber-200 selection:text-slate-900"
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={item.markup}
                                  onFocus={(e) => e.target.select()}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = cellRefs.current[`j-${item.product.id}`]; el?.focus(); el?.select(); } }}
                                  onChange={(e) => { const markup = e.target.value.replace(/[^\d.,]/g, ""); patchItem(index, (row) => ({ ...row, markup, hargaJual: jualFromMarkup(row.hargaBeli, markup) || row.hargaJual })); }}
                                />
                                <span className="text-sm font-semibold">%</span>
                              </div>
                            </td>
                            <td className="px-2">
                              <input
                                ref={(el) => { cellRefs.current[`j-${item.product.id}`] = el; }}
                                className="num h-12 w-36 rounded-lg border border-line text-right text-base selection:bg-amber-200 selection:text-slate-900"
                                inputMode="numeric"
                                placeholder="Tetap"
                                title="Kosong = harga jual barang tidak diubah"
                                value={item.hargaJual ? grouped(item.hargaJual) : ""}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchRef.current?.focus(); } }}
                                onChange={(e) => { const hargaJual = digits(e.target.value); patchItem(index, (row) => ({ ...row, hargaJual, markup: "" })); }}
                              />
                            </td>
                            <td className="num px-2 text-right font-semibold">{rupiah(item.qty * item.hargaBeli)}</td>
                            <td className="px-2 text-right"><ExpandGroup align="end"><ExpandButton type="button" variant="danger" label="Hapus" icon={<Trash2 />} onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} /></ExpandGroup></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
              </fieldset>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <span className="text-muted">{items.length} barang · {items.reduce((sum, item) => sum + item.qty, 0)} qty · Total</span>
                <b className="ml-2 text-lg">{rupiah(grandTotal)}</b>
              </div>
              <div className="flex justify-end gap-2">
                <button className="h-12 rounded-lg border border-line px-5" onClick={() => { setOpen(false); setEditingId(null); }}>{readOnly ? "Tutup" : "Batal"}</button>
                {!readOnly ? <PrimaryButton disabled={!invoiceNo.trim() || !formSupplierId || !items.length} onClick={() => {
                  const payload = { invoiceNo, supplierId: Number(formSupplierId), receivedAt, notes, items: items.map((item) => ({ productId: item.product.id, qty: item.qty, satuan: item.satuan, hargaBeli: item.hargaBeli, hargaJual: item.hargaJual })) };
                  const run = editingId ? updateSupplierReceipt({ data: { id: editingId, ...payload } }) : createSupplierReceipt({ data: payload });
                  void run
                    .then(() => { toast.success(editingId ? `Penerimaan ${invoiceNo} berhasil diubah` : `Barang masuk ${invoiceNo} berhasil disimpan`, { description: editingId ? "Stok disesuaikan." : "Stok barang bertambah." }); setOpen(false); resetForm(); setPage(1); load(1); })
                    .catch((error: Error) => toast.error(error.message));
                }}>{editingId ? "Simpan Perubahan" : "Simpan Barang Masuk"}</PrimaryButton> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
