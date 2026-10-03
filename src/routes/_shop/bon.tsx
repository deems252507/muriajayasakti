import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { editSale, getInvoice, listBon, payoffBon } from "@/lib/shop/api";
import { PeriodPicker } from "@/components/shop/period";
import { digits, grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import { printDebtReport, printStoredSale } from "@/lib/shop/print";

export const Route = createFileRoute("/_shop/bon")({ component: BonPage });

function BonPage() {
  const me = Route.useRouteContext().me;
  const canEdit = me.role === "Admin";
  const [status, setStatus] = useState("Bon");
  const [customer, setCustomer] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [edit, setEdit] = useState<{ nomor: string; diskon: string; items: Array<{ id: number; nama: string; jumlah: number; satuan: string; harga: string }> } | null>(null);

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
                    <p className="font-medium">{String(inv.nomor)} · {String(inv.keterangan || inv.status_bayar)}</p>
                    <p className="text-xs text-muted">{when(String(inv.tanggal))} · {rupiah(Number(inv.total))}{inv.status_bayar === "Lunas" && inv.tanggal_lunas ? ` · Lunas ${when(String(inv.tanggal_lunas))}` : ""}</p>
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
                            diskon: grouped(Number((res.invoice as { diskon: number }).diskon)),
                            items: (res.lines as Array<Record<string, unknown>>).map((line) => ({
                              id: Number(line.id),
                              nama: String(line.custom_item || line.product_nama || "Barang"),
                              jumlah: Number(line.jumlah),
                              satuan: String(line.satuan),
                              harga: grouped(Number(line.harga_satuan)),
                            })),
                          });
                        });
                      }}>Edit struk</button>
                      <PrimaryButton onClick={() => {
                        if (!confirm(`Lunasi ${String(inv.nomor)}?`)) return;
                        void payoffBon({ data: { nomor: String(inv.nomor) } })
                          .then((res) => { toast.success(`Kas masuk ${rupiah(Number((res as { total: number }).total))}`); load(); })
                          .catch((error: Error) => toast.error(error.message));
                      }}>Lunasi</PrimaryButton>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
      {rows.length === 0 ? <p className="text-sm text-muted">Tidak ada data Bon/Piutang sesuai filter. Periode acuan {todayInput()}.</p> : null}
      {edit ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form className="w-full max-w-lg rounded-2xl bg-panel p-4" onSubmit={(event) => {
            event.preventDefault();
            void editSale({
              data: {
                nomor: edit.nomor,
                diskon: digits(edit.diskon),
                lines: edit.items.map((item) => ({ id: item.id, harga: digits(item.harga), qty: item.jumlah })),
              },
            }).then(() => { toast.success("Struk diperbarui. Cetak bon lagi untuk kertas yang baru."); setEdit(null); load(); }).catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Edit {edit.nomor}</h3>
            <p className="mt-1 text-xs text-muted">Ubah jumlah, harga, atau diskon. Stok dan piutang ikut berubah. Setelah simpan, cetak bon lagi.</p>
            <ul className="mt-3 space-y-2">
              {edit.items.map((item, index) => (
                <li key={item.id} className="grid grid-cols-[1fr_4.5rem_7rem] items-center gap-2 text-sm">
                  <span>{item.nama}<span className="block text-[11px] text-muted">{item.satuan}</span></span>
                  <input className={`${inputClass} num`} value={item.jumlah} onChange={(e) => {
                    const jumlah = Math.max(1, Number(e.target.value) || 1);
                    setEdit({ ...edit, items: edit.items.map((row, i) => i === index ? { ...row, jumlah } : row) });
                  }} />
                  <input className={`${inputClass} num`} value={item.harga} onChange={(e) => {
                    const harga = grouped(digits(e.target.value));
                    setEdit({ ...edit, items: edit.items.map((row, i) => i === index ? { ...row, harga } : row) });
                  }} />
                </li>
              ))}
            </ul>
            <label className="mt-3 block text-sm">Diskon
              <input className={`${inputClass} num mt-1`} value={edit.diskon} onChange={(e) => setEdit({ ...edit, diskon: grouped(digits(e.target.value)) })} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setEdit(null)}>Batal</button>
              <PrimaryButton type="submit">Simpan</PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
