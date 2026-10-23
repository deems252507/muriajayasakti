import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { editManual, editSale, getInvoice, listBon, listPartners, payoffBon, removeInvoice } from "@/lib/shop/api";
import { PartnerPicker } from "@/components/shop/partner-picker";
import type { Partner } from "@/lib/shop/types";
import { ItemEditor, editorPayload, editorSubtotal, rowFromLine, type EditorAdd, type EditorRow } from "@/components/shop/item-editor";
import { PeriodPicker } from "@/components/shop/period";
import { digits, grouped, rupiah, when } from "@/lib/shop/format";
import { printDebtReport, printStoredNota } from "@/lib/shop/print";

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
  const [partners, setPartners] = useState<Partner[]>([]);
  useEffect(() => { void listPartners().then(setPartners).catch(() => setPartners([])); }, []);

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

  const belum = rows.filter((inv) => inv.status_bayar === "Bon");
  const piutangAll = belum.reduce((sum, inv) => sum + Number(inv.total), 0);
  const lunasAll = rows.filter((inv) => inv.status_bayar === "Lunas").reduce((sum, inv) => sum + Number(inv.total), 0);
  const pelangganBerutang = new Set(belum.map((inv) => String(inv.tujuan || "Umum"))).size;

  function hariLalu(value: unknown) {
    const t = new Date(String(value)).getTime();
    if (Number.isNaN(t)) return "";
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? "hari ini" : `${d} hari lalu`;
  }

  function cetak(nomor: string) {
    void getInvoice({ data: { nomor } }).then((res) => {
      if (!res) return toast.error("Nota tidak ditemukan");
      printStoredNota(res.invoice as Record<string, unknown>, res.lines as Array<Record<string, unknown>>);
    }).catch((error: Error) => toast.error(error.message));
  }

  const statusTabs: Array<[string, string]> = [["Bon", "Belum Lunas"], ["Lunas", "Sudah Lunas"], ["Semua", "Semua"]];

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Bon / Piutang Pelanggan</h2>
            <p className="mt-1 max-w-xl text-xs text-muted">Nota yang belum dibayar. Tekan <b>Lunasi</b> saat pelanggan membayar, uangnya otomatis tercatat sebagai kas masuk.</p>
          </div>
          <button className="h-10 rounded-lg bg-slate-800 px-4 text-xs font-bold text-white" onClick={() => {
            void listBon({ data: { status, customer, start, end } }).then((data) => {
              try { printDebtReport(data as Array<Record<string, unknown>>, start, end, status); }
              catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
            });
          }}>Cetak Laporan</button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Sisa Piutang</p>
            <p className="num text-xl font-black text-danger">{rupiah(piutangAll)}</p>
            <p className="text-[11px] text-red-700/80">{belum.length} nota · {pelangganBerutang} pelanggan</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Sudah Dilunasi</p>
            <p className="num text-xl font-black text-emerald-700">{rupiah(lunasAll)}</p>
            <p className="text-[11px] text-emerald-700/80">{rows.length - belum.length} nota</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Total Bon</p>
            <p className="num text-xl font-black">{rupiah(piutangAll + lunasAll)}</p>
            <p className="text-[11px] text-muted">{rows.length} nota pada filter ini</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {statusTabs.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setStatus(value)} className={`h-9 rounded-lg px-3 text-xs font-bold transition ${status === value ? "bg-white text-accent shadow-sm" : "text-slate-600"}`}>{label}</button>
            ))}
          </div>
          <input className={`${inputClass} max-w-xs`} placeholder="Cari nama pelanggan" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <button className="h-10 rounded-lg border border-line px-3 text-xs font-bold" onClick={() => { setStatus("Bon"); setCustomer(""); setStart(""); setEnd(""); }}>Reset</button>
        </div>
        <details className="mt-3 text-sm" open={Boolean(start || end)}>
          <summary className="cursor-pointer text-xs font-bold text-accent">Filter tanggal bon</summary>
          <div className="mt-2"><PeriodPicker start={start} end={end} onChange={(nextStart, nextEnd) => { setStart(nextStart); setEnd(nextEnd); }} /></div>
        </details>
      </Panel>
      {[...groups.entries()].map(([name, invoices]) => {
        const piutang = invoices.filter((inv) => inv.status_bayar === "Bon").reduce((sum, inv) => sum + Number(inv.total), 0);
        const jmlBelum = invoices.filter((inv) => inv.status_bayar === "Bon").length;
        return (
          <Panel key={name}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
              <div>
                <h3 className="text-base font-extrabold uppercase">{name}</h3>
                <p className="text-xs text-muted">{invoices.length} nota{jmlBelum ? ` · ${jmlBelum} belum lunas` : " · semua lunas"}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Total belum dibayar</p>
                <p className={`num text-xl font-black ${piutang > 0 ? "text-danger" : "text-emerald-700"}`}>{rupiah(piutang)}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-3">
              {invoices.map((inv) => {
                const nomor = String(inv.nomor);
                const manual = String(inv.source) === "Manual";
                const lunas = inv.status_bayar === "Lunas";
                const items = (Array.isArray(inv.items) ? inv.items : []) as Array<{ nama: string; qty: number; satuan: string; harga: number }>;
                return (
                  <li key={nomor} className={`rounded-xl border border-l-4 p-3 ${lunas ? "border-emerald-200 border-l-emerald-500 bg-emerald-50/40" : "border-red-200 border-l-red-500 bg-white"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-sm font-extrabold">{nomor}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${lunas ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{lunas ? "Lunas" : "Belum lunas"}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${manual ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{manual ? "Dibuat Admin" : "Dibuat Kasir"}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {manual ? "Admin" : "Kasir"}: <b className="text-slate-700">{String(inv.kasir || "-")}</b> · {when(String(inv.tanggal))}
                          {!lunas ? <span className="font-semibold text-red-700"> · {hariLalu(inv.tanggal)}</span> : null}
                        </p>
                        {lunas && inv.tanggal_lunas ? <p className="text-xs font-semibold text-emerald-700">Dilunasi {when(String(inv.tanggal_lunas))}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className={`num text-lg font-black ${lunas ? "text-emerald-700" : "text-danger"}`}>{rupiah(Number(inv.total))}</p>
                        {!lunas && Number(inv.total) <= 0 ? <p className="text-[11px] font-bold text-amber-700">Harga belum diisi</p> : null}
                      </div>
                    </div>
                    {items.length ? (
                      <ul className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        {items.map((item, i) => (
                          <li key={i} className="flex justify-between gap-3 py-0.5">
                            <span className="min-w-0 truncate">{item.nama} <span className="text-muted">× {item.qty} {item.satuan}</span></span>
                            <span className="num shrink-0 text-slate-700">{Number(item.harga) > 0 ? rupiah(Number(item.harga) * Number(item.qty)) : "-"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button className="h-10 rounded-lg border border-line px-3 text-sm font-semibold" onClick={() => cetak(nomor)}>Cetak Nota</button>
                      {canEdit && !lunas ? (
                        <>
                          <button className="h-10 rounded-lg border border-line px-3 text-sm font-semibold" onClick={() => {
                            void getInvoice({ data: { nomor } }).then((res) => {
                              if (!res) return;
                              const invoice = res.invoice as { diskon: number; keterangan?: string };
                              setEdit({
                                nomor,
                                manual,
                                tujuan: String(inv.tujuan || ""),
                                keterangan: String(invoice.keterangan || ""),
                                diskon: grouped(Number(invoice.diskon || 0)),
                                rows: (res.lines as Array<Record<string, unknown>>).map((line) => rowFromLine(line)),
                                adds: [],
                              });
                            });
                          }}>Edit</button>
                          <button className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700" onClick={() => {
                            if (Number(inv.total) <= 0) return toast.error("Harga bon masih Rp 0. Klik Edit dulu untuk mengisi harga.");
                            if (!confirm(`Lunasi ${nomor} atas nama ${name} sebesar ${rupiah(Number(inv.total))}?`)) return;
                            void payoffBon({ data: { nomor } })
                              .then((res) => { toast.success(`Bon ${nomor} berhasil dilunasi`, { description: `${name} · kas masuk ${rupiah(Number((res as { total: number }).total))}` }); load(); })
                              .catch((error: Error) => toast.error(error.message));
                          }}>Lunasi</button>
                        </>
                      ) : null}
                      {canEdit ? (
                        <button className="h-10 rounded-lg border border-red-200 px-3 text-sm font-bold text-danger" onClick={() => {
                          const warn = lunas
                            ? `Hapus ${nomor} (${name})? Bon ini sudah lunas, catatan kas pelunasannya juga ikut dihapus. Stok barang dikembalikan.`
                            : `Hapus ${nomor} (${name})? Stok barang dikembalikan.`;
                          if (!confirm(warn)) return;
                          void removeInvoice({ data: { nomor } })
                            .then(() => { toast.success(`Bon ${nomor} berhasil dihapus`, { description: "Stok barang dikembalikan." }); load(); })
                            .catch((error: Error) => toast.error(error.message));
                        }}>Hapus</button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
      {rows.length === 0 ? <Panel><p className="py-6 text-center text-sm text-muted">{status === "Bon" ? "Tidak ada bon yang belum lunas. 🎉" : "Tidak ada data bon sesuai filter."}</p></Panel> : null}
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
            void save.then(() => { toast.success(`Bon ${edit.nomor} berhasil diubah`, { description: "Cetak ulang nota untuk kertas yang baru." }); closeEdit(); load(); }).catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Edit Bon {edit.nomor}</h3>
            <p className="mt-1 text-xs text-muted">Ubah nama pelanggan, jumlah, satuan, harga{edit.manual ? "" : ", diskon"}, hapus barang, {edit.manual ? "ganti barang, " : ""}atau tambah barang. Stok dan piutang ikut berubah. Setelah simpan, cetak bon lagi.</p>
            <div className="mt-3 text-sm">
              <label htmlFor="bon-tujuan">Nama pelanggan</label>
              <div className="mt-1"><PartnerPicker id="bon-tujuan" partners={partners} tipe="Pelanggan" value={edit.tujuan} onChange={(tujuan) => setEdit({ ...edit, tujuan })} placeholder="Ketik atau pilih pelanggan" /></div>
            </div>
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
    </div>
  );
}
