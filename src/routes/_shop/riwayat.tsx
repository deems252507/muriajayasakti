import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { inputClass, MarkWords, Panel } from "@/components/shop/shell";
import { editManual, editSale, findRetur, getInvoice, listHistoryItems, listHistoryLines, listInvoices, listMasters, listPartners, removeInvoice } from "@/lib/shop/api";
import { ItemEditor, editorPayload, editorSubtotal, rowFromLine, type EditorAdd, type EditorRow } from "@/components/shop/item-editor";
import { PeriodPicker } from "@/components/shop/period";
import { digits, grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import { printHistoryReport, printReturSlip, printStoredManual, printStoredSale } from "@/lib/shop/print";
import type { Partner } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/riwayat")({ component: RiwayatPage });

function RiwayatPage() {
  const me = Route.useRouteContext().me;
  const [q, setQ] = usePersistedState("riwayat:q", "");
  const [source, setSource] = usePersistedState("riwayat:source", "");
  const [status, setStatus] = usePersistedState("riwayat:status", "");
  const [jenis, setJenis] = usePersistedState("riwayat:jenis", "");
  const [view, setView] = usePersistedState<"transaksi" | "barang">("riwayat:view", "transaksi");
  const [tujuan, setTujuan] = usePersistedState("riwayat:tujuan", "");
  const [partners, setPartners] = useState<Partner[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [start, setStart] = usePersistedState("riwayat:start", "");
  const [end, setEnd] = usePersistedState("riwayat:end", "");
  const [page, setPage] = usePersistedState("riwayat:page", 1);
  const [data, setData] = useState<{ total: number; perPage: number; items: Array<Record<string, unknown>> } | null>(null);
  const [open, setOpen] = useState("");
  const [detail, setDetail] = useState<{ invoice: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null>(null);
  const [banks, setBanks] = useState<string[]>([]);
  const [manual, setManual] = useState<{ nomor: string; tujuan: string; keterangan: string; bon: boolean; rows: EditorRow[]; adds: EditorAdd[] } | null>(null);
  const [sale, setSale] = useState<{ nomor: string; tujuan: string; diskon: string; metode: string; bank: string; bayar: string; rows: EditorRow[]; adds: EditorAdd[] } | null>(null);
  // Dibuka dari chat ("Buka di aplikasi"): langsung tampilkan detail nota itu, apa pun filter yang tersimpan.
  useEffect(() => {
    let nomor = "";
    try { nomor = sessionStorage.getItem("mjs-open-invoice") ?? ""; sessionStorage.removeItem("mjs-open-invoice"); } catch { /* abaikan */ }
    if (!nomor) return;
    setView("transaksi");
    setDetail(null);
    setOpen(nomor);
    void getInvoice({ data: { nomor } })
      .then((res) => {
        if (!res) { toast.error(`Nota ${nomor} tidak ditemukan`); setOpen(""); return; }
        setDetail({ invoice: res.invoice as Record<string, unknown>, lines: res.lines as Array<Record<string, unknown>> });
      })
      .catch((error: Error) => { toast.error(error.message || "Gagal memuat nota"); setOpen(""); });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sale && !manual) setOpen(""); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sale, manual]);

  /** Buka editor per item untuk nota Kasir / Manual. removeId = baris yang langsung ditandai hapus. */
  async function openEditor(nomor: string, removeId?: number) {
    try {
      const res = await getInvoice({ data: { nomor } });
      if (!res) return toast.error("Nota tidak ditemukan");
      const invoice = res.invoice as Record<string, unknown>;
      const source = String(invoice.source);
      const rows: EditorRow[] = (res.lines as Array<Record<string, unknown>>).map((line) => rowFromLine(line, removeId === Number(line.id)));
      if (source === "Kasir") {
        void listMasters().then((m) => setBanks(m.banks.filter((bank) => bank.aktif).map((bank) => bank.nama)));
        setSale({
          nomor,
          tujuan: String(invoice.tujuan || ""),
          diskon: grouped(Number(invoice.diskon || 0)),
          metode: String(invoice.metode_bayar || "Tunai"),
          bank: String(invoice.bank_transfer || ""),
          bayar: grouped(Number(invoice.bayar_tunai || 0)),
          rows,
          adds: [],
        });
      } else if (source === "Manual") {
        const bon = String(invoice.metode_bayar) === "Bon";
        if (bon && String(invoice.status_bayar) !== "Bon") return toast.error("Bon sudah lunas dan tidak bisa diedit.");
        setManual({ nomor, tujuan: String(invoice.tujuan || ""), keterangan: String(invoice.keterangan || ""), bon, rows, adds: [] });
      } else {
        toast.error("Nota retur tidak bisa diedit di sini. Hapus retur lalu proses ulang.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membuka nota");
    }
  }

  function load(next = page) {
    const asked = view;
    const request = asked === "barang"
      ? listHistoryItems({ data: { q, tujuan, source, status, jenis, start, end, page: next } })
      : listInvoices({ data: { q, tujuan, source, status, jenis, start, end, page: next } });
    void request
      .then((res) => { if (viewRef.current === asked) setData(res as { total: number; perPage: number; items: Array<Record<string, unknown>> }); })
      .catch((error: Error) => toast.error(error.message || "Gagal memuat riwayat."));
  }
  useEffect(() => { load(page); }, [q, tujuan, source, status, jenis, start, end, page, view]);
  useEffect(() => { void listPartners().then(setPartners).catch(() => setPartners([])); }, []);
  function pilihView(next: "transaksi" | "barang") {
    if (next === view) return;
    setData(null);
    setOpen("");
    setPage(1);
    if (next === "transaksi" && source === "Pemasok") setSource("");
    setView(next);
  }
  const sourceTabs: Array<[string, string]> = [["", "Semua"], ["Kasir", "Penjualan Kasir"], ["Manual", "Transaksi Manual"], ["Retur", "Retur / Tukar"]];
  if (view === "barang") sourceTabs.push(["Pemasok", "Barang Masuk Pemasok"]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? (view === "barang" ? 30 : 12))));
  const items = data?.items ?? [];
  const tunai = items.filter((i) => i.metode_bayar === "Tunai").reduce((s, i) => s + Number(i.total), 0);
  const transfer = items.filter((i) => i.metode_bayar === "Transfer" || i.metode_bayar === "Split").reduce((s, i) => s + Number(i.total), 0);

  return (
    <Panel>
      <div>
        <h2 className="text-lg font-extrabold">Laporan Riwayat Transaksi</h2>
        <p className="text-xs text-muted">{view === "barang" ? "Satu baris = satu barang. Cocok untuk mencari barang tertentu di semua nota, termasuk barang masuk dari pemasok." : "Satu kartu = satu transaksi. Klik Lihat Detail untuk melihat semua barang dalam transaksi."}</p>
        <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1">
          <button type="button" onClick={() => pilihView("transaksi")} className={`h-9 rounded-md px-4 text-sm font-bold ${view === "transaksi" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}>Per Transaksi</button>
          <button type="button" onClick={() => pilihView("barang")} className={`h-9 rounded-md px-4 text-sm font-bold ${view === "barang" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}>Per Barang</button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {sourceTabs.map(([value, label]) => (
            <button key={value || "all"} type="button" onClick={() => { setPage(1); setSource(value); }} className={`h-10 rounded-lg px-4 text-sm font-bold ${source === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>
          ))}
        </div>
        <PeriodPicker start={start} end={end} onChange={(nextStart, nextEnd) => { setPage(1); setStart(nextStart); setEnd(nextEnd); }} />
        <div className="flex flex-wrap gap-2">
        <button className="h-9 rounded-lg border border-line px-3 text-xs font-bold" onClick={() => { setQ(""); setTujuan(""); setSource(""); setStatus(""); setJenis(""); setStart(""); setEnd(""); setPage(1); }}>Reset</button>
        <button className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => {
          const report = view === "barang"
            ? listHistoryItems({ data: { q, tujuan, source, status, jenis, start, end, all: true } }).then((res) => (res as { items: Array<Record<string, unknown>> }).items)
            : listHistoryLines({ data: { q, tujuan, source, status, jenis, start, end } });
          void report.then((res) => {
            try { printHistoryReport(res as Array<Record<string, unknown>>, start, end); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Gagal mencetak"); }
          });
        }}>Cetak PDF</button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-4">
        <input className={inputClass} placeholder="Cari nota, barang, part number, merek, pemasok (boleh beberapa kata)" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select className={inputClass} value={tujuan} onChange={(e) => { setPage(1); setTujuan(e.target.value); }}>
          <option value="">Semua Pelanggan / Supplier</option>
          {tujuan && !partners.some((row) => row.nama.toLowerCase() === tujuan.toLowerCase()) ? <option value={tujuan}>{tujuan}</option> : null}
          <optgroup label="Supplier">
            {partners.filter((row) => row.tipe === "Supplier").map((row) => <option key={`s-${row.id}`} value={row.nama}>{row.nama}</option>)}
          </optgroup>
          <optgroup label="Pelanggan">
            {partners.filter((row) => row.tipe === "Pelanggan").map((row) => <option key={`p-${row.id}`} value={row.nama}>{row.nama}</option>)}
          </optgroup>
        </select>
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
          {view === "barang" ? <option value="Pemasok">Barang Masuk Pemasok</option> : null}
        </select>
        <select className={inputClass} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Semua status</option>
          <option value="Lunas">Lunas</option>
          <option value="Bon">Bon</option>
        </select>
      </div>
      {view === "barang" ? (
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Total Baris Barang</p><p className="font-black">{data?.total ?? 0}</p></div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Total Transaksi</p><p className="font-black">{data?.total ?? 0}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Tunai (halaman ini)</p><p className="num font-black">{rupiah(tunai)}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Transfer / QRIS</p><p className="num font-black">{rupiah(transfer)}</p></div>
        </div>
      )}
      {view === "barang" ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Nota</th>
                <th className="px-3 py-2">Barang</th>
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Harga</th>
                <th className="px-3 py-2">Pelanggan / Supplier</th>
                {me.role === "Admin" ? <th className="px-3 py-2">Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((row, index) => (
                <tr key={`${String(row.nomor)}-${index}`} className="border-t border-line align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{when(String(row.tanggal))}</td>
                  <td className="px-3 py-2">
                    <span className={`mr-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${String(row.source) === "Manual" ? "bg-amber-100 text-amber-800" : String(row.source) === "Retur" ? "bg-red-100 text-red-700" : String(row.source) === "Pemasok" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{String(row.source)}</span>
                    <span className="font-semibold"><MarkWords text={String(row.nomor)} q={q} /></span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-900"><MarkWords text={String(row.nama)} q={q} />{row.kode_pajak ? <> (<MarkWords text={String(row.kode_pajak)} q={q} />)</> : null}</p>
                    {row.merek ? <div className="mt-0.5"><span className="inline-block rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-bold text-blue-800"><MarkWords text={String(row.merek)} q={q} /></span></div> : null}
                    <p className="mt-0.5 font-mono text-[11px] text-slate-700">PN: <MarkWords text={String(row.part_number || "-")} q={q} />{row.pn_alt ? <> · Alt: <MarkWords text={String(row.pn_alt)} q={q} /></> : null}</p>
                  </td>
                  <td className={`px-3 py-2 text-xs font-bold ${String(row.jenis) === "MASUK" ? "text-emerald-700" : "text-red-600"}`}>{String(row.jenis)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right font-bold">{grouped(Number(row.jumlah))} {String(row.satuan)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right">{Number(row.harga_satuan) ? rupiah(Number(row.harga_satuan)) : "-"}</td>
                  <td className="px-3 py-2 text-xs"><MarkWords text={String(row.tujuan || "-")} q={q} /></td>
                  {me.role === "Admin" ? (
                    <td className="whitespace-nowrap px-3 py-2">
                      {(String(row.source) === "Kasir" || String(row.source) === "Manual") && Number(row.line_id) > 0 ? (
                        <div className="flex gap-2">
                          <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-accent" onClick={() => void openEditor(String(row.nomor))}>Edit</button>
                          <button type="button" className="h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-danger" onClick={() => void openEditor(String(row.nomor), Number(row.line_id))}>Hapus</button>
                        </div>
                      ) : <span className="text-xs text-muted">-</span>}
                    </td>
                  ) : null}
                </tr>
              ))}
              {items.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-sm text-muted">Tidak ada barang ditemukan. Coba kata lain, kurangi filter, atau ubah tanggal.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {view === "transaksi" ? <ul className="mt-4 space-y-3">
        {items.map((inv) => (
          <li key={String(inv.nomor)} className={`rounded-xl border border-line border-l-4 p-3 ${String(inv.source) === "Manual" ? "border-l-amber-400" : String(inv.source) === "Retur" ? "border-l-red-400" : "border-l-emerald-500"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold"><span className={`mr-2 rounded-md px-2 py-0.5 align-middle text-[10px] font-extrabold tracking-wide uppercase ${String(inv.source) === "Manual" ? "bg-amber-100 text-amber-800" : String(inv.source) === "Retur" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{String(inv.source) === "Manual" ? "Manual" : String(inv.source) === "Retur" ? "Retur" : "Kasir"}</span><MarkWords text={String(inv.nomor)} q={q} /></p>
                <p className="text-xs text-muted">{when(String(inv.tanggal))} · {String(inv.status_bayar) === "Bon" ? <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-800">Bon</span> : String(inv.status_bayar)}</p>
                <p className="text-xs text-muted">{String(inv.source) === "Manual" ? "Admin" : "Kasir"}: <MarkWords text={String(inv.kasir || "-")} q={q} /> · Pelanggan/Supplier: <MarkWords text={String(inv.tujuan || "-")} q={q} /></p>
              </div>
              <div className="text-right">
                <p className="num text-lg font-black">{rupiah(Number(inv.total))}</p>
                <button className="text-xs font-bold text-accent" onClick={() => {
                  const nomor = String(inv.nomor);
                  setDetail(null);
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
          </li>
        ))}
        {items.length === 0 ? <li className="py-8 text-center text-sm text-muted">Tidak ada transaksi ditemukan. Coba ubah kata pencarian atau filter tanggal.</li> : null}
      </ul> : null}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">Menampilkan {items.length} dari {data?.total ?? 0} {view === "barang" ? "baris barang" : "transaksi"} · {todayInput()}</span>
        <div className="flex items-center gap-2">
          <button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
          <span>Hal: {page}/{pages}</span>
          <button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
        </div>
      </div>
      {view === "transaksi" && open ? (() => {
        const inv = items.find((x) => String(x.nomor) === open) ?? (detail && String(detail.invoice.nomor).toLowerCase() === open.toLowerCase() ? detail.invoice : null);
        if (!inv) return null;
        return (
          <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-ink/40 p-3 sm:p-4" onClick={() => setOpen("")}>
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-panel shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-line p-4">
                <div className="min-w-0">
                  <p className="text-lg font-black">
                    <span className={`mr-2 rounded-md px-2 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wide ${String(inv.source) === "Manual" ? "bg-amber-100 text-amber-800" : String(inv.source) === "Retur" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{String(inv.source)}</span>
                    {String(inv.nomor)}
                  </p>
                  <p className="text-xs text-muted">{when(String(inv.tanggal))} · {String(inv.status_bayar)}</p>
                  <p className="text-xs text-muted">{String(inv.source) === "Manual" ? "Admin" : "Kasir"}: {String(inv.kasir || "-")} · Pelanggan/Supplier: {String(inv.tujuan || "-")}</p>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <p className="num text-xl font-black">{rupiah(Number(inv.total))}</p>
                  <button type="button" className="grid size-9 place-items-center rounded-lg border border-line text-lg font-bold hover:bg-slate-100" aria-label="Tutup" onClick={() => setOpen("")}>×</button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
{detail && String(detail.invoice.nomor).toLowerCase() === open.toLowerCase() ? (
              <div className="text-sm">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Rincian Barang ({detail.lines.length})</p>
                {detail.lines.map((line) => (
                  <div key={String(line.id)} className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-slate-50 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{String(line.jenis)} · <MarkWords text={String(line.custom_item || line.product_nama || "Barang")} q={q} />{line.kode_pajak ? <> (<MarkWords text={String(line.kode_pajak)} q={q} />)</> : null}</p>
                      {line.merek || line.product_merek ? <div className="mt-0.5"><span className="inline-block rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-bold text-blue-800"><MarkWords text={String(line.merek || line.product_merek)} q={q} /></span></div> : null}
                      <p className="font-mono text-[11px] text-slate-700">PN: <MarkWords text={String(line.part_number || line.product_part || "-")} q={q} />{line.part_numbers_alt || line.product_alt ? <> · Alt: <MarkWords text={String(line.part_numbers_alt || line.product_alt)} q={q} /></> : null}</p>
                      <p className="text-xs">Qty {String(line.jumlah)} {String(line.satuan)} · Harga {rupiah(Number(line.harga_satuan))} · Nilai {rupiah(Number(line.harga_satuan) * Number(line.jumlah))}</p>
                    </div>
                    {me.role === "Admin" && (String(inv.source) === "Kasir" || String(inv.source) === "Manual") ? (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-accent" onClick={() => void openEditor(String(inv.nomor))}>Edit</button>
                        <button type="button" className="h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-danger" onClick={() => void openEditor(String(inv.nomor), Number(line.id))}>Hapus</button>
                      </div>
                    ) : null}
                  </div>
                ))}
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">Pembayaran: {String(inv.metode_bayar || "-")} {inv.bank_transfer ? `· ${String(inv.bank_transfer)}` : ""} · Tujuan: {String(inv.tujuan || "-")}</p>
                {String(inv.source) === "Retur" ? <p className="mt-2 text-xs text-muted">Kalau retur salah, hapus dulu. Stok dan uang kembali, lalu proses ulang dari nota asal.</p> : null}
                {me.role === "Admin" && (String(inv.source) === "Kasir" || String(inv.source) === "Manual") ? (
                  <button className="mt-2 mr-3 text-sm font-bold text-accent" onClick={() => void openEditor(String(inv.nomor))}>Ubah Nota (per barang)</button>
                ) : null}
                {me.role === "Admin" ? (
                  <button className="mt-2 text-sm font-bold text-danger" onClick={() => {
                    if (!confirm(String(inv.source) === "Kasir" ? "Hapus nota ini beserta retur yang terkait? Stok dan uang laci dikembalikan." : "Hapus transaksi ini dan kembalikan stok?")) return;
                    void removeInvoice({ data: { nomor: String(inv.nomor) } }).then(() => { toast.success(`Nota ${String(inv.nomor)} berhasil dihapus`, { description: "Stok dan kas yang terkait sudah dikembalikan." }); setOpen(""); load(); }).catch((error: Error) => toast.error(error.message));
                  }}>Hapus Transaksi</button>
                ) : null}
              </div>
            ) : <p className="py-10 text-center text-sm text-muted">Memuat rincian...</p>}
              </div>
            </div>
          </div>
        );
      })() : null}
      {sale ? (() => {
        const subtotal = editorSubtotal(sale.rows, sale.adds);
        const total = Math.max(0, subtotal - digits(sale.diskon));
        return (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4">
          <form className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            if (sale.rows.every((row) => row.removed) && sale.adds.length === 0) return toast.error("Nota tidak boleh kosong. Pakai Hapus Transaksi untuk membatalkan nota.");
            void editSale({
              data: {
                nomor: sale.nomor,
                tujuan: sale.tujuan,
                diskon: digits(sale.diskon),
                metode: sale.metode,
                bank: sale.bank,
                bayarTunai: digits(sale.bayar),
                ...editorPayload(sale.rows, sale.adds),
              },
            }).then(async () => {
              const res = await getInvoice({ data: { nomor: sale.nomor } });
              toast.success(`Nota ${sale.nomor} berhasil diubah`, { description: "Struk terbaru dicetak ulang." });
              if (res) printStoredSale(res.invoice as Record<string, unknown>, res.lines as Array<Record<string, unknown>>);
              setSale(null);
              setOpen("");
              load();
            }).catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Perbaiki {sale.nomor}</h3>
            <p className="mt-1 text-xs text-muted">Ubah jumlah dan harga per barang, hapus barang, atau tambah barang. Stok, laci, dan pajak ikut menyesuaikan.</p>
            <label className="mt-3 block text-sm">Pelanggan
              <input className={`${inputClass} mt-1`} value={sale.tujuan} onChange={(e) => setSale({ ...sale, tujuan: e.target.value })} />
            </label>
            <ItemEditor rows={sale.rows} adds={sale.adds} onRows={(rows) => setSale({ ...sale, rows })} onAdds={(adds) => setSale({ ...sale, adds })} lockKeluar />
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
            <p className="num mt-3 text-right text-sm font-bold">Total: {rupiah(total)}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setSale(null)}>Batal</button>
              <button className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Simpan & Cetak</button>
            </div>
          </form>
        </div>
        );
      })() : null}
      {manual ? (() => {
        const total = editorSubtotal(manual.rows, manual.adds);
        return (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4">
          <form className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            if (manual.rows.every((row) => row.removed) && manual.adds.length === 0) return toast.error("Nota tidak boleh kosong. Pakai Hapus Transaksi untuk membatalkan nota.");
            void editManual({
              data: {
                nomor: manual.nomor,
                tujuan: manual.tujuan,
                keterangan: manual.keterangan,
                ...editorPayload(manual.rows, manual.adds),
              },
            })
              .then(() => { toast.success(`Nota manual ${manual.nomor} berhasil diubah`, { description: "Stok dan pajak ikut disesuaikan." }); setManual(null); setOpen(""); load(); })
              .catch((error: Error) => toast.error(error.message));
          }}>
            <h3 className="font-semibold">Ubah {manual.nomor}{manual.bon ? " (Bon)" : ""}</h3>
            <p className="mt-1 text-xs text-muted">Hanya nota manual. Uang kasir tidak berubah. Ubah jumlah, harga, atau jenis per barang, hapus barang, ganti barang, atau tambah barang. Stok dan pajak ikut menyesuaikan.{manual.bon ? " Bon hanya untuk barang Keluar." : ""}</p>
            <label className="mt-3 block text-sm">{manual.bon ? "Nama pelanggan" : "Tujuan"}
              <input className={`${inputClass} mt-1`} value={manual.tujuan} onChange={(e) => setManual({ ...manual, tujuan: e.target.value })} />
            </label>
            <label className="mt-2 block text-sm">Keterangan
              <input className={`${inputClass} mt-1`} value={manual.keterangan} onChange={(e) => setManual({ ...manual, keterangan: e.target.value })} />
            </label>
            <ItemEditor rows={manual.rows} adds={manual.adds} onRows={(rows) => setManual({ ...manual, rows })} onAdds={(adds) => setManual({ ...manual, adds })} withJenis withSwap lockKeluar={manual.bon} />
            <p className="num mt-3 text-right text-sm font-bold">Total nilai barang keluar: {rupiah(total)}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setManual(null)}>Batal</button>
              <button className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Simpan</button>
            </div>
          </form>
        </div>
        );
      })() : null}
    </Panel>
  );
}
