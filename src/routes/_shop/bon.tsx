import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { editManualBon, editSale, getInvoice, listBon, payoffBon, removeInvoice, searchProducts } from "@/lib/shop/api";
import { PeriodPicker } from "@/components/shop/period";
import { digits, grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import { printDebtReport, printStoredSale } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/bon")({ component: BonPage });

type EditRow = { id: number; nama: string; jumlah: number; satuan: string; harga: string; removed?: boolean };
type AddRow = { key: string; productId: number | null; nama: string; satuan: string; isAlt: boolean; jumlah: number; harga: string };
type EditState = { nomor: string; manual: boolean; tujuan: string; diskon: string; items: EditRow[]; adds: AddRow[] };

function BonPage() {
  const me = Route.useRouteContext().me;
  const canEdit = me.role === "Admin";
  const [status, setStatus] = usePersistedState("bon:status", "Bon");
  const [customer, setCustomer] = usePersistedState("bon:customer", "");
  const [start, setStart] = usePersistedState("bon:start", "");
  const [end, setEnd] = usePersistedState("bon:end", "");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [addQ, setAddQ] = useState("");
  const [addHits, setAddHits] = useState<Product[]>([]);
  const [customNama, setCustomNama] = useState("");
  const [customSatuan, setCustomSatuan] = useState("Item");

  useEffect(() => {
    if (!edit || addQ.trim().length < 1) return setAddHits([]);
    const timer = setTimeout(() => void searchProducts({ data: { q: addQ, limit: 8 } }).then((res) => setAddHits(res.items)).catch((error: Error) => toast.error(error.message)), 160);
    return () => clearTimeout(timer);
  }, [addQ, edit?.nomor]);

  function closeEdit() { setEdit(null); setAddQ(""); setAddHits([]); setCustomNama(""); setCustomSatuan("Item"); }

  function addProduct(product: Product, isAlt: boolean) {
    if (!edit) return;
    if (isAlt && !(product.satuanAlt && product.isiSatuanAlt > 0)) return toast.error("Barang ini tidak punya satuan dus.");
    const hargaJual = (isAlt ? product.hargaJualAlt : product.hargaJual) || 0;
    const key = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEdit({ ...edit, adds: [...edit.adds, { key, productId: product.id, nama: product.nama, satuan: isAlt ? product.satuanAlt : product.satuan, isAlt, jumlah: 1, harga: grouped(hargaJual) }] });
    setAddQ("");
    setAddHits([]);
  }

  function addCustom() {
    if (!edit) return;
    const nama = customNama.trim();
    if (!nama) return toast.error("Isi nama barang custom dulu.");
    const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEdit({ ...edit, adds: [...edit.adds, { key, productId: null, nama, satuan: customSatuan.trim() || "Item", isAlt: false, jumlah: 1, harga: "" }] });
    setCustomNama("");
  }

  function load() {
    void listBon({ data: { status, customer, start, end } }).then((data) => setRows(data as Array<Record<string, unknown>>));
  }
  useEffect(() => { load(); }, [status, customer, start, end]);

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const name = String(row.tujuan || "Umum");
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }

  const piutangAll = rows.filter((inv) => inv.status_bayar === "Bon").reduce((sum, inv) => sum + Number(inv.total), 0);
  const lunasAll = rows.filter((inv) => inv.status_bayar === "Lunas").reduce((sum, inv) => sum + Number(inv.total), 0);

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="font-extrabold">Daftar Bon / Piutang (Rekap Per Pelanggan)</h2>
        <div className="mt-3"><PeriodPicker start={start} end={end} onChange={(nextStart, nextEnd) => { setStart(nextStart); setEnd(nextEnd); }} /></div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Bon">Belum Lunas</option>
            <option value="Lunas">Sudah Lunas</option>
            <option value="Semua">Semua Status</option>
          </select>
          <input className={inputClass} placeholder="Nama pelanggan" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>
        <button className="mt-2 h-10 rounded-lg border border-line px-3 text-xs font-bold" onClick={() => { setStatus("Bon"); setCustomer(""); setStart(""); setEnd(""); }}>Reset</button>
        <button className="ml-2 mt-2 h-10 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => {
          void listBon({ data: { status, customer, start, end, withItems: true } }).then((data) => {
            try { printDebtReport(data as Array<Record<string, unknown>>, start, end, status); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
          });
        }}>Cetak Laporan</button>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-lg bg-red-50 p-3"><p className="text-[11px] text-red-700">Sisa Piutang</p><p className="num font-black text-danger">{rupiah(piutangAll)}</p></div>
          <div className="rounded-lg bg-emerald-50 p-3"><p className="text-[11px] text-emerald-700">Histori Lunas</p><p className="num font-black text-emerald-700">{rupiah(lunasAll)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-muted">Total Bon</p><p className="num font-black">{rupiah(piutangAll + lunasAll)}</p></div>
        </div>
      </Panel>
      {[...groups.entries()].map(([name, invoices]) => {
        const piutang = invoices.filter((inv) => inv.status_bayar === "Bon").reduce((sum, inv) => sum + Number(inv.total), 0);
        return (
          <Panel key={name}>
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-semibold">{name}</h2>
              <p className="num text-danger">{rupiah(piutang)}</p>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {invoices.map((inv) => (
                <li key={String(inv.nomor)} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{String(inv.source) === "Manual" ? <span className="mr-2 rounded-md bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase text-amber-800">Manual</span> : null}{String(inv.nomor)} · {String(inv.keterangan || inv.status_bayar)}</p>
                    <p className="text-xs text-muted">{when(String(inv.tanggal))} · {rupiah(Number(inv.total))}{inv.status_bayar === "Bon" && Number(inv.total) <= 0 ? " · harga belum diisi" : ""}{inv.status_bayar === "Lunas" && inv.tanggal_lunas ? ` · Lunas ${when(String(inv.tanggal_lunas))}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => {
                      void getInvoice({ data: { nomor: String(inv.nomor) } }).then((res) => {
                        if (!res) return toast.error("Nota tidak ditemukan");
                        printStoredSale(res.invoice as Record<string, unknown>, res.lines as Array<Record<string, unknown>>);
                      }).catch((error: Error) => toast.error(error.message));
                    }}>Cetak Bon</button>
                    {canEdit && inv.status_bayar === "Bon" ? (
                      <>
                      <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => {
                        void getInvoice({ data: { nomor: String(inv.nomor) } }).then((res) => {
                          if (!res) return;
                          setEdit({
                            nomor: String(inv.nomor),
                            manual: String(inv.source) === "Manual",
                            tujuan: String(inv.tujuan || ""),
                            diskon: grouped(Number((res.invoice as { diskon: number }).diskon)),
                            adds: [],
                            items: (res.lines as Array<Record<string, unknown>>).map((line) => ({
                              id: Number(line.id),
                              nama: String(line.custom_item || line.product_nama || "Barang"),
                              jumlah: Number(line.jumlah),
                              satuan: String(line.satuan),
                              harga: grouped(Number(line.harga_satuan)),
                            })),
                          });
                        });
                      }}>Edit bon</button>
                      <PrimaryButton onClick={() => {
                        if (Number(inv.total) <= 0) return toast.error("Harga bon masih Rp 0. Klik Edit bon dulu untuk mengisi harga.");
                        if (!confirm(`Lunasi ${String(inv.nomor)}?`)) return;
                        void payoffBon({ data: { nomor: String(inv.nomor) } })
                          .then((res) => { toast.success(`Kas masuk ${rupiah(Number((res as { total: number }).total))}`); load(); })
                          .catch((error: Error) => toast.error(error.message));
                      }}>Lunasi</PrimaryButton>
                      </>
                    ) : null}
                    {canEdit ? (
                      <button className="h-11 rounded-lg border border-red-200 px-3 text-sm font-bold text-danger" onClick={() => {
                        const lunas = inv.status_bayar === "Lunas";
                        const warn = lunas
                          ? `Hapus ${String(inv.nomor)} (${String(inv.tujuan)})? Bon ini sudah lunas, catatan kas pelunasannya juga ikut dihapus. Stok barang dikembalikan.`
                          : `Hapus ${String(inv.nomor)} (${String(inv.tujuan)})? Stok barang dikembalikan.`;
                        if (!confirm(warn)) return;
                        void removeInvoice({ data: { nomor: String(inv.nomor) } })
                          .then(() => { toast.success("Bon dihapus"); load(); })
                          .catch((error: Error) => toast.error(error.message));
                      }}>Hapus</button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
      {rows.length === 0 ? <p className="text-sm text-muted">Tidak ada data Bon/Piutang sesuai filter. Periode acuan {todayInput()}.</p> : null}
      {edit ? (() => {
        const aktif = edit.items.filter((item) => !item.removed);
        const subtotal = aktif.reduce((sum, item) => sum + Math.max(1, item.jumlah || 1) * digits(item.harga), 0)
          + edit.adds.reduce((sum, row) => sum + Math.max(1, row.jumlah || 1) * digits(row.harga), 0);
        const total = Math.max(0, subtotal - (edit.manual ? 0 : digits(edit.diskon)));
        const patchItem = (index: number, patch: Partial<EditRow>) => setEdit({ ...edit, items: edit.items.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
        const patchAdd = (key: string, patch: Partial<AddRow>) => setEdit({ ...edit, adds: edit.adds.map((row) => (row.key === key ? { ...row, ...patch } : row)) });
        return (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4">
          <form className="w-full max-w-2xl rounded-2xl bg-panel p-4" onSubmit={(event) => {
            event.preventDefault();
            if (aktif.length + edit.adds.length === 0) return toast.error("Bon tidak boleh kosong. Pakai tombol Hapus di daftar bon untuk membatalkan bon.");
            const lines = edit.items.map((item) => ({ id: item.id, harga: digits(item.harga), qty: item.removed ? 0 : Math.max(1, item.jumlah || 1) }));
            const add = edit.adds.map((row) => (row.productId
              ? { productId: row.productId, isAlt: row.isAlt, qty: Math.max(1, row.jumlah || 1), harga: digits(row.harga) }
              : { custom: row.nama, nama: row.nama, satuan: row.satuan, qty: Math.max(1, row.jumlah || 1), harga: digits(row.harga) }));
            const save = edit.manual
              ? editManualBon({ data: { nomor: edit.nomor, tujuan: edit.tujuan, lines, add } })
              : editSale({ data: { nomor: edit.nomor, tujuan: edit.tujuan, diskon: digits(edit.diskon), lines, add } });
            void save.then(() => { toast.success("Bon diperbarui. Cetak bon lagi untuk kertas yang baru."); closeEdit(); load(); }).catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Edit Bon {edit.nomor}</h3>
            <p className="mt-1 text-xs text-muted">Ubah nama pelanggan, jumlah, harga{edit.manual ? "" : ", diskon"}, hapus barang, atau tambah barang. Stok dan piutang ikut berubah. Setelah simpan, cetak bon lagi.</p>
            <label className="mt-3 block text-sm">Nama pelanggan
              <input className={`${inputClass} mt-1`} value={edit.tujuan} onChange={(e) => setEdit({ ...edit, tujuan: e.target.value })} />
            </label>
            <div className="mt-3 grid grid-cols-[1fr_5rem_7rem_4.5rem] gap-2 text-[11px] font-bold uppercase text-muted">
              <span>Barang</span><span className="text-center">Qty</span><span className="text-right">Harga satuan</span><span />
            </div>
            <ul className="mt-1 max-h-[32vh] space-y-2 overflow-y-auto">
              {edit.items.map((item, index) => (
                <li key={item.id} className={`grid grid-cols-[1fr_5rem_7rem_4.5rem] items-start gap-2 text-sm ${item.removed ? "opacity-50" : ""}`}>
                  <span className={`font-medium ${item.removed ? "line-through" : ""}`}>{item.nama}<span className="block text-[11px] font-normal text-muted">{item.removed ? "Akan dihapus dari bon" : item.satuan}</span></span>
                  <input disabled={item.removed} className={`${inputClass} num text-center`} inputMode="numeric" aria-label={`Qty ${item.nama}`} value={item.jumlah || ""} placeholder="1" onFocus={(e) => e.target.select()} onChange={(e) => patchItem(index, { jumlah: digits(e.target.value) })} />
                  <div>
                    <input disabled={item.removed} className={`${inputClass} num text-right`} inputMode="numeric" aria-label={`Harga ${item.nama}`} value={item.harga} placeholder="0" onFocus={(e) => e.target.select()} onChange={(e) => patchItem(index, { harga: grouped(digits(e.target.value)) })} />
                    <p className="num mt-0.5 text-right text-[11px] text-muted">= {rupiah(item.removed ? 0 : Math.max(1, item.jumlah || 1) * digits(item.harga))}</p>
                  </div>
                  <button type="button" className={`h-11 rounded-lg border px-2 text-xs font-bold ${item.removed ? "border-line text-slate-700" : "border-red-200 text-danger"}`} onClick={() => patchItem(index, { removed: !item.removed })}>{item.removed ? "Batal" : "Hapus"}</button>
                </li>
              ))}
              {edit.adds.map((row) => (
                <li key={row.key} className="grid grid-cols-[1fr_5rem_7rem_4.5rem] items-start gap-2 rounded-lg bg-emerald-50 p-1 text-sm">
                  <span className="font-medium">{row.nama}<span className="ml-1 rounded-md bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-800">Baru</span><span className="block text-[11px] font-normal text-muted">{row.satuan}{row.productId ? "" : " · custom"}</span></span>
                  <input className={`${inputClass} num text-center`} inputMode="numeric" aria-label={`Qty ${row.nama}`} value={row.jumlah || ""} placeholder="1" onFocus={(e) => e.target.select()} onChange={(e) => patchAdd(row.key, { jumlah: digits(e.target.value) })} />
                  <div>
                    <input className={`${inputClass} num text-right`} inputMode="numeric" aria-label={`Harga ${row.nama}`} value={row.harga} placeholder="0" onFocus={(e) => e.target.select()} onChange={(e) => patchAdd(row.key, { harga: grouped(digits(e.target.value)) })} />
                    <p className="num mt-0.5 text-right text-[11px] text-muted">= {rupiah(Math.max(1, row.jumlah || 1) * digits(row.harga))}</p>
                  </div>
                  <button type="button" className="h-11 rounded-lg border border-red-200 px-2 text-xs font-bold text-danger" onClick={() => setEdit({ ...edit, adds: edit.adds.filter((r) => r.key !== row.key) })}>Hapus</button>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-lg border border-dashed border-slate-400 bg-slate-50 p-3">
              <p className="text-sm font-bold">Tambah barang</p>
              <input className={`${inputClass} mt-2`} placeholder="Cari nama / part number barang" value={addQ} onChange={(e) => setAddQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (addHits[0]) addProduct(addHits[0], false); } }} />
              {addQ.trim() ? (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-line bg-white">
                  {addHits.length === 0 ? <p className="px-3 py-3 text-center text-xs text-muted">Barang tidak ditemukan.</p> : null}
                  {addHits.map((hit) => {
                    const dusOk = Boolean(hit.satuanAlt && hit.isiSatuanAlt > 0);
                    return (
                      <div key={hit.id} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{hit.nama}</p>
                          <p className="text-[11px] text-muted">PN: {hit.partNumber || hit.kode || "-"} · Stok: {hit.stok} {hit.satuan} · {rupiah(hit.hargaJual || 0)}</p>
                        </div>
                        <button type="button" className="h-10 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => addProduct(hit, false)}>+ {hit.satuan || "Pcs"}</button>
                        {dusOk ? <button type="button" className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white" onClick={() => addProduct(hit, true)}>+ {hit.satuanAlt}</button> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-[1fr_5rem_auto] gap-2">
                <input className={inputClass} placeholder="Atau barang custom (nama barang / jasa)" value={customNama} onChange={(e) => setCustomNama(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
                <input className={inputClass} aria-label="Satuan barang custom" placeholder="Satuan" value={customSatuan} onChange={(e) => setCustomSatuan(e.target.value)} />
                <button type="button" className="h-11 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={addCustom}>+ Custom</button>
              </div>
            </div>
            {edit.manual ? null : (
              <label className="mt-3 block text-sm">Diskon
                <input className={`${inputClass} num mt-1`} value={edit.diskon} onChange={(e) => setEdit({ ...edit, diskon: grouped(digits(e.target.value)) })} />
              </label>
            )}
            <p className="num mt-3 text-right text-sm font-bold">Total: {rupiah(total)}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={closeEdit}>Batal</button>
              <PrimaryButton type="submit">Simpan</PrimaryButton>
            </div>
          </form>
        </div>
        );
      })() : null}
    </div>
  );
}
