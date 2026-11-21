import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ClipboardCheck, FileText, Pencil, Search, Store, Trash2, Undo2, Warehouse, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageBar, useIsWide } from "@/components/shop/page-bar";
import { StatusBadge } from "@/components/shop/alokasi-badge";
import { Panel, inputClass } from "@/components/shop/shell";
import { confirmDialog } from "@/lib/confirm";
import { alokasiGet, alokasiList, alokasiReview, alokasiSave, deleteSupplierReceipt } from "@/lib/shop/api";
import { when } from "@/lib/shop/format";
import { printBeritaAcaraSelisih, printSuratMutasi } from "@/lib/shop/print";

type Filter = "tindakan" | "semua" | "selesai" | "selisih";
type ListData = Awaited<ReturnType<typeof alokasiList>>;
type Detail = Awaited<ReturnType<typeof alokasiGet>>;

const asId = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/_shop/alokasi")({
  // ?faktur=ID membuka faktur itu langsung (dari notifikasi); ?filter=semua|selesai mengganti daftar.
  validateSearch: (search: Record<string, unknown>): { faktur?: number; filter?: "semua" | "selesai" | "selisih" } => ({
    faktur: asId(search.faktur),
    filter: search.filter === "semua" || search.filter === "selesai" || search.filter === "selisih" ? search.filter : undefined,
  }),
  component: AlokasiPage,
});

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function tellChanged() {
  window.dispatchEvent(new CustomEvent("mjs-alokasi-changed"));
}

const TH = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const TD = "px-3 py-2.5 align-middle";

