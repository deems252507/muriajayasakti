import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { editManual, editSale, getInvoice, listBon, payoffBon, removeInvoice } from "@/lib/shop/api";
import { ItemEditor, editorPayload, editorSubtotal, rowFromLine, type EditorAdd, type EditorRow } from "@/components/shop/item-editor";
import { PeriodPicker } from "@/components/shop/period";
import { ShareToChat, type ShareRef } from "@/components/shop/chat-share";
import { digits, grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import { printDebtReport, printStoredSale } from "@/lib/shop/print";

export const Route = createFileRoute("/_shop/bon")({ component: BonPage });

type EditState = { nomor: string; manual: boolean; tujuan: string; keterangan: string; diskon: string; rows: EditorRow[]; adds: EditorAdd[] };

function BonPage() {
  const me = Route.useRouteContext().me;
  const canEdit = me.role === "Admin";
  const [status, setStatus] = usePersistedState("bon:status", "Bon");
  const [customer, setCustomer] = usePersistedState("bon:customer", "");
  const [start, setStart] = usePersistedState("bon:start", "");
  const [end, setEnd] = usePersistedState("bon:end", "");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [share, setShare] = useState<ShareRef | null>(null);

  function closeEdit() { setEdit(null); }

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
                    <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => setShare({ type: "bon", id: String(inv.tujuan || "Umum"), label: `Bon ${String(inv.tujuan || "Umum")} · ${String(inv.nomor)} · ${rupiah(Number(inv.total))}` })}>Bagikan</button>
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
                          const invoice = res.invoice as { diskon: number; keterangan?: string };
                          setEdit({
                            nomor: String(inv.nomor),
                            manual: String(inv.source) === "Manual",
                            tujuan: String(inv.tujuan || ""),
                            keterangan: String(invoice.keterangan || ""),
                            diskon: grouped(Number(invoice.diskon || 0)),
                            rows: (res.lines as Array<Record<string, unknown>>).map((line) => rowFromLine(line)),
                            adds: [],
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
        const subtotal = editorSubtotal(edit.rows, edit.adds);
        const total = Math.max(0, subtotal - (edit.manual ? 0 : digits(edit.diskon)));
        return (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4">
          <form className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-panel p-4" onSubmit={(event) => {
            event.preventDefault();
            if (edit.rows.every((row) => row.removed) && edit.adds.length === 0) return toast.error("Bon tidak boleh kosong. Pakai tombol Hapus di daftar bon untuk membatalkan bon.");
            const { lines, add } = editorPayload(edit.rows, edit.adds);
            const save = edit.manual
              ? editManual({ data: { nomor: edit.nomor, tujuan: edit.tujuan, keterangan: edit.keterangan, lines, add } })
              : editSale({ data: { nomor: edit.nomor, tujuan: edit.tujuan, diskon: digits(edit.diskon), lines, add } });
            void save.then(() => { toast.success("Bon diperbarui. Cetak bon lagi untuk kertas yang baru."); closeEdit(); load(); }).catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Edit Bon {edit.nomor}</h3>
            <p className="mt-1 text-xs text-muted">Ubah nama pelanggan, jumlah, satuan (Pcs/Dus), harga{edit.manual ? "" : ", diskon"}, hapus barang, {edit.manual ? "ganti barang, " : ""}atau tambah barang. Stok dan piutang ikut berubah. Setelah simpan, cetak bon lagi.</p>
            <label className="mt-3 block text-sm">Nama pelanggan
              <input className={`${inputClass} mt-1`} value={edit.tujuan} onChange={(e) => setEdit({ ...edit, tujuan: e.target.value })} />
            </label>
            <ItemEditor rows={edit.rows} adds={edit.adds} onRows={(rows) => setEdit({ ...edit, rows })} onAdds={(adds) => setEdit({ ...edit, adds })} withSwap={edit.manual} lockKeluar />
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
      {share ? <ShareToChat data={share} onClose={() => setShare(null)} /> : null}
    </div>
  );
}
