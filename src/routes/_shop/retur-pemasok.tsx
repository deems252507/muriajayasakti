import { confirmDialog } from "@/lib/confirm";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { ExpandButton, ExpandGroup } from "@/components/ui/button-7";
import { Field, inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { PageBar } from "@/components/shop/page-bar";
import { createSupplierReturn, deleteSupplierReturn, listPartners, listReturnableLines, listSupplierReturns } from "@/lib/shop/api";
import { digits, grouped, rupiah, todayInput } from "@/lib/shop/format";
import { printSupplierReturn, shopBrand } from "@/lib/shop/print";
import type { Partner, ReturnableLine, SupplierReturn } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/retur-pemasok")({
  component: ReturPemasokPage,
  // ?faktur=ID: dibuka dari menu Barang Masuk Pemasok (tombol Retur), form langsung terisi barang dari faktur itu.
  validateSearch: (search: Record<string, unknown>): { faktur?: number } => {
    const n = Number(search.faktur);
    return { faktur: Number.isInteger(n) && n > 0 ? n : undefined };
  },
});

type Draft = { line: ReturnableLine; qty: number; satuan: string; dari: "toko" | "gudang"; alasan: string };

const ALASAN = ["Rusak / cacat", "Salah barang", "Salah pesan", "Kelebihan kirim", "Kadaluarsa", "Tidak laku"];

function fmtDate(iso: string) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