/** Alur satu faktur dari dicatat sampai selesai, dengan jumlah faktur di tiap tahap. */
function AlurFaktur({ counts }: { counts: ListData["counts"] }) {
  const steps = [
    { key: "perlu_alokasi", title: "Perlu alokasi", hint: "Faktur baru. Atur berapa ke gudang.", n: counts.perlu_alokasi, cls: "border-red-200 bg-red-50 text-red-800" },
    { key: "menunggu_cek", title: "Menunggu cek", hint: "Staf sudah alokasi. Admin memeriksa.", n: counts.menunggu_cek, cls: "border-amber-200 bg-amber-50 text-amber-900" },
    { key: "dikembalikan", title: "Dikembalikan", hint: "Admin minta staf mengoreksi.", n: counts.dikembalikan, cls: "border-orange-200 bg-orange-50 text-orange-900" },
    { key: "selesai", title: "Selesai", hint: "Stok toko dan gudang sudah sesuai.", n: counts.selesai, cls: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {steps.map((st) => (
        <div key={st.key} className={`rounded-xl border px-3 py-2 ${st.cls}`}>
          <p className="flex items-baseline justify-between gap-2 text-xs font-extrabold"><span>{st.title}</span><span className="num text-base">{st.n.toLocaleString("id-ID")}</span></p>
          <p className="mt-0.5 text-[11px] leading-snug opacity-90">{st.hint}</p>
        </div>
      ))}
    </div>
  );
}

function TujuanChip({ nGudang }: { nGudang: number }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${nGudang > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{nGudang > 0 ? `Ke gudang: ${nGudang}` : "Semua di toko"}</span>;
}

function AlokasiPage() {
  const { faktur, filter: filterParam } = Route.useSearch();
  const navigate = useNavigate();
  const wide = useIsWide();
  const [filter, setFilter] = useState<Filter>(filterParam ?? "tindakan");
  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<number | null>(faktur ?? null);
  const dq = useDebounced(q.trim());
  const rangeSalah = Boolean(start && end && start > end);
  const filterAktif = Boolean(dq || supplierId || start || end);

  useEffect(() => setPage(1), [dq, filter, supplierId, start, end]);
  // Notifikasi diklik saat halaman ini sudah terbuka: buka faktur yang dimaksud.
  useEffect(() => { if (faktur) setOpenId(faktur); }, [faktur]);

  useEffect(() => {
    if (rangeSalah) return;
    let alive = true;
    setLoading(true);
    void alokasiList({ data: { filter, q: dq, page, supplierId: supplierId ? Number(supplierId) : 0, start, end } })
      .then((res) => { if (alive) { setData(res); setError(""); } })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filter, dq, page, supplierId, start, end, rangeSalah, tick]);

  // Daftar ikut segar saat ada perubahan dari notifikasi / perangkat lain (lencana menu memicu ini).
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener("mjs-alokasi-changed", onChange);
    window.addEventListener("focus", onChange);
    return () => { window.removeEventListener("mjs-alokasi-changed", onChange); window.removeEventListener("focus", onChange); };
  }, []);

  const closeDialog = useCallback(() => {
    setOpenId(null);
    if (faktur) void navigate({ to: "/alokasi", search: {}, replace: true });
  }, [faktur, navigate]);

  const done = () => {
    closeDialog();
    setTick((n) => n + 1);
    tellChanged();
  };

  function resetFilter() {
    setQ(""); setSupplierId(""); setStart(""); setEnd(""); setPage(1);
  }

  const tabs: Array<{ key: Filter; label: string }> = [
    { key: "tindakan", label: "Perlu tindakan" },
    { key: "semua", label: "Semua" },
    { key: "selesai", label: "Selesai" },
    { key: "selisih", label: "Ada selisih" },
  ];
  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <Panel>
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <ClipboardCheck className="size-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-tight text-slate-900">Alokasi Faktur</h2>
            <p className="text-xs text-slate-600">Atur berapa barang dari tiap faktur yang masuk ke gudang. Sisanya otomatis tetap di toko.</p>
          </div>
        </div>
        {data ? <AlurFaktur counts={data.counts} /> : null}
        <div role="tablist" aria-label="Filter faktur" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`h-11 rounded-lg text-sm font-bold transition ${filter === t.key ? "bg-white text-accent shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"}`}
            >
              {t.label}
              {t.key === "tindakan" && data && data.counts.tindakan > 0 ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">{data.counts.tindakan}</span> : null}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-9`} aria-label="Cari faktur" placeholder="Cari nomor faktur, pemasok, atau barang" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={inputClass} aria-label="Filter pemasok" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Semua pemasok</option>
            {(data?.suppliers ?? []).map((sp) => <option key={sp.id} value={sp.id}>{sp.nama}</option>)}
          </select>
          <label className="text-[11px] font-semibold text-slate-600">Dari tanggal
            <input type="date" className={`${inputClass} mt-0.5`} value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">Sampai tanggal
            <input type="date" className={`${inputClass} mt-0.5`} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button type="button" onClick={resetFilter} disabled={!filterAktif} className="h-11 self-end rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-40">Reset</button>
        </div>
        {rangeSalah ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">Tanggal awal lebih besar dari tanggal akhir. Perbaiki dulu supaya daftar tampil.</p> : null}
      </Panel>

      {error ? <Panel><p className="text-sm font-semibold text-red-700">{error}</p></Panel> : null}
      {loading && !data ? <Panel><p className="py-6 text-center text-sm text-slate-600">Memuat…</p></Panel> : null}

      {data && items.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-600">
            {filterAktif ? "Tidak ada faktur sesuai filter. Coba ubah pemasok atau tanggalnya." : filter === "tindakan" ? "Tidak ada faktur yang perlu ditindaklanjuti. Semua sudah beres." : "Tidak ada faktur di tab ini."}
          </p>
        </Panel>
      ) : null}

      {items.length > 0 && wide ? (
        <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${loading ? "opacity-60" : ""}`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-300 bg-slate-100">
              <tr>
                <th className={TH}>Tanggal</th>
                <th className={TH}>No. Faktur</th>
                <th className={TH}>Pemasok</th>
                <th className={TH}>Barang</th>
                <th className={TH}>Tujuan</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  onClick={() => setOpenId(row.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(row.id); } }}
                  className="cursor-pointer border-b border-slate-100 bg-white transition-colors hover:bg-blue-50/70"
                  title="Klik untuk membuka faktur"
                >
                  <td className={`${TD} whitespace-nowrap text-xs text-slate-700`}>{new Date(row.receivedAt).toLocaleDateString("id-ID")}</td>
                  <td className={`${TD} whitespace-nowrap font-mono text-sm font-extrabold text-slate-900`}>{row.invoiceNo}</td>
                  <td className={`${TD} min-w-[160px] font-semibold text-slate-800`}>{row.supplierName}</td>
                  <td className={`${TD} min-w-[200px] text-xs text-slate-700`}>
                    <span className="line-clamp-1 font-semibold text-slate-900">{row.barangPertama || "-"}</span>
                    {row.nItem > 1 ? <span className="text-slate-500">+{row.nItem - 1} barang lainnya</span> : null}
                    {row.nSelisih > 0 ? <b className="ml-1 text-amber-800">· {row.nSelisih} selisih</b> : null}
                  </td>
                  <td className={TD}><TujuanChip nGudang={row.nGudang} /></td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={row.status} />
                      {row.terlambat ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">Terlambat</span> : null}
                    </span>
                    {row.status === "dikembalikan" && row.catatanKembali ? <p className="mt-1 max-w-xs text-[11px] font-semibold text-orange-900">Catatan Admin: {row.catatanKembali}</p> : null}
                    {row.status === "menunggu_cek" && row.alokasiNama ? <p className="mt-1 text-[11px] text-slate-600">Oleh {row.alokasiNama}, {when(row.alokasiPada)}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {items.length > 0 && !wide ? (
        <div className={`space-y-2 ${loading ? "opacity-60" : ""}`}>
          {items.map((row) => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(row.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(row.id); } }}
              className="block w-full cursor-pointer rounded-2xl border border-white/80 bg-panel p-4 text-left shadow-[0_8px_30px_rgba(15,23,42,0.05)] transition hover:border-accent"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-extrabold text-slate-900">{row.invoiceNo}</p>
                <span className="flex items-center gap-1.5">
                  {row.terlambat ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">Terlambat</span> : null}
                  <StatusBadge status={row.status} />
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800">{row.supplierName}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {new Date(row.receivedAt).toLocaleDateString("id-ID")} · {row.nItem} barang · <TujuanChip nGudang={row.nGudang} />
                {row.nSelisih > 0 ? <b className="text-amber-800"> · {row.nSelisih} selisih</b> : null}
              </p>
              {row.status === "dikembalikan" && row.catatanKembali ? (
                <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900">Catatan Admin: {row.catatanKembali}</p>
              ) : null}
              {row.status === "menunggu_cek" && row.alokasiNama ? (
                <p className="mt-1 text-xs text-slate-600">Dialokasikan oleh {row.alokasiNama}, {when(row.alokasiPada)}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {data && data.total > 0 ? <PageBar page={page} total={data.total} perPage={data.perPage} unit="faktur" onPage={setPage} /> : null}

      {openId ? <FakturDialog id={openId} onClose={closeDialog} onDone={done} /> : null}
    </div>
  );
}

function FakturDialog({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: () => void }) {
  const navigate = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [vals, setVals] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<Record<number, string>>({});
  const [selNote, setSelNote] = useState<Record<number, string>>({});
  const [catatan, setCatatan] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null);
    setError("");
    void alokasiGet({ data: { id } })
      .then((res) => {
        if (!alive) return;
        setD(res);
        setVals(Object.fromEntries(res.lines.map((l) => [l.lineId, l.keGudang > 0 ? String(l.keGudang) : ""])));
        setSel(Object.fromEntries(res.lines.map((l) => [l.lineId, l.selisih > 0 ? String(l.selisih) : ""])));
        setSelNote(Object.fromEntries(res.lines.map((l) => [l.lineId, l.selisihCatatan])));
      })
      .catch((err: Error) => alive && setError(err.message));
    return () => { alive = false; };
  }, [id]);

  const numOf = (source: Record<number, string>, lineId: number, max: number) => {
    const raw = source[lineId] ?? "";
    const n = Math.floor(Number(raw));
    if (!raw.trim() || !Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, max);
  };

  const num = (lineId: number, max: number) => numOf(vals, lineId, max);
  const numSel = (lineId: number, max: number) => numOf(sel, lineId, max);

  /** Ke gudang dan selisih berbagi jumlah faktur yang sama: salah satu tidak boleh melebihi sisa yang ditinggalkan yang lain. */
  function setVal(lineId: number, text: string, max: number, other: number, target: "gudang" | "selisih") {
    const digits = text.replace(/\D/g, "").slice(0, 9);
    const n = Math.min(Number(digits), Math.max(0, max - other));
    const next = digits === "" ? "" : String(n);
    if (target === "gudang") setVals((prev) => ({ ...prev, [lineId]: next }));
    else setSel((prev) => ({ ...prev, [lineId]: next }));
  }

  async function save() {
    if (!d) return;
    const noNote = d.lines.find((l) => numSel(l.lineId, l.qty) > 0 && !(selNote[l.lineId] ?? "").trim());
    if (noNote) {
      toast.error(`Isi catatan selisih untuk ${noNote.nama} (mis. rusak, kurang kirim).`);
      return;
    }
    setBusy(true);
    try {
      const res = await alokasiSave({
        data: {
          id,
          lines: d.lines.map((l) => ({ lineId: l.lineId, keGudang: num(l.lineId, l.qty), selisih: numSel(l.lineId, l.qty), selisihCatatan: numSel(l.lineId, l.qty) > 0 ? (selNote[l.lineId] ?? "").trim() : "" })),
          catatan,
        },
      });
      toast.success(d.isAdmin ? `Alokasi faktur ${res.invoiceNo} selesai` : `Alokasi faktur ${res.invoiceNo} dikirim ke Admin`, {
        description: d.isAdmin ? "Stok toko dan gudang sudah disesuaikan." : "Admin akan mendapat notifikasi untuk memeriksa.",
      });
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan alokasi");
    } finally {
      setBusy(false);
    }
  }

  async function review(aksi: "setuju" | "kembalikan") {
    if (aksi === "kembalikan" && !reviewNote.trim()) {
      toast.error("Tulis catatan untuk staf dulu.");
      return;
    }
    setBusy(true);
    try {
      const res = await alokasiReview({ data: { id, aksi, catatan: reviewNote } });
      toast.success(aksi === "setuju" ? `Faktur ${res.invoiceNo} disetujui` : `Faktur ${res.invoiceNo} dikembalikan ke staf`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses");
    } finally {
      setBusy(false);
    }
  }

  /** Surat mutasi dicetak dari alokasi yang SUDAH TERSIMPAN (bukan angka yang sedang diketik). */
  function printMutasi() {
    if (!d) return;
    const items = d.lines.filter((l) => l.keGudang > 0).map((l) => ({
      nama: l.nama,
      kode: l.kodePajak,
      partNumber: l.partNumber,
      qtyText: `${l.keGudang} ${l.satuan}${l.faktor > 1 ? ` (${l.keGudang * l.faktor} ${l.satuanDasar})` : ""}`,
    }));
    try {
      printSuratMutasi({
        nomor: `MT-F${d.id}`,
        tanggal: d.alokasiPada || d.receivedAt,
        dari: "Toko",
        ke: "Gudang",
        referensi: `Alokasi faktur ${d.invoiceNo} (${d.supplierName})`,
        catatan: d.alokasiCatatan,
        petugas: d.alokasiNama,
        items,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencetak");
    }
  }

  function printSelisih() {
    if (!d) return;
    const items = d.lines.filter((l) => l.selisih > 0).map((l) => ({
      nama: l.nama,
      kode: l.kodePajak,
      partNumber: l.partNumber,
      qtyFaktur: `${l.qty} ${l.satuan}`,
      diterima: `${l.qty - l.selisih} ${l.satuan}`,
      selisih: `${l.selisih} ${l.satuan}`,
      catatan: l.selisihCatatan,
    }));
    try {
      printBeritaAcaraSelisih({ invoiceNo: d.invoiceNo, supplierName: d.supplierName, receivedAt: d.receivedAt, petugas: d.alokasiNama, items });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencetak");
    }
  }

  /** Admin: ubah isi faktur (barang, jumlah, harga) di menu Barang Masuk Pemasok. Alokasi dikembalikan dulu lalu dipasang lagi otomatis. */
  function ubahFaktur() {
    if (!d) return;
    void navigate({ to: "/pemasok", search: { edit: d.id } });
  }

  /** Admin: hapus faktur. Konfirmasi menyebut dampak ke stok toko, gudang, dan petugas. */
  async function hapusFaktur() {
    if (!d) return;
    const nGudang = d.lines.filter((l) => l.keGudang > 0).length;
    const dampak = [
      nGudang > 0 ? `${nGudang} barang yang sudah dialokasikan ke gudang akan ditarik dari gudang` : "",
      "stok toko dikurangi sesuai faktur",
      d.status === "menunggu_cek" || d.status === "dikembalikan" ? `${d.alokasiNama || "petugas"} sedang mengerjakan alokasi ini dan akan diberi notifikasi` : "",
    ].filter(Boolean);
    const msg = `Hapus faktur ${d.invoiceNo} (${d.supplierName})? Dampaknya: ${dampak.join("; ")}. Kalau barangnya sudah terjual atau diambil dari gudang, penghapusan ditolak.`;
    if (!(await confirmDialog(msg, { title: "Hapus faktur?", danger: true, confirmText: "Hapus faktur" }))) return;
    setBusy(true);
    try {
      await deleteSupplierReceipt({ data: { id } });
      toast.success(`Faktur ${d.invoiceNo} dihapus`, { description: "Stok toko dan gudang sudah disesuaikan." });
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus faktur");
    } finally {
      setBusy(false);
    }
  }

  const waiting = d?.status === "menunggu_cek";
  const canReview = Boolean(d?.isAdmin && waiting);
  const canEdit = Boolean(d?.canEdit);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-3" onClick={onClose}>
      <div className="flex max-h-[96vh] w-full max-w-3xl flex-col rounded-t-2xl bg-panel shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Alokasi faktur</p>
            <h3 className="truncate font-mono text-lg font-extrabold">{d?.invoiceNo ?? "…"}</h3>
            {d ? <p className="text-xs text-slate-600">{d.supplierName} · {new Date(d.receivedAt).toLocaleDateString("id-ID")}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {d?.terlambat ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">Terlambat</span> : null}
            {d ? <StatusBadge status={d.status} /> : null}
            <button type="button" aria-label="Tutup" onClick={onClose} className="grid size-10 place-items-center rounded-xl border border-line bg-white"><X className="size-4" /></button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
          {!d && !error ? <p className="py-8 text-center text-sm text-slate-600">Memuat…</p> : null}

          {d?.status === "dikembalikan" && d.catatanKembali ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
              <p className="text-[11px] font-extrabold uppercase tracking-wide">Dikembalikan {d.cekNama ? `oleh ${d.cekNama}` : "Admin"}</p>
              <p className="mt-0.5 font-semibold">{d.catatanKembali}</p>
            </div>
          ) : null}
          {d && d.alokasiNama && d.status !== "perlu_alokasi" ? (
            <p className="text-xs text-slate-600">
              Dialokasikan oleh <b>{d.alokasiNama}</b>, {when(d.alokasiPada)}
              {d.alokasiCatatan ? <> · Catatan: {d.alokasiCatatan}</> : null}
              {d.status === "selesai" && d.cekNama ? <> · Dicek <b>{d.cekNama}</b>, {when(d.cekPada)}</> : null}
            </p>
          ) : null}

          {d?.lines.map((l) => {
            const ke = num(l.lineId, l.qty);
            const kurang = numSel(l.lineId, l.qty);
            const toko = l.qty - ke - kurang;
            const stokNote = l.stokToko < 0 ? "" : `Stok sekarang: toko ${l.stokToko}, gudang ${l.stokGudang ?? 0} (${l.satuanDasar})`;
            return (
              <div key={l.lineId} className="rounded-xl border border-line bg-white p-3">
                <p className="break-words text-[15px] font-extrabold leading-snug text-slate-900">{l.nama}</p>
                <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {l.kodePajak ? <p>Kode Pajak <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 font-mono font-bold text-violet-800">{l.kodePajak}</span></p> : null}
                  <p>Part Number <span className="font-mono font-semibold text-slate-800">{l.partNumber || "-"}</span></p>
                  {l.partNumbersAlt ? <p>Part Number Alt <span className="font-mono font-semibold text-slate-800">{l.partNumbersAlt}</span></p> : null}
                  <p>{[l.kategori, l.merek].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-100 px-2 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Jumlah faktur</p>
                    <p className="text-lg font-extrabold">{l.qty} <span className="text-xs font-semibold">{l.satuan}</span></p>
                  </div>
                  <label className="rounded-lg border-2 border-emerald-300 bg-emerald-50 px-2 py-2">
                    <span className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800"><Warehouse className="size-3" />Ke gudang</span>
                    <input
                      inputMode="numeric"
                      aria-label={`Ke gudang untuk ${l.nama}`}
                      disabled={!canEdit || busy}
                      className="num mt-0.5 h-10 w-full rounded-md border border-emerald-200 bg-white text-center text-lg font-extrabold disabled:opacity-60"
                      placeholder="0"
                      value={vals[l.lineId] ?? ""}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setVal(l.lineId, e.target.value, l.qty, kurang, "gudang")}
                    />
                  </label>
                  <div className="rounded-lg bg-blue-50 px-2 py-2">
                    <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-800"><Store className="size-3" />Ke toko</p>
                    <p className="mt-1 text-lg font-extrabold text-blue-900">{toko}</p>
                  </div>
                </div>
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <label className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-900">
                    <span>Kurang / rusak (tidak ikut diterima)</span>
                    <input
                      inputMode="numeric"
                      aria-label={`Kurang atau rusak untuk ${l.nama}`}
                      disabled={!canEdit || busy}
                      className="num h-9 w-20 rounded-md border border-amber-300 bg-white text-center text-base font-extrabold disabled:opacity-60"
                      placeholder="0"
                      value={sel[l.lineId] ?? ""}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setVal(l.lineId, e.target.value, l.qty, ke, "selisih")}
                    />
                  </label>
                  {kurang > 0 ? (
                    <input
                      disabled={!canEdit || busy}
                      maxLength={300}
                      className={`${inputClass} mt-1.5 !h-9 !text-xs`}
                      placeholder="Catatan wajib: rusak, kurang kirim, salah barang, dll."
                      value={selNote[l.lineId] ?? ""}
                      onChange={(e) => setSelNote((prev) => ({ ...prev, [l.lineId]: e.target.value }))}
                    />
                  ) : null}
                </div>
                <p className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>{stokNote}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-emerald-700"><Check className="size-3" />{ke} + {toko}{kurang > 0 ? ` + ${kurang}` : ""} = {l.qty}</span>
                </p>
              </div>
            );
          })}

          {d && canEdit ? (
            <label className="block text-sm font-semibold text-slate-800">
              Catatan (opsional)
              <input className={`${inputClass} mt-1`} maxLength={300} disabled={busy} placeholder="Contoh: 7 dus ditaruh di rak gudang A" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            </label>
          ) : null}

          {d && !canEdit && !canReview ? (
            <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {d.status === "menunggu_cek" ? "Alokasi sudah dikirim dan menunggu pengecekan Admin." : "Faktur ini sudah selesai. Hanya Admin yang dapat mengubah alokasinya."}
            </p>
          ) : null}

          {canReview ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-extrabold text-amber-900">Pemeriksaan Admin</p>
              <p className="mt-0.5 text-xs text-amber-900">Cocokkan angka di atas dengan barang yang ada di gudang dan toko. Setujui kalau sudah benar, atau kembalikan ke staf dengan catatan.</p>
              <input className={`${inputClass} mt-2`} maxLength={300} disabled={busy} placeholder="Catatan untuk staf (wajib kalau dikembalikan)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
            </div>
          ) : null}
          {d?.isAdmin ? (
            <div className="rounded-xl border border-line bg-slate-50 p-3">
              <p className="text-sm font-extrabold text-slate-900">Kelola faktur (Admin)</p>
              <p className="mt-0.5 text-xs text-slate-600">Salah catat barang, jumlah, atau harga? Ubah fakturnya. Alokasi gudang dikembalikan dulu lalu dipasang lagi otomatis, jadi stok tidak bentrok.</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button type="button" disabled={busy} onClick={ubahFaktur} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-50"><Pencil className="size-4" />Ubah faktur</button>
                <button type="button" disabled={busy} onClick={() => void hapusFaktur()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 disabled:opacity-50"><Trash2 className="size-4" />Hapus faktur</button>
              </div>
            </div>
          ) : null}
        </div>

        {d ? (
          <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
            {d.lines.some((l) => l.keGudang > 0) ? (
              <button type="button" onClick={printMutasi} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold"><FileText className="size-4" />Cetak surat mutasi</button>
            ) : null}
            {d.lines.some((l) => l.selisih > 0) ? (
              <button type="button" onClick={printSelisih} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900"><FileText className="size-4" />Cetak berita acara selisih</button>
            ) : null}
            {canEdit ? (
              <button type="button" disabled={busy} onClick={() => setVals({})} className="h-12 rounded-xl border border-line bg-white px-4 text-sm font-semibold disabled:opacity-50">Semua ke toko</button>
            ) : null}
            {canReview ? (
              <>
                <button type="button" disabled={busy} onClick={() => void review("kembalikan")} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-orange-300 bg-white px-4 text-sm font-bold text-orange-800 disabled:opacity-50"><Undo2 className="size-4" />Kembalikan ke staf</button>
                <button type="button" disabled={busy} onClick={() => void review("setuju")} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-extrabold text-white disabled:opacity-50"><Check className="size-4" />Setujui</button>
              </>
            ) : null}
            {canEdit ? (
              <button type="button" disabled={busy} onClick={() => void save()} className="h-12 rounded-xl bg-accent px-5 text-sm font-extrabold text-white disabled:opacity-50">
                {d.isAdmin ? "Simpan dan selesaikan" : "Simpan dan kirim ke Admin"}
              </button>
            ) : null}
            {!canEdit && !canReview ? <button type="button" onClick={onClose} className="h-12 rounded-xl border border-line bg-white px-5 text-sm font-semibold">Tutup</button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
