import { confirmDialog } from "@/lib/confirm";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { ExpandButton, ExpandGroup } from "@/components/ui/button-7";
import { Field, inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { PageBar, useIsWide } from "@/components/shop/page-bar";
import { PembelianTabs } from "@/components/shop/pembelian-tabs";
import { createSupplierReturn, deleteSupplierReturn, listPartners, listReturnableLines, listSupplierReceipts, listSupplierReturns } from "@/lib/shop/api";
import { digits, grouped, rupiah, todayInput } from "@/lib/shop/format";
import { printSupplierReturn, shopBrand } from "@/lib/shop/print";
import type { Partner, ReturnableLine, SupplierReceipt, SupplierReturn } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/retur-pemasok")({
  component: ReturPemasokPage,
  // ?faktur=ID: dibuka dari menu Barang Masuk Pemasok (tombol Retur), form langsung terisi barang dari faktur itu.
  validateSearch: (search: Record<string, unknown>): { faktur?: number } => {
    const n = Number(search.faktur);
    return { faktur: Number.isInteger(n) && n > 0 ? n : undefined };
  },
});

type Draft = { line: ReturnableLine; qty: number; satuan: string; dari: "toko" | "gudang"; alasan: string };

/** Jumlah faktur per halaman di pemilih faktur (harus sama dengan perPage di server: 15). */
const FAKTUR_PER_PAGE = 15;

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
  const fakturs = [...new Map(row.items.map((item) => [item.invoiceNo, item.receivedAt])).entries()];
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kepada (Pemasok)</p>
                <p className="text-base font-extrabold">{row.supplierName}</p>
                {supplier?.alamat ? <p className="text-xs text-slate-600">{supplier.alamat}</p> : null}
                {supplier?.telp ? <p className="text-xs text-slate-600">Telp: {supplier.telp}</p> : null}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Retur dari Faktur Pembelian</p>
                {fakturs.map(([no, at]) => (
                  <p key={no} className="flex flex-wrap items-center gap-x-2"><b className="font-mono text-base">{no}</b><span className="text-xs text-slate-600">{fmtDate(at)}</span></p>
                ))}
                <Link to="/pemasok" search={{ inv: fakturs[0]?.[0] }} className="mt-1 inline-block text-xs font-bold text-blue-700 underline">Lihat faktur pembelian</Link>
              </div>
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
  const wide = useIsWide();
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
  // Form retur: pemasok -> faktur -> barang di faktur itu. Satu surat retur = satu faktur, supaya jelas asalnya.
  const [formSupplierId, setFormSupplierId] = useState("");
  const [returnedAt, setReturnedAt] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [fakturQ, setFakturQ] = useState("");
  const [fakturs, setFakturs] = useState<SupplierReceipt[]>([]);
  const [fakturPage, setFakturPage] = useState(1);
  const [fakturTotal, setFakturTotal] = useState(0);
  const [fakturBusy, setFakturBusy] = useState(false);
  const [chosen, setChosen] = useState<{ receiptId: number; invoiceNo: string; receivedAt: string; supplierName: string } | null>(null);
  const [items, setItems] = useState<Draft[]>([]);
  const [fullLines, setFullLines] = useState<ReturnableLine[]>([]);
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

  // Daftar faktur milik pemasok yang dipilih (bisa disaring dengan no. faktur atau nama barang). Dimuat 15 per halaman.
  useEffect(() => {
    if (!open || !formSupplierId || chosen) { if (!formSupplierId) { setFakturs([]); setFakturTotal(0); } return; }
    let alive = true;
    setFakturBusy(true);
    const timer = setTimeout(() => {
      void listSupplierReceipts({ data: { supplierId: Number(formSupplierId), q: fakturQ, page: fakturPage } })
        .then((res) => {
          if (!alive) return;
          const list = res.items as SupplierReceipt[];
          setFakturs(list);
          setFakturTotal(res.total);
        })
        .catch((error: Error) => { if (alive) toast.error(error.message); })
        .finally(() => { if (alive) setFakturBusy(false); });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, formSupplierId, fakturQ, fakturPage, chosen]);

  // Pilih faktur: tampilkan SEMUA barang di faktur itu beserta sisa yang masih boleh diretur.
  function pickFaktur(receiptId: number, fromLink = false) {
    setFakturBusy(true);
    void listReturnableLines({ data: { receiptId } })
      .then((res) => {
        const lines = res.items as ReturnableLine[];
        if (!lines.length) { toast.error("Faktur tidak ditemukan. Mungkin sudah dihapus."); return; }
        const first = lines[0];
        if (fromLink) setFormSupplierId(String(first.supplierId));
        setChosen({ receiptId, invoiceNo: first.invoiceNo, receivedAt: first.receivedAt, supplierName: first.supplierName });
        setFullLines(lines);
        setItems(lines.filter((line) => line.sisa > 0).map((line) => newDraft(line, 0)));
        if (!lines.some((line) => line.sisa > 0)) toast.info(`Semua barang di faktur ${first.invoiceNo} sudah diretur.`);
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setFakturBusy(false));
  }

  // Dibuka dari tab Faktur Pembelian (tombol Retur): langsung masuk ke faktur itu.
  useEffect(() => {
    if (!fakturParam) return;
    if (!canEdit) { toast.error("Hanya Admin yang dapat membuat retur."); void navigate({ to: "/retur-pemasok", search: {}, replace: true }); return; }
    resetForm();
    setOpen(true);
    pickFaktur(fakturParam, true);
    void navigate({ to: "/retur-pemasok", search: {}, replace: true });
  }, [fakturParam]);

  function resetForm() {
    setFormSupplierId("");
    setReturnedAt(todayInput());
    setNotes("");
    setItems([]);
    setFullLines([]);
    setChosen(null);
    setFakturQ("");
    setFakturs([]);
    setFakturPage(1);
    setFakturTotal(0);
  }

  function backToFakturList() {
    setChosen(null);
    setItems([]);
    setFullLines([]);
    setFakturPage(1);
  }

  function patchItem(lineId: number, fn: (row: Draft) => Draft) {
    setItems((prev) => prev.map((row) => (row.line.lineId === lineId ? fn(row) : row)));
  }

  // Isi semua barang dengan sisa maksimal (satuan terbesar yang pas), lalu Admin tinggal mengurangi yang tidak diretur.
  function fillAll() {
    setItems((prev) => prev.map((row) => {
      const satuan = row.line.sisa >= row.line.factor ? row.line.satuan : row.line.satuanDasar;
      const next: Draft = { ...row, satuan, qty: Math.floor(row.line.sisa / unitFactor(row.line, satuan)) };
      return { ...next, dari: pickSource(row.line, needBase(next)) };
    }));
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
  const habis = fullLines.filter((line) => line.sisa <= 0);

  async function removeReturn(row: SupplierReturn) {
    if (!(await confirmDialog(`Hapus retur ${row.returNo}? Barang yang diretur dikembalikan ke stok (toko / gudang) seperti sebelum diretur.`, { title: "Hapus retur?", danger: true }))) return;
    void deleteSupplierReturn({ data: { id: row.id } })
      .then(() => { toast.success(`Retur ${row.returNo} dihapus`, { description: "Stok dikembalikan." }); setViewing(null); load(page); })
      .catch((error: Error) => toast.error(error.message));
  }

  function save() {
    if (busy || !chosen) return;
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
        toast.success(`Retur ${res.returNo} tersimpan`, { description: `Stok sudah dikurangi dan faktur ${chosen.invoiceNo} dicatat ada retur. Surat retur siap dicetak.` });
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

  function printRow(row: SupplierReturn) {
    try { printSupplierReturn(row, suppliers.find((s) => s.id === row.supplierId)); } catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
  }

  if (me.role === "Kasir") return <Panel><p>Halaman Retur ke Pemasok hanya untuk Admin.</p></Panel>;

  // Bagian isian satu barang: dipakai di tampilan tabel (layar lebar) dan kartu (HP). Fungsi biasa (bukan komponen) supaya kolom isian tidak hilang fokus tiap ketikan.
  function qtyControls(item: Draft) {
    const max = maxQty(item);
    const h = "h-12";
    return (
      <>
        {unitOptions(item.line).length > 1 ? (
          <select className={`${h} rounded-lg border border-line bg-white px-2 text-sm font-semibold`} aria-label="Satuan retur" value={item.satuan} onChange={(e) => {
            const satuan = e.target.value;
            patchItem(item.line.lineId, (row) => ({ ...row, satuan, qty: Math.min(row.qty, Math.max(0, Math.floor(row.line.sisa / unitFactor(row.line, satuan)))) }));
          }}>
            {unitOptions(item.line).map((unit) => <option key={unit} value={unit}>{unit === item.line.satuan && item.line.factor > 1 ? `${unit} (isi ${item.line.factor} ${item.line.satuanDasar})` : unit}</option>)}
          </select>
        ) : <span className="text-sm font-semibold">{item.satuan}</span>}
        <div className="flex items-center gap-2">
          <input
            className={`num ${h} w-24 rounded-lg border text-center text-base selection:bg-amber-200 selection:text-slate-900 ${item.qty > max ? "border-red-400 bg-red-50" : "border-line"}`}
            inputMode="numeric"
            aria-label="Jumlah retur"
            value={item.qty}
            onFocus={(e) => e.target.select()}
            onChange={(e) => { const qty = digits(e.target.value); patchItem(item.line.lineId, (row) => ({ ...row, qty })); }}
          />
          <button type="button" className="h-12 rounded-lg border border-line bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50" onClick={() => patchItem(item.line.lineId, (row) => ({ ...row, qty: maxQty(row), dari: pickSource(row.line, maxQty(row) * unitFactor(row.line, row.satuan)) }))}>Maks {grouped(max)}</button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PembelianTabs active="retur" returCount={total || undefined} />
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Pembelian</p>
            <h2 className="text-xl font-extrabold">Retur Pembelian</h2>
            <p className="mt-1 text-sm text-muted">Barang dikembalikan ke pemasok dan dicatat terhadap faktur pembeliannya. Stok otomatis berkurang dan faktur pembelian ikut menunjukkan jumlah retur.</p>
          </div>
          {canEdit ? <ExpandGroup align="end" className="self-start"><ExpandButton size="md" variant="primary" label="Retur Baru" icon={<Plus />} onClick={() => { resetForm(); setOpen(true); }} /></ExpandGroup> : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input className={`${inputClass} sm:col-span-2 lg:col-span-1`} placeholder="Cari no. retur, faktur, pemasok, atau barang" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          <select className={inputClass} value={supplierId} onChange={(e) => { setPage(1); setSupplierId(e.target.value); }}>
            <option value="">Semua pemasok</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
          <input className={inputClass} type="date" aria-label="Dari tanggal" value={start} onChange={(e) => { setPage(1); setStart(e.target.value); }} />
          <input className={inputClass} type="date" aria-label="Sampai tanggal" value={end} onChange={(e) => { setPage(1); setEnd(e.target.value); }} />
          <ExpandGroup align="start" className="self-start"><ExpandButton size="md" label="Reset" icon={<RotateCcw />} onClick={() => { setQ(""); setSupplierId(""); setStart(""); setEnd(""); setPage(1); }} /></ExpandGroup>
        </div>
      </Panel>

      <Panel className="overflow-x-auto">
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted">Belum ada retur ke pemasok sesuai filter.</p> : null}
        {rows.length > 0 && !wide ? (
          <div className="space-y-3">
            {rows.map((row) => {
              const invoices = [...new Set(row.items.map((item) => item.invoiceNo))];
              return (
                <div key={row.id} role="button" tabIndex={0} className="rounded-xl border border-line bg-white p-3 active:bg-blue-50" onClick={() => setViewing(row)} onKeyDown={(e) => { if (e.key === "Enter") setViewing(row); }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{row.supplierName}</p>
                      <p className="font-mono text-xs font-bold text-slate-600">{row.returNo} · {new Date(row.returnedAt).toLocaleDateString("id-ID")}</p>
                    </div>
                    <p className="num shrink-0 text-sm font-extrabold">{rupiah(row.totalValue)}</p>
                  </div>
                  <p className="mt-1 text-xs"><span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">Dari faktur {invoices.slice(0, 2).join(", ")}{invoices.length > 2 ? ` +${invoices.length - 2}` : ""}</span></p>
                  {row.items[0] ? <p className="mt-2 truncate text-sm font-semibold">{row.items[0].nama}{row.items.length > 1 ? <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">+{row.items.length - 1} lainnya</span> : null}</p> : null}
                  <div className="mt-2 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-muted">{grouped(row.totalQty)} qty · {row.createdBy || "-"}</span>
                    <div className="flex gap-2">
                      <button type="button" className="h-10 rounded-lg border border-line px-3 text-xs font-bold" onClick={() => printRow(row)}>Cetak</button>
                      {canEdit ? <button type="button" className="h-10 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700" onClick={() => void removeReturn(row)}>Hapus</button> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {rows.length > 0 && wide ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
              <tr><th className="px-2 py-3">Tanggal</th><th className="px-2 py-3">Pemasok</th><th className="px-2 py-3">No. Retur</th><th className="px-2 py-3">Faktur Asal</th><th className="px-2 py-3">Barang</th><th className="px-2 py-3 text-center">Qty</th><th className="px-2 py-3 text-right">Nilai</th><th className="px-2 py-3">Dibuat Oleh</th><th className="px-2 py-3">Aksi</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const invoices = [...new Set(row.items.map((item) => item.invoiceNo))];
                return (
                  <tr key={row.id} className="cursor-pointer border-t border-line align-top" title="Klik baris untuk melihat surat retur" onClick={() => { if (!window.getSelection()?.toString()) setViewing(row); }}>
                    <td className="px-2 py-3 whitespace-nowrap">{new Date(row.returnedAt).toLocaleDateString("id-ID")}</td>
                    <td className="px-2 py-3 font-semibold">{row.supplierName}</td>
                    <td className="px-2 py-3 font-mono text-xs font-bold">{row.returNo}</td>
                    <td className="px-2 py-3 font-mono text-xs font-semibold"><span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{invoices.slice(0, 2).join(", ")}{invoices.length > 2 ? ` +${invoices.length - 2}` : ""}</span></td>
                    <td className="max-w-[300px] px-2 py-3">
                      {row.items[0] ? (
                        <div className="leading-snug">
                          <p className="truncate text-sm font-bold" title={row.items.map((i) => i.nama).join("\n")}>{row.items[0].nama}</p>
                          <p className="truncate text-xs text-slate-600">PN: <span className="font-mono">{row.items[0].partNumber || "-"}</span></p>
                          {row.items.length > 1 ? <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">+{row.items.length - 1} barang lainnya</span> : null}
                        </div>
                      ) : "-"}
                    </td>
                    <td className="px-2 py-3 text-center font-semibold">{grouped(row.totalQty)}</td>
                    <td className="num px-2 py-3 text-right font-semibold">{rupiah(row.totalValue)}</td>
                    <td className="px-2 py-3 text-xs">{row.createdBy || "-"}</td>
                    <td className="px-2 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <ExpandGroup align="start">
                        <ExpandButton label="Cetak" icon={<Printer />} onClick={() => printRow(row)} />
                        {canEdit ? <ExpandButton variant="danger" label="Hapus" icon={<Trash2 />} onClick={() => void removeReturn(row)} /> : null}
                      </ExpandGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
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
        <div className="fixed inset-0 z-50 flex bg-ink/40 p-0 sm:p-4">
          <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col bg-panel shadow-2xl sm:max-h-[96vh] sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold sm:text-xl">Retur Barang ke Pemasok</h3>
                <p className="text-xs text-muted sm:text-sm">Pilih pemasok, pilih faktur pembeliannya, lalu isi jumlah barang yang diretur. Satu surat retur untuk satu faktur.</p>
              </div>
              <button className="h-11 shrink-0 rounded-lg border border-line px-4 text-sm font-medium" onClick={() => setOpen(false)}>Tutup</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="1. Pemasok *">
                  <select className={inputClass} value={formSupplierId} disabled={Boolean(chosen)} onChange={(e) => { setFormSupplierId(e.target.value); setFakturPage(1); setFakturQ(""); }} title={chosen ? "Klik Ganti faktur dulu untuk mengganti pemasok" : ""}>
                    <option value="">Pilih pemasok</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
                  </select>
                </Field>
                <Field label="Tanggal Retur *"><input className={inputClass} type="date" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} /></Field>
                <div className="sm:col-span-2 lg:col-span-1"><Field label="Keterangan"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" /></Field></div>
              </div>

              {/* 2. Pilih faktur */}
              {!chosen ? (
                <section className="mt-5 rounded-xl border border-line bg-slate-50 p-3 sm:p-4">
                  <h4 className="text-base font-extrabold">2. Pilih Faktur Pembelian</h4>
                  {!formSupplierId ? <p className="mt-3 rounded-lg border border-dashed border-line bg-white px-3 py-6 text-center text-sm text-muted">Pilih pemasok dulu. Semua faktur pembelian pemasok itu akan muncul di sini.</p> : (
                    <>
                      <input
                        className="mt-3 h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:border-blue-500"
                        placeholder="Cari no. faktur atau nama barang (di pemasok ini)"
                        value={fakturQ}
                        onChange={(e) => { setFakturPage(1); setFakturQ(e.target.value); }}
                      />
                      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>{fakturTotal ? `Faktur ${(fakturPage - 1) * FAKTUR_PER_PAGE + 1}–${(fakturPage - 1) * FAKTUR_PER_PAGE + fakturs.length} dari ${fakturTotal}` : ""}</span>
                        <span className="text-muted">Klik satu faktur untuk memilih</span>
                      </div>
                      <div className={`mt-2 grid gap-3 md:grid-cols-2 ${fakturBusy && fakturs.length ? "opacity-60" : ""}`}>
                        {fakturs.map((row) => {
                          const shown = row.items.slice(0, 3);
                          const more = row.items.length - shown.length;
                          return (
                            <button key={row.id} type="button" disabled={fakturBusy} className="block w-full overflow-hidden rounded-xl border border-slate-300 bg-white text-left shadow-sm transition hover:border-blue-500 hover:bg-blue-50/40 hover:shadow disabled:cursor-wait" onClick={() => pickFaktur(row.id)}>
                              {/* Kepala: no. faktur + total */}
                              <div className="flex w-full items-start justify-between gap-3 border-b border-slate-200 bg-slate-100 px-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">No. Faktur</p>
                                  <p className="break-all font-mono text-base font-extrabold leading-tight text-blue-800"><Mark text={row.invoiceNo} q={fakturQ} /></p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</p>
                                  <p className="num text-sm font-extrabold">{rupiah(row.totalValue)}</p>
                                </div>
                              </div>
                              {/* Isi: daftar barang */}
                              <ul className="w-full space-y-0.5 px-3 py-2 text-xs text-slate-800">
                                {shown.map((it, i) => (
                                  <li key={i} className="flex gap-1.5"><span className="text-slate-400">•</span><span className="min-w-0 truncate"><Mark text={it.nama} q={fakturQ} /></span></li>
                                ))}
                                {more > 0 ? <li className="pl-3 font-semibold text-slate-500">+{more} barang lainnya</li> : null}
                              </ul>
                              {/* Kaki: tanggal, jumlah barang, status retur */}
                              <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-600">
                                <span>{fmtDate(row.receivedAt)} <span className="text-muted">({ageText(row.receivedAt)})</span></span>
                                <span className="flex items-center gap-2">
                                  <span className="font-semibold">{row.items.length} barang</span>
                                  {row.nRetur ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">↩ sudah ada {row.nRetur} retur</span> : null}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {fakturBusy && fakturs.length === 0 ? <p className="py-6 text-center text-sm text-muted">Memuat faktur...</p> : null}
                      {!fakturBusy && fakturs.length === 0 ? <p className="py-6 text-center text-sm text-muted">Tidak ada faktur pembelian yang cocok untuk pemasok ini.</p> : null}
                      {fakturTotal > FAKTUR_PER_PAGE ? (
                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
                          <button type="button" disabled={fakturBusy || fakturPage <= 1} className="h-11 rounded-lg border border-line bg-white px-3 text-sm font-bold text-blue-700 disabled:opacity-40 sm:px-4" onClick={() => setFakturPage((p) => Math.max(1, p - 1))}>← Sebelumnya</button>
                          <span className="text-center text-xs font-semibold text-slate-700 sm:text-sm">Hal {fakturPage} / {Math.ceil(fakturTotal / FAKTUR_PER_PAGE)}</span>
                          <button type="button" disabled={fakturBusy || fakturPage >= Math.ceil(fakturTotal / FAKTUR_PER_PAGE)} className="h-11 rounded-lg border border-line bg-white px-3 text-sm font-bold text-blue-700 disabled:opacity-40 sm:px-4" onClick={() => setFakturPage((p) => p + 1)}>Selanjutnya →</button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              ) : (
                <section className="mt-5 flex flex-col gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check className="size-4" /></span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Retur dari Faktur Pembelian</p>
                      <p className="text-base font-extrabold"><span className="font-mono">{chosen.invoiceNo}</span> <span className="text-sm font-semibold text-slate-700">· {chosen.supplierName}</span></p>
                      <p className="text-xs text-slate-700">{fmtDate(chosen.receivedAt)} ({ageText(chosen.receivedAt)}) · {fullLines.length} barang di faktur ini</p>
                    </div>
                  </div>
                  <button type="button" className="h-11 rounded-lg border border-emerald-400 bg-white px-4 text-sm font-bold text-emerald-800" onClick={() => { if (filled.length && !window.confirm("Isian retur akan dikosongkan. Ganti faktur?")) return; backToFakturList(); }}>Ganti faktur</button>
                </section>
              )}

              {/* 3. Barang di faktur */}
              {chosen ? (
                <section className="mt-5 rounded-xl border border-line bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-base font-extrabold">3. Isi Jumlah yang Diretur <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{filled.length} dari {items.length} barang</span></h4>
                    {items.length > 0 ? <button type="button" className="h-10 rounded-lg border border-line bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50" onClick={fillAll}>Retur semua sisa</button> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">Semua isi faktur ditampilkan. Kosongkan (0) barang yang tidak diretur; baris qty 0 tidak ikut disimpan.</p>

                  {items.length === 0 ? <p className="py-8 text-center text-sm text-muted">Semua barang di faktur ini sudah habis diretur.</p> : null}

                  {items.length > 0 && !wide ? (
                    <div className="mt-3 space-y-3">
                      {items.map((item, index) => {
                        const problem = rowProblem(item);
                        return (
                          <div key={item.line.lineId} className={`rounded-xl border p-3 ${item.qty > 0 ? "border-blue-300 bg-blue-50/40" : "border-line bg-white"}`}>
                            <p className="text-sm font-extrabold"><span className="mr-1 text-muted">{index + 1}.</span>{item.line.nama}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{item.line.kodePajak ? <span className="mr-1 rounded bg-slate-200 px-1.5 py-px font-mono font-bold text-slate-800">[{item.line.kodePajak}]</span> : null}PN: <span className="font-mono font-semibold">{item.line.partNumber || "-"}</span>{item.line.merek ? ` · ${item.line.merek}` : ""}</p>
                            <p className="mt-1 text-xs text-slate-700">Dibeli <b>{grouped(item.line.qty)} {item.line.satuan}</b> @ {rupiah(item.line.hargaBeli)} · sudah diretur {qtyText(item.line.sudahRetur, item.line)}</p>
                            <p className="text-xs font-bold text-emerald-700">Sisa bisa diretur: {qtyText(item.line.sisa, item.line)}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">{qtyControls(item)}</div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <select className="h-11 rounded-lg border border-line bg-white px-2 text-sm" aria-label="Diambil dari" value={item.dari} onChange={(e) => patchItem(item.line.lineId, (row) => ({ ...row, dari: e.target.value === "gudang" ? "gudang" : "toko" }))}>
                                <option value="toko">Toko (stok {grouped(item.line.stokToko)})</option>
                                <option value="gudang">Gudang (stok {grouped(item.line.stokGudang)})</option>
                              </select>
                              <input className="h-11 rounded-lg border border-line px-2 text-sm" list="alasan-retur" placeholder="Alasan, mis. rusak" value={item.alasan} onChange={(e) => patchItem(item.line.lineId, (row) => ({ ...row, alasan: e.target.value }))} />
                            </div>
                            {problem ? <p className="mt-2 text-xs font-bold text-red-600">{problem}</p> : null}
                            <p className="num mt-2 text-right text-sm font-extrabold">{rupiah(item.qty * unitPrice(item.line, item.satuan))}<span className="ml-1 text-[11px] font-normal text-muted">@ {rupiah(unitPrice(item.line, item.satuan))}</span></p>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {items.length > 0 && wide ? (
                    <div className="no-row-hover mt-3 max-h-[52vh] overflow-auto rounded-lg border border-line">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
                          <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2 text-left">Barang</th><th className="px-2 py-2 text-left">Dibeli / Sisa</th><th className="px-2 py-2 text-left">Retur (satuan & qty)</th><th className="px-2 py-2 text-left">Diambil dari</th><th className="px-2 py-2 text-left">Alasan</th><th className="px-2 py-2 text-right">Subtotal</th></tr>
                        </thead>
                        <tbody>
                          {items.map((item, index) => {
                            const problem = rowProblem(item);
                            return (
                              <tr key={item.line.lineId} className={`border-t border-line align-top ${item.qty > 0 ? "bg-blue-50/40" : ""}`}>
                                <td className="px-2 py-3 text-muted">{index + 1}</td>
                                <td className="min-w-[220px] px-2 py-3 leading-snug">
                                  <b className="block text-sm">{item.line.nama}</b>
                                  <span className="block text-xs text-slate-600">{item.line.kodePajak ? <span className="mr-1 rounded bg-slate-200 px-1.5 py-px font-mono font-bold text-slate-800">[{item.line.kodePajak}]</span> : null}PN: <span className="font-mono font-semibold">{item.line.partNumber || "-"}</span>{item.line.merek ? ` · ${item.line.merek}` : ""}</span>
                                  {problem ? <span className="mt-1 block text-xs font-bold text-red-600">{problem}</span> : null}
                                </td>
                                <td className="min-w-[170px] px-2 py-3 text-xs leading-snug">
                                  <span className="block">Dibeli <b>{grouped(item.line.qty)} {item.line.satuan}</b> @ {rupiah(item.line.hargaBeli)}</span>
                                  <span className="block text-slate-600">sudah diretur {qtyText(item.line.sudahRetur, item.line)}</span>
                                  <span className="block font-bold text-emerald-700">sisa {qtyText(item.line.sisa, item.line)}</span>
                                </td>
                                <td className="px-2 py-3"><div className="flex items-center gap-2">{qtyControls(item)}</div></td>
                                <td className="px-2 py-3">
                                  <select className="h-12 w-44 rounded-lg border border-line bg-white px-2 text-sm" aria-label="Diambil dari" value={item.dari} onChange={(e) => patchItem(item.line.lineId, (row) => ({ ...row, dari: e.target.value === "gudang" ? "gudang" : "toko" }))}>
                                    <option value="toko">Toko (stok {grouped(item.line.stokToko)})</option>
                                    <option value="gudang">Gudang (stok {grouped(item.line.stokGudang)})</option>
                                  </select>
                                </td>
                                <td className="px-2 py-3"><input className="h-12 w-40 rounded-lg border border-line px-2 text-sm" list="alasan-retur" placeholder="Mis. rusak" value={item.alasan} onChange={(e) => patchItem(item.line.lineId, (row) => ({ ...row, alasan: e.target.value }))} /></td>
                                <td className="num px-2 py-3 text-right font-semibold">{rupiah(item.qty * unitPrice(item.line, item.satuan))}<span className="block text-[11px] font-normal text-muted">@ {rupiah(unitPrice(item.line, item.satuan))}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <datalist id="alasan-retur">{ALASAN.map((text) => <option key={text} value={text} />)}</datalist>

                  {habis.length > 0 && items.length > 0 ? (
                    <details className="mt-3 rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <summary className="cursor-pointer font-bold">{habis.length} barang lain di faktur ini sudah habis diretur</summary>
                      <ul className="mt-1 list-disc pl-5">{habis.map((line) => <li key={line.lineId}>{line.nama}</li>)}</ul>
                    </details>
                  ) : null}
                </section>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
              <div className="text-sm">
                <span className="text-muted">{filled.length} barang · {grouped(filled.reduce((sum, item) => sum + item.qty, 0))} qty · Total</span>
                <b className="ml-2 text-lg">{rupiah(grandTotal)}</b>
                {chosen ? <span className="ml-0 block text-xs text-slate-600 sm:ml-3 sm:inline">dari faktur <b className="font-mono">{chosen.invoiceNo}</b></span> : null}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <button className="h-12 rounded-lg border border-line px-5" onClick={() => setOpen(false)}>Batal</button>
                <PrimaryButton disabled={busy || !chosen || filled.length === 0 || hasProblem} onClick={save}>{busy ? "Menyimpan..." : "Simpan Retur"}</PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
