import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass, Panel } from "@/components/shop/shell";
import { getInvoice, listInvoices, removeInvoice } from "@/lib/shop/api";
import { periodRange, rupiah, todayInput, when } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/riwayat")({ component: RiwayatPage });

function RiwayatPage() {
  const me = Route.useRouteContext().me;
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; items: Array<Record<string, unknown>> } | null>(null);
  const [open, setOpen] = useState("");
  const [detail, setDetail] = useState<{ invoice: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null>(null);

  function load(next = page) {
    void listInvoices({ data: { q, source, status, start, end, page: next } }).then((res) => setData(res as { total: number; perPage: number; items: Array<Record<string, unknown>> }));
  }
  useEffect(() => { load(page); }, [q, source, status, start, end, page]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 12)));
  const items = data?.items ?? [];
  const tunai = items.filter((i) => i.metode_bayar === "Tunai").reduce((s, i) => s + Number(i.total), 0);
  const transfer = items.filter((i) => i.metode_bayar === "Transfer" || i.metode_bayar === "Split").reduce((s, i) => s + Number(i.total), 0);

  return (
    <Panel>
      <div>
        <h2 className="text-lg font-extrabold">Laporan Riwayat Transaksi</h2>
        <p className="text-xs text-muted">Satu kartu = satu transaksi. Klik Lihat Detail untuk melihat semua barang dalam transaksi.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["today", "week", "month"] as const).map((kind) => (
          <button key={kind} className="h-9 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => {
            const range = periodRange(kind);
            setPage(1);
            setStart(range.start);
            setEnd(range.end);
          }}>{kind === "today" ? "Hari Ini" : kind === "week" ? "Minggu Ini" : "Bulan Ini"}</button>
        ))}
        <button className="h-9 rounded-lg border border-line px-3 text-xs font-bold" onClick={() => { setQ(""); setSource(""); setStatus(""); setStart(""); setEnd(""); setPage(1); }}>Reset</button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <input className={inputClass} placeholder="Cari Transaksi" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <input className={inputClass} type="date" value={start} onChange={(e) => { setPage(1); setStart(e.target.value); }} />
        <input className={inputClass} type="date" value={end} onChange={(e) => { setPage(1); setEnd(e.target.value); }} />
        <select className={inputClass} value={source} onChange={(e) => { setPage(1); setSource(e.target.value); }}>
          <option value="">Semua sumber</option>
          <option value="Kasir">Kasir / Penjualan</option>
          <option value="Manual">Manual</option>
          <option value="Retur">Retur / Tukar</option>
        </select>
        <select className={inputClass} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Semua status</option>
          <option value="Lunas">Lunas</option>
          <option value="Bon">Bon</option>
        </select>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Total Transaksi</p><p className="font-black">{data?.total ?? 0}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Tunai (halaman ini)</p><p className="num font-black">{rupiah(tunai)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-muted">Transfer / QRIS</p><p className="num font-black">{rupiah(transfer)}</p></div>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((inv) => (
          <li key={String(inv.nomor)} className="rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{String(inv.nomor)}</p>
                <p className="text-xs text-muted">{when(String(inv.tanggal))} · {String(inv.source)} · {String(inv.status_bayar)}</p>
                <p className="text-xs text-muted">Kasir: {String(inv.kasir || "-")} · Pelanggan/Supplier: {String(inv.tujuan || "-")}</p>
              </div>
              <div className="text-right">
                <p className="num text-lg font-black">{rupiah(Number(inv.total))}</p>
                <button className="text-xs font-bold text-accent" onClick={() => {
                  const nomor = String(inv.nomor);
                  if (open === nomor) { setOpen(""); return; }
                  setOpen(nomor);
                  void getInvoice({ data: { nomor } }).then((res) => setDetail(res ? { invoice: res.invoice as Record<string, unknown>, lines: res.lines as Array<Record<string, unknown>> } : null));
                }}>Lihat Detail</button>
              </div>
            </div>
            {open === inv.nomor && detail ? (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <p className="text-xs font-bold">Rincian Barang</p>
                {detail.lines.map((line) => (
                  <div key={String(line.id)} className="mt-2 border-t border-slate-200 pt-2">
                    <p className="font-medium">{String(line.jenis)} · {String(line.custom_item || line.product_nama || "Barang")}</p>
                    <p className="text-[11px] text-muted">PN: {String(line.part_number || "-")}{line.merek ? ` · Merek: ${String(line.merek)}` : ""}{line.kode_pajak ? ` · Kode Pajak: ${String(line.kode_pajak)}` : ""}</p>
                    <p className="text-xs">Qty {String(line.jumlah)} {String(line.satuan)} · Nilai {rupiah(Number(line.harga_satuan) * Number(line.jumlah))}</p>
                  </div>
                ))}
                <p className="mt-2 text-xs">Pembayaran: {String(inv.metode_bayar || "-")} {inv.bank_transfer ? `· ${String(inv.bank_transfer)}` : ""} · Tujuan: {String(inv.tujuan || "-")}</p>
                {me.role === "Admin" ? (
                  <button className="mt-2 text-sm font-bold text-danger" onClick={() => {
                    if (!confirm("Hapus Transaksi dan kembalikan stok?")) return;
                    void removeInvoice({ data: { nomor: String(inv.nomor) } }).then(() => { toast.success("Nota dihapus"); setOpen(""); load(); }).catch((error: Error) => toast.error(error.message));
                  }}>Hapus Transaksi</button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? <li className="py-8 text-center text-sm text-muted">Tidak ada transaksi ditemukan. Coba ubah kata pencarian atau filter tanggal.</li> : null}
      </ul>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">Menampilkan {items.length} dari {data?.total ?? 0} transaksi · {todayInput()}</span>
        <div className="flex items-center gap-2">
          <button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
          <span>Hal: {page}/{pages}</span>
          <button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
        </div>
      </div>
    </Panel>
  );
}