/** "3 bulan lalu": membantu memastikan faktur yang dipilih memang pembelian yang dimaksud. */
function ageText(iso: string) {
  const time = new Date(iso).getTime();
  if (!iso || Number.isNaN(time)) return "";
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days < 1) return "hari ini";
  if (days < 31) return `${days} hari lalu`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months} bulan lalu`;
  return `${Math.floor(months / 12)} tahun lalu`;
}

/** Satuan retur: satuan di faktur (mis. Dus) atau satuan dasar barang (mis. Pcs). */
function unitOptions(line: ReturnableLine) {
  const list = [line.satuan];
  if (line.satuanDasar && line.satuanDasar !== line.satuan) list.push(line.satuanDasar);
  return list;
}
function unitFactor(line: ReturnableLine, satuan: string) { return satuan === line.satuan ? line.factor : 1; }
/** Harga per satuan retur, mengikuti faktur asal (bukan diketik ulang). */
function unitPrice(line: ReturnableLine, satuan: string) { return satuan === line.satuan ? line.hargaBeli : Math.round(line.hargaBeli / Math.max(1, line.factor)); }
function maxQty(draft: Draft) { return Math.floor(draft.line.sisa / unitFactor(draft.line, draft.satuan)); }
function needBase(draft: Draft) { return draft.qty * unitFactor(draft.line, draft.satuan); }

/** 48 Pcs -> "48 Pcs (4 Dus)" bila satuan faktur lebih besar dari satuan dasar. */
function qtyText(base: number, line: ReturnableLine) {
  if (line.factor <= 1 || line.satuan === line.satuanDasar) return `${grouped(base)} ${line.satuanDasar}`;
  const big = Math.floor(base / line.factor);
  const rest = base % line.factor;
  const pack = big > 0 ? ` (${grouped(big)} ${line.satuan}${rest ? ` + ${grouped(rest)} ${line.satuanDasar}` : ""})` : "";
  return `${grouped(base)} ${line.satuanDasar}${pack}`;
}

function pickSource(line: ReturnableLine, base: number): "toko" | "gudang" {
  const need = Math.max(1, base);
  if (line.stokToko >= need) return "toko";
  if (line.stokGudang >= need) return "gudang";
  return line.stokToko <= 0 && line.stokGudang > 0 ? "gudang" : "toko";
}

function newDraft(line: ReturnableLine, qty: number): Draft {
  const satuan = line.sisa >= line.factor ? line.satuan : line.satuanDasar;
  return { line, qty, satuan, dari: pickSource(line, Math.max(1, qty) * unitFactor(line, satuan)), alasan: "" };
}

/** Tampilan surat retur (hanya untuk dilihat; Cetak membuat dokumen yang diserahkan ke pemasok). */
function ReturModal({ row, supplier, canEdit, onClose, onDelete }: { row: SupplierReturn; supplier?: Partner; canEdit: boolean; onClose: () => void; onDelete: () => void }) {
  const brand = shopBrand();
  const tanggal = row.returnedAt ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "long", year: "numeric" }).format(new Date(row.returnedAt)) : "-";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h3 className="text-lg font-extrabold">Retur Pembelian</h3>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white" onClick={() => { try { printSupplierReturn(row, supplier); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); } }}>Cetak</button>
            {canEdit ? <button type="button" className="h-10 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-700" onClick={onDelete}>Hapus</button> : null}
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
                <p className="text-xl font-bold">Retur Pembelian</p>
                <p className="mt-1 text-sm">No. Retur: <b className="font-mono">{row.returNo}</b></p>
                <p className="text-sm">Tanggal: <b>{tanggal}</b></p>
                {row.createdBy ? <p className="text-xs text-slate-600">Dibuat oleh: {row.createdBy}</p> : null}
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kepada (Pemasok)</p>
              <p className="text-base font-extrabold">{row.supplierName}</p>
              {supplier?.alamat ? <p className="text-xs text-slate-600">{supplier.alamat}</p> : null}
              {supplier?.telp ? <p className="text-xs text-slate-600">Telp: {supplier.telp}</p> : null}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                  <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2 text-left">Nama Barang</th><th className="px-2 py-2 text-left">Faktur Asal</th><th className="px-2 py-2 text-right">Kts</th><th className="px-2 py-2 text-right">@Harga</th><th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-left">Alasan</th></tr>
                </thead>
                <tbody>
                  {row.items.map((item, index) => (
                    <tr key={item.lineId} className="align-top">
                      <td className="px-2 py-2 text-muted">{index + 1}</td>
                      <td className="px-2 py-2">
                        <b className="block text-sm">{item.nama}</b>
                        <span className="block text-xs text-slate-600">PN: <span className="font-mono">{item.partNumber || "-"}</span>{item.merek ? ` · ${item.merek}` : ""}</span>
                        <span className="block text-[11px] text-muted">Diambil dari {item.dari === "gudang" ? "gudang" : "toko"}</span>
                      </td>
                      <td className="px-2 py-2"><span className="block font-mono text-xs font-bold">{item.invoiceNo}</span><span className="block text-[11px] text-muted">{fmtDate(item.receivedAt)}</span></td>
                      <td className="px-2 py-2 text-right font-semibold">{grouped(item.qty)} {item.satuan}</td>
                      <td className="num px-2 py-2 text-right">{rupiah(item.hargaBeli)}</td>
                      <td className="num px-2 py-2 text-right font-semibold">{rupiah(item.hargaBeli * item.qty)}</td>
                      <td className="px-2 py-2 text-xs">{item.alasan || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <div className="flex-1 text-sm"><p className="font-bold">Keterangan</p><p className="text-slate-700">{row.notes || "-"}</p></div>
              <div className="w-full rounded-lg border border-line sm:w-64">
                <div className="flex justify-between px-3 py-1.5 text-sm"><span>Total Qty</span><span>{grouped(row.totalQty)}</span></div>
                <div className="flex justify-between border-t-2 border-slate-800 px-3 py-2 text-base font-extrabold"><span>Total Retur</span><span className="num">{rupiah(row.totalValue)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReturPemasokPage() {
  const me = Route.useRouteContext().me;
  const { faktur: fakturParam } = Route.useSearch();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [rows, setRows] = useState<SupplierReturn[]>([]);
  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(15);
  const [viewing, setViewing] = useState<SupplierReturn | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formSupplierId, setFormSupplierId] = useState("");
  const [returnedAt, setReturnedAt] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [productQ, setProductQ] = useState("");
  const [hits, setHits] = useState<ReturnableLine[]>([]);
  const [searching, setSearching] = useState(false);
  const canEdit = me.role === "Admin";

  function load(nextPage = page) {
    void listSupplierReturns({ data: { q, supplierId: supplierId ? Number(supplierId) : 0, start, end, page: nextPage } })
      .then((res) => { setRows(res.items as SupplierReturn[]); setTotal(res.total); setPerPage(res.perPage); })
      .catch((error: Error) => toast.error(error.message));
  }

  useEffect(() => {
    void listPartners().then((all) => setSuppliers(all.filter((row) => row.tipe === "Supplier"))).catch((error: Error) => toast.error(error.message));
  }, []);
  useEffect(() => { load(page); }, [q, supplierId, start, end, page]);

  // Cari barang yang pernah dibeli. Tanpa pemasok dipilih: harus mengetik minimal 2 huruf (nama / part number / no. faktur).
  useEffect(() => {
    if (!open) return;
    const sid = formSupplierId ? Number(formSupplierId) : 0;
    if (!sid && productQ.trim().length < 2) { setHits([]); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void listReturnableLines({ data: { supplierId: sid, q: productQ } })
        .then((res) => { if (alive) setHits(res.items as ReturnableLine[]); })
        .catch((error: Error) => { if (alive) toast.error(error.message); })
        .finally(() => { if (alive) setSearching(false); });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, productQ, formSupplierId]);

  // Dibuka dari Barang Masuk Pemasok: isi form dengan semua barang faktur itu (qty 0 = belum diretur, Admin mengisi sendiri).
  useEffect(() => {
    if (!fakturParam) return;
    let alive = true;
    void listReturnableLines({ data: { receiptId: fakturParam } })
      .then((res) => {
        if (!alive) return;
        const lines = res.items as ReturnableLine[];
        if (!canEdit) toast.error("Hanya Admin yang dapat membuat retur.");
        else if (!lines.length) toast.error("Faktur tidak ditemukan. Mungkin sudah dihapus.");
        else {
          resetForm();
          setFormSupplierId(String(lines[0].supplierId));
          setItems(lines.filter((line) => line.sisa > 0).map((line) => newDraft(line, 0)));
          if (!lines.some((line) => line.sisa > 0)) toast.info(`Semua barang di faktur ${lines[0].invoiceNo} sudah diretur.`);
          setOpen(true);
        }
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => { if (alive) void navigate({ to: "/retur-pemasok", search: {}, replace: true }); });
    return () => { alive = false; };
  }, [fakturParam]);

  function resetForm() {
    setFormSupplierId("");
    setReturnedAt(todayInput());
    setNotes("");
    setItems([]);
    setProductQ("");
    setHits([]);
  }

  function addLine(line: ReturnableLine, qty = 1, silent = false) {
    if (line.sisa <= 0) { if (!silent) toast.error("Barang ini sudah habis diretur dari faktur tersebut."); return false; }
    if (items.length && formSupplierId && Number(formSupplierId) !== line.supplierId) {
      if (!silent) toast.error("Satu surat retur untuk satu pemasok. Barang dari pemasok lain dibuat di surat retur terpisah.");
      return false;
    }
    if (items.some((item) => item.line.lineId === line.lineId)) { if (!silent) toast.info("Barang dari faktur ini sudah ada di daftar retur."); return false; }
    if (!formSupplierId) setFormSupplierId(String(line.supplierId));
    setItems((prev) => (prev.some((item) => item.line.lineId === line.lineId) ? prev : [...prev, newDraft(line, qty)]));
    return true;
  }

  function addAll(lines: ReturnableLine[]) {
    const ok = lines.filter((line) => line.sisa > 0 && !items.some((item) => item.line.lineId === line.lineId));
    if (!ok.length) return;
    if (items.length && formSupplierId && Number(formSupplierId) !== ok[0].supplierId) {
      toast.error("Satu surat retur untuk satu pemasok. Barang dari pemasok lain dibuat di surat retur terpisah.");
      return;
    }
    if (!formSupplierId) setFormSupplierId(String(ok[0].supplierId));
    setItems((prev) => [...prev, ...ok.filter((line) => !prev.some((item) => item.line.lineId === line.lineId)).map((line) => newDraft(line, 0))]);
  }

  function patchItem(lineId: number, fn: (row: Draft) => Draft) {
    setItems((prev) => prev.map((row) => (row.line.lineId === lineId ? fn(row) : row)));
  }

  // Stok yang diminta per barang + sumber (toko/gudang). Barang yang sama dari dua faktur memakai stok yang sama.
  const needByStock = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.qty <= 0) continue;
      const key = `${item.line.productId}:${item.dari}`;
      map.set(key, (map.get(key) ?? 0) + needBase(item));
    }
    return map;
  }, [items]);

  function rowProblem(item: Draft) {
    if (item.qty <= 0) return "";
    const max = maxQty(item);
    if (item.qty > max) return max > 0 ? `Maksimal ${grouped(max)} ${item.satuan} (sisa dari faktur ${item.line.invoiceNo})` : `Pilih satuan ${item.line.satuanDasar}: sisa dari faktur ${grouped(item.line.sisa)} ${item.line.satuanDasar}`;
    const have = item.dari === "gudang" ? item.line.stokGudang : item.line.stokToko;
    const need = needByStock.get(`${item.line.productId}:${item.dari}`) ?? 0;
    if (need > have) return `Stok ${item.dari} hanya ${grouped(have)} ${item.line.satuanDasar}${item.dari === "toko" && item.line.stokGudang > 0 ? " (ada di gudang?)" : ""}`;
    return "";
  }

  const filled = items.filter((item) => item.qty > 0);
  const hasProblem = filled.some((item) => rowProblem(item) !== "");
  const grandTotal = filled.reduce((sum, item) => sum + item.qty * unitPrice(item.line, item.satuan), 0);
  const supplierName = suppliers.find((s) => String(s.id) === formSupplierId)?.nama ?? items[0]?.line.supplierName ?? "";

  // Hasil pencarian dikelompokkan per faktur: nama pemasok + no. faktur + tanggal selalu terlihat di atas barangnya.
  const groups = useMemo(() => {
    const list: Array<{ receiptId: number; invoiceNo: string; receivedAt: string; supplierName: string; lines: ReturnableLine[] }> = [];
    for (const hit of hits) {
      let group = list.find((g) => g.receiptId === hit.receiptId);
      if (!group) { group = { receiptId: hit.receiptId, invoiceNo: hit.invoiceNo, receivedAt: hit.receivedAt, supplierName: hit.supplierName, lines: [] }; list.push(group); }
      group.lines.push(hit);
    }
    return list;
  }, [hits]);

  async function removeReturn(row: SupplierReturn) {
    if (!(await confirmDialog(`Hapus retur ${row.returNo}? Barang yang diretur dikembalikan ke stok (toko / gudang) seperti sebelum diretur.`, { title: "Hapus retur?", danger: true }))) return;
    void deleteSupplierReturn({ data: { id: row.id } })
      .then(() => { toast.success(`Retur ${row.returNo} dihapus`, { description: "Stok dikembalikan." }); setViewing(null); load(page); })
      .catch((error: Error) => toast.error(error.message));
  }

  function save() {
    if (busy) return;
    setBusy(true);
    void createSupplierReturn({
      data: {
        supplierId: Number(formSupplierId),
        returnedAt,
        notes,
        items: filled.map((item) => ({ receiptLineId: item.line.lineId, qty: item.qty, satuan: item.satuan, dari: item.dari, alasan: item.alasan })),
      },
    })
      .then(async (res) => {
        toast.success(`Retur ${res.returNo} tersimpan`, { description: "Stok sudah dikurangi. Surat retur siap dicetak." });
        setOpen(false);
        resetForm();
        setPage(1);
        load(1);
        const made = await listSupplierReturns({ data: { id: res.id } }).catch(() => null);
        const row = made?.items?.[0] as SupplierReturn | undefined;
        if (row) setViewing(row);
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setBusy(false));
  }

  if (me.role === "Kasir") return <Panel><p>Halaman Retur ke Pemasok hanya untuk Admin.</p></Panel>;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Transaksi & Persediaan</p>
            <h2 className="text-xl font-extrabold">Retur ke Pemasok</h2>
            <p className="mt-1 text-sm text-muted">Barang dikembalikan ke pemasok dan dicatat terhadap faktur pembeliannya. Stok otomatis berkurang setelah disimpan.</p>
          </div>
          {canEdit ? <ExpandGroup align="end" className="self-start"><ExpandButton size="md" variant="primary" label="Retur Baru" icon={<Plus />} onClick={() => { resetForm(); setOpen(true); }} /></ExpandGroup> : null}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
          <input className={inputClass} placeholder="Cari no. retur, faktur, pemasok, atau barang" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          <select className={inputClass} value={supplierId} onChange={(e) => { setPage(1); setSupplierId(e.target.value); }}>
            <option value="">Semua pemasok</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
          <input className={inputClass} type="date" value={start} onChange={(e) => { setPage(1); setStart(e.target.value); }} />
          <input className={inputClass} type="date" value={end} onChange={(e) => { setPage(1); setEnd(e.target.value); }} />
          <ExpandGroup align="start" className="self-start"><ExpandButton size="md" label="Reset" icon={<RotateCcw />} onClick={() => { setQ(""); setSupplierId(""); setStart(""); setEnd(""); setPage(1); }} /></ExpandGroup>
        </div>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            <tr><th className="px-2 py-3">Tanggal</th><th className="px-2 py-3">Pemasok</th><th className="px-2 py-3">No. Retur</th><th className="px-2 py-3">Barang</th><th className="px-2 py-3">Faktur Asal</th><th className="px-2 py-3 text-center">Qty</th><th className="px-2 py-3 text-right">Nilai</th><th className="px-2 py-3">Dibuat Oleh</th><th className="px-2 py-3">Aksi</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={9} className="py-8 text-center text-muted">Belum ada retur ke pemasok sesuai filter.</td></tr> : null}
            {rows.map((row) => {
              const invoices = [...new Set(row.items.map((item) => item.invoiceNo))];
              return (
                <tr key={row.id} className="cursor-pointer border-t border-line align-top" title="Klik baris untuk melihat surat retur" onClick={() => { if (!window.getSelection()?.toString()) setViewing(row); }}>
                  <td className="px-2 py-3 whitespace-nowrap">{new Date(row.returnedAt).toLocaleDateString("id-ID")}</td>
                  <td className="px-2 py-3 font-semibold">{row.supplierName}</td>
                  <td className="px-2 py-3 font-mono text-xs font-bold">{row.returNo}</td>
                  <td className="max-w-[320px] px-2 py-3">
                    {row.items[0] ? (
                      <div className="leading-snug">
                        <p className="truncate text-sm font-bold" title={row.items.map((i) => i.nama).join("\n")}>{row.items[0].nama}</p>
                        <p className="truncate text-xs text-slate-600">PN: <span className="font-mono">{row.items[0].partNumber || "-"}</span></p>
                        {row.items.length > 1 ? <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">+{row.items.length - 1} barang lainnya</span> : null}
                      </div>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-3 font-mono text-xs font-semibold">{invoices.slice(0, 2).join(", ")}{invoices.length > 2 ? ` +${invoices.length - 2}` : ""}</td>
                  <td className="px-2 py-3 text-center font-semibold">{grouped(row.totalQty)}</td>
                  <td className="num px-2 py-3 text-right font-semibold">{rupiah(row.totalValue)}</td>
                  <td className="px-2 py-3 text-xs">{row.createdBy || "-"}</td>
                  <td className="px-2 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <ExpandGroup align="start">
                      <ExpandButton label="Cetak" icon={<Printer />} onClick={() => { try { printSupplierReturn(row, suppliers.find((s) => s.id === row.supplierId)); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); } }} />
                      {canEdit ? <ExpandButton variant="danger" label="Hapus" icon={<Trash2 />} onClick={() => void removeReturn(row)} /> : null}
                    </ExpandGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <PageBar page={page} total={total} perPage={perPage} unit="retur" onPage={setPage} />
      </Panel>

      {viewing ? (
        <ReturModal
          row={viewing}
          supplier={suppliers.find((s) => s.id === viewing.supplierId)}
          canEdit={canEdit}
          onClose={() => setViewing(null)}
          onDelete={() => void removeReturn(viewing)}
        />
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex bg-ink/40 p-2 sm:p-4">
          <div className="mx-auto flex h-full max-h-[96vh] w-full max-w-[1500px] flex-col rounded-2xl bg-panel shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold">Retur Barang ke Pemasok</h3>
                <p className="text-sm text-muted">Pilih barang dari faktur pembeliannya. Jumlah retur tidak bisa melebihi sisa yang dibeli di faktur itu.</p>
              </div>
              <button className="h-11 rounded-lg border border-line px-4 text-sm font-medium" onClick={() => setOpen(false)}>Tutup</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Pemasok">
                  <select className={inputClass} value={formSupplierId} disabled={items.length > 0} onChange={(e) => setFormSupplierId(e.target.value)} title={items.length ? "Kosongkan daftar retur dulu untuk mengganti pemasok" : ""}>
                    <option value="">Semua pemasok (terisi otomatis dari barang pertama)</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
                  </select>
                </Field>
                <Field label="Tanggal Retur *"><input className={inputClass} type="date" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} /></Field>
                <Field label="Keterangan"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" /></Field>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(360px,1fr)_2fr]">
                <section className="rounded-xl border border-line bg-slate-50 p-4">
                  <h4 className="text-base font-extrabold">1. Cari Barang yang Pernah Dibeli</h4>
                  <input
                    className="mt-3 h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:border-blue-500"
                    placeholder="Ketik nama barang / part number / no. faktur"
                    value={productQ}
                    onChange={(e) => setProductQ(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-muted">Tiap hasil menampilkan pemasok, no. faktur, dan tanggal belinya. Kalau barang yang sama pernah dibeli dari beberapa pemasok, pilih faktur yang sesuai dengan barang fisiknya.</p>
                  <div className="mt-3 max-h-[56vh] overflow-y-auto rounded-lg border border-line bg-white">
                    {!formSupplierId && productQ.trim().length < 2 ? <p className="px-3 py-6 text-center text-sm text-muted">Ketik minimal 2 huruf, atau pilih pemasok untuk melihat semua pembeliannya.</p> : null}
                    {(formSupplierId || productQ.trim().length >= 2) && !searching && hits.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">Tidak ada pembelian yang cocok.</p> : null}
                    {groups.map((group) => (
                      <div key={group.receiptId} className="border-b border-line last:border-b-0">
                        <div className="flex items-start justify-between gap-2 bg-slate-100 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold">{group.supplierName}</p>
                            <p className="text-xs text-slate-600"><span className="font-mono font-bold">{group.invoiceNo}</span> · {fmtDate(group.receivedAt)} <span className="text-muted">({ageText(group.receivedAt)})</span></p>
                          </div>
                          {group.lines.filter((line) => line.sisa > 0).length > 1 ? (
                            <button type="button" className="shrink-0 rounded-lg border border-line bg-white px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50" onClick={() => addAll(group.lines)}>Tambah semua</button>
                          ) : null}
                        </div>
                        {group.lines.map((line) => {
                          const added = items.some((item) => item.line.lineId === line.lineId);
                          return (
                            <div key={line.lineId} className="flex items-start justify-between gap-3 border-t border-line px-3 py-3">
                              <div className="min-w-0 leading-snug">
                                <p className="text-sm font-semibold"><Mark text={line.nama} q={productQ} /></p>
                                <p className="mt-0.5 text-xs text-muted">
                                  {line.kodePajak ? <span className="mr-1 rounded bg-slate-200 px-1.5 py-px font-mono font-bold text-slate-800">[{line.kodePajak}]</span> : null}
                                  PN: <Mark text={line.partNumber || "-"} q={productQ} />{line.merek ? ` · ${line.merek}` : ""}
                                </p>
                                <p className="mt-1 text-xs text-slate-700">Dibeli <b>{grouped(line.qty)} {line.satuan}</b> @ {rupiah(line.hargaBeli)} · sudah diretur {qtyText(line.sudahRetur, line)}</p>
                                <p className={`text-xs font-bold ${line.sisa > 0 ? "text-emerald-700" : "text-red-600"}`}>Sisa bisa diretur: {qtyText(line.sisa, line)}</p>
                                {line.selisih > 0 ? <p className="text-[11px] text-amber-700">Selisih {grouped(line.selisih)} {line.satuanDasar} sudah tercatat saat barang masuk (tidak ikut diretur di sini).</p> : null}
                                <p className="text-[11px] text-muted">Stok sekarang: toko {grouped(line.stokToko)} · gudang {grouped(line.stokGudang)} {line.satuanDasar}</p>
                              </div>
                              {added ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Sudah ditambah</span>
                                : line.sisa <= 0 ? <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600">Habis diretur</span>
                                : <button type="button" className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white" onClick={() => addLine(line)}>Tambah</button>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-base font-extrabold">2. Isi Retur <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{filled.length} barang</span></h4>
                    <span className="text-base font-extrabold">{rupiah(grandTotal)}</span>
                  </div>
                  {supplierName ? <p className="mt-1 text-sm text-slate-700">Kepada: <b>{supplierName}</b></p> : null}
                  <div className="no-row-hover mt-3 max-h-[60vh] overflow-auto rounded-lg border border-line">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
                        <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2 text-left">Barang & Faktur Asal</th><th className="px-2 py-2">Satuan</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2 text-left">Diambil dari</th><th className="px-2 py-2 text-left">Alasan</th><th className="px-2 py-2 text-right">Subtotal</th><th className="w-14"></th></tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? <tr><td colSpan={8} className="py-10 text-center text-muted">Belum ada barang. Cari barang di sebelah kiri lalu klik Tambah.</td></tr> : items.map((item, index) => {
                          const problem = rowProblem(item);
                          const max = maxQty(item);
                          return (
                            <tr key={item.line.lineId} className={`border-t border-line align-top ${item.qty <= 0 ? "bg-amber-50" : ""}`}>
                              <td className="px-2 py-3 text-muted">{index + 1}</td>
                              <td className="min-w-[240px] px-2 py-3 leading-snug">
                                <b className="block text-sm">{item.line.nama}</b>
                                <span className="block text-xs text-slate-600">PN: <span className="font-mono font-semibold">{item.line.partNumber || "-"}</span>{item.line.merek ? ` · ${item.line.merek}` : ""}</span>
                                <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">Faktur <b className="font-mono">{item.line.invoiceNo}</b> · {fmtDate(item.line.receivedAt)} · sisa {qtyText(item.line.sisa, item.line)}</span>
                                {problem ? <span className="mt-1 block text-xs font-bold text-red-600">{problem}</span> : null}
                                {item.qty <= 0 ? <span className="mt-1 block text-xs font-semibold text-amber-700">Isi qty. Baris dengan qty 0 tidak ikut diretur.</span> : null}
                              </td>
                              <td className="px-2 py-3 text-center">
                                {unitOptions(item.line).length > 1 ? (
                                  <select className="h-12 rounded-lg border border-line bg-white px-2 text-sm font-semibold" value={item.satuan} onChange={(e) => {
                                    const satuan = e.target.value;
                                    patchItem(item.line.lineId, (row) => ({ ...row, satuan, qty: Math.min(row.qty, Math.max(0, Math.floor(row.line.sisa / unitFactor(row.line, satuan)))) }));
                                  }}>
                                    {unitOptions(item.line).map((unit) => <option key={unit} value={unit}>{unit === item.line.satuan && item.line.factor > 1 ? `${unit} (isi ${item.line.factor} ${item.line.satuanDasar})` : unit}</option>)}
                                  </select>
                                ) : item.satuan}
                              </td>
                              <td className="px-2 py-3">
                                <input
                                  className={`num h-12 w-24 rounded-lg border text-center text-base selection:bg-amber-200 selection:text-slate-900 ${item.qty > max ? "border-red-400 bg-red-50" : "border-line"}`}
                                  inputMode="numeric"
                                  value={item.qty}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => { const qty = digits(e.target.value); patchItem(item.line.lineId, (row) => ({ ...row, qty })); }}
                                />
                                <span className="mt-1 block text-center text-[11px] text-muted">maks {grouped(max)}</span>
                              </td>
                              <td className="px-2 py-3">
                                <select className="h-12 w-44 rounded-lg border border-line bg-white px-2 text-sm" value={item.dari} onChange={(e) => patchItem(item.line.lineId, (row) => ({ ...row, dari: e.target.value === "gudang" ? "gudang" : "toko" }))}>
                                  <option value="toko">Toko (stok {grouped(item.line.stokToko)})</option>
                                  <option value="gudang">Gudang (stok {grouped(item.line.stokGudang)})</option>
                                </select>
                              </td>
                              <td className="px-2 py-3">
                                <input className="h-12 w-44 rounded-lg border border-line px-2 text-sm" list="alasan-retur" placeholder="Mis. rusak" value={item.alasan} onChange={(e) => patchItem(item.line.lineId, (row) => ({ ...row, alasan: e.target.value }))} />
                              </td>
                              <td className="num px-2 py-3 text-right font-semibold">{rupiah(item.qty * unitPrice(item.line, item.satuan))}<span className="block text-[11px] font-normal text-muted">@ {rupiah(unitPrice(item.line, item.satuan))}</span></td>
                              <td className="px-2 py-3 text-right"><ExpandGroup align="end"><ExpandButton type="button" variant="danger" label="Hapus" icon={<Trash2 />} onClick={() => setItems((prev) => prev.filter((row) => row.line.lineId !== item.line.lineId))} /></ExpandGroup></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <datalist id="alasan-retur">{ALASAN.map((text) => <option key={text} value={text} />)}</datalist>
                  </div>
                </section>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <span className="text-muted">{filled.length} barang · {grouped(filled.reduce((sum, item) => sum + item.qty, 0))} qty · Total</span>
                <b className="ml-2 text-lg">{rupiah(grandTotal)}</b>
                {items.length > filled.length ? <span className="ml-3 text-xs font-semibold text-amber-700">{items.length - filled.length} baris qty 0 diabaikan</span> : null}
              </div>
              <div className="flex justify-end gap-2">
                <button className="h-12 rounded-lg border border-line px-5" onClick={() => setOpen(false)}>Batal</button>
                <PrimaryButton disabled={busy || !formSupplierId || filled.length === 0 || hasProblem} onClick={save}>{busy ? "Menyimpan..." : "Simpan Retur"}</PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
