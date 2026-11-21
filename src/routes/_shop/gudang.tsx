import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft, Check, Store, ClipboardCheck, FileText, History, Pencil, Plus, Search, SlidersHorizontal, Trash2, Warehouse, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AmbilDialog, EditLogDialog, ItemIdentity, SesuaikanDialog, SetorDialog, TambahDialog, fmt } from "@/components/shop/gudang-dialogs";
import { GudangHitungDialog } from "@/components/shop/gudang-hitung";
import { Pager } from "@/components/shop/opname-ui";
import { Panel, inputClass } from "@/components/shop/shell";
import { confirmDialog } from "@/lib/confirm";
import { usePersistedState } from "@/lib/persist";
import { gudangCek, gudangHapusItem, gudangHapusLog, gudangList, gudangLogs, gudangPerluDiambil } from "@/lib/shop/api";
import { printSuratMutasi } from "@/lib/shop/print";
import { formatQtyPack, when } from "@/lib/shop/format";
import type { GudangItem, GudangLog } from "@/lib/shop/types";

type Tab = "stok" | "riwayat" | "perlu";
type ListData = Awaited<ReturnType<typeof gudangList>>;
type LogData = Awaited<ReturnType<typeof gudangLogs>>;

const asId = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/_shop/gudang")({
  // ?tab=riwayat membuka riwayat; ?hid=ID menyaring riwayat satu barang.
  validateSearch: (search: Record<string, unknown>): { tab?: "riwayat" | "perlu"; hid?: number } => ({
    tab: search.tab === "riwayat" || search.tab === "perlu" ? search.tab : undefined,
    hid: asId(search.hid),
  }),
  component: GudangPage,
});

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const fmtItem = (base: number, u: { satuan: string; satuanAlt: string; isiSatuanAlt: number }) => formatQtyPack(base, u.satuan, u.satuanAlt, u.isiSatuanAlt);

function GudangPage() {
  const { tab: tabParam, hid } = Route.useSearch();
  const me = Route.useRouteContext().me;
  const navigate = useNavigate();
  // Akun yang hanya boleh melihat (tanpa izin Stok Gudang) hanya mendapat daftar stok, seperti Daftar Sparepart.
  const showRiwayat = me.role === "Admin" || me.role === "Owner" || Boolean(me.canGudang);
  const tab: Tab = showRiwayat ? (tabParam ?? "stok") : "stok";
  const goTab = (next: Tab) => void navigate({ to: "/gudang", search: next === "stok" ? {} : { tab: next } });

  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Warehouse className="size-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-tight text-slate-900">Stok Gudang</h2>
            <p className="text-xs text-slate-600">Penyimpanan stok berlebih. Barang diambil ke toko, stok toko di Daftar Sparepart langsung bertambah.</p>
          </div>
        </div>
        {showRiwayat ? (
        <div role="tablist" aria-label="Menu Stok Gudang" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {([
            { key: "stok", label: "Stok Gudang" },
            { key: "perlu", label: "Perlu Diambil" },
            { key: "riwayat", label: "Riwayat Mutasi" },
          ] as Array<{ key: Tab; label: string }>).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => goTab(t.key)}
              className={`h-11 rounded-lg text-sm font-bold transition ${tab === t.key ? "bg-white text-accent shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        ) : null}
      </Panel>
      {tab === "perlu" ? <PerluTab /> : tab === "stok" ? <StokTab canHistory={showRiwayat} onHistory={(id) => void navigate({ to: "/gudang", search: { tab: "riwayat", hid: id } })} /> : <RiwayatTab hid={hid} onClearHid={() => void navigate({ to: "/gudang", search: { tab: "riwayat" }, replace: true })} />}
    </div>
  );
}

function StokTab({ onHistory, canHistory }: { onHistory: (productId: number) => void; canHistory: boolean }) {
  const [q, setQ] = usePersistedState("gudang:q", "");
  const [kategori, setKategori] = usePersistedState("gudang:kategori", "");
  const [hanyaStok, setHanyaStok] = usePersistedState("gudang:hanyaStok", false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<{ kind: "tambah-barang" } | { kind: "tambah" | "ambil" | "setor" | "sesuaikan" | "opname"; item: GudangItem } | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const dq = useDebounced(q.trim());

  useEffect(() => setPage(1), [dq, kategori, hanyaStok]);

  // Barang yang dipilih di "Tambah barang ke gudang" tetapi sudah ada di gudang: tampilkan kartunya dan sorot sebentar.
  function goToExisting(row: { productId: number; nama: string; satuan: string; satuanAlt: string; isiSatuanAlt: number; stokGudang?: number | null }) {
    setDialog(null);
    setKategori("");
    setHanyaStok(false);
    setQ(row.nama);
    setFocusId(row.productId);
    toast.info("Barang sudah ada di gudang", { description: `${row.nama}: stok gudang ${fmt(row.stokGudang ?? 0, row)}. Pakai tombol Tambah stok pada kartunya.` });
  }

  const load = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void gudangList({ data: { q: dq, kategori, hanyaStok, page } })
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError("");
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, kategori, hanyaStok, page, tick]);

  const done = () => {
    setDialog(null);
    load();
  };

  useEffect(() => {
    if (focusId == null || !data || loading) return;
    const el = document.getElementById(`gudang-item-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(() => setFocusId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusId, data, loading]);

  async function removeItem(item: GudangItem) {
    if (!(await confirmDialog(`Hapus "${item.nama}" dari daftar gudang? Data di Daftar Sparepart tidak ikut terhapus.`, { title: "Hapus dari daftar gudang", confirmText: "Hapus" }))) return;
    try {
      let res = await gudangHapusItem({ data: { productId: item.productId } });
      if (!res.ok && "masihAdaStok" in res) {
        const ok = await confirmDialog(`Barang ini masih punya stok gudang ${res.sisa}. Jika dihapus, stok gudangnya ikut dihapus dan tercatat di riwayat. Lanjutkan?`, { title: "Stok gudang masih ada", confirmText: "Hapus juga stoknya", danger: true });
        if (!ok) return;
        res = await gudangHapusItem({ data: { productId: item.productId, force: true } });
      }
      if (res.ok) {
        toast.success("Dihapus dari daftar gudang", { description: item.nama });
        load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    }
  }

  const bisaUbah = Boolean(data?.bisaUbah);
  const admin = Boolean(data?.admin);

  return (
    <>
      <Panel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-9`} placeholder="Cari nama, part number, kode pajak" aria-label="Cari barang gudang" value={q} onChange={(event) => setQ(event.target.value)} />
          </div>
          <select className={`${inputClass} sm:!w-48`} aria-label="Kategori" value={kategori} onChange={(event) => setKategori(event.target.value)}>
            <option value="">Semua kategori</option>
            {(data?.kategori ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {bisaUbah ? (
            <button type="button" onClick={() => setDialog({ kind: "tambah-barang" })} className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-white">
              <Plus className="size-4" /> Tambah barang ke gudang
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={hanyaStok} onChange={(event) => setHanyaStok(event.target.checked)} /> Hanya yang ada stok
          </label>
          {data ? (
            <span>
              {data.total.toLocaleString("id-ID")} barang di gudang · {data.adaStok.toLocaleString("id-ID")} ada stok
            </span>
          ) : null}
        </div>
      </Panel>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      {data && !bisaUbah ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">Akun Anda hanya dapat melihat stok gudang.</p> : null}
      {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Memuat...</p> : null}
      {data && data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {data.total === 0 && !dq && !kategori && !hanyaStok
            ? bisaUbah
              ? "Belum ada barang di gudang. Klik Tambah barang ke gudang untuk memilih barang dari Daftar Sparepart."
              : "Belum ada barang di gudang."
            : "Tidak ada barang yang cocok dengan pencarian."}
        </div>
      ) : null}

      <div className={`grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
        {data?.items.map((item) => (
          <article key={item.productId} id={`gudang-item-${item.productId}`} className={`flex flex-col rounded-xl border bg-white p-3 shadow-sm transition ${focusId === item.productId ? "border-amber-400 ring-2 ring-amber-300" : "border-slate-200"}`}>
            <ItemIdentity item={item} />
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-center">
              <div className={`rounded-lg p-2 ${item.stokGudang > 0 ? "bg-emerald-50" : "bg-slate-100"}`}>
                <p className="text-[11px] font-semibold text-slate-600">Stok gudang</p>
                <p className="text-base font-extrabold text-slate-900">{fmtItem(item.stokGudang, item)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2">
                <p className="text-[11px] font-semibold text-slate-600">Stok toko</p>
                <p className="text-base font-extrabold text-slate-900">{fmtItem(item.stokToko, item)}</p>
              </div>
            </div>
            {admin ? (
              <p className="mt-1.5 text-[11px] text-slate-500">
                {item.opnamePada ? `Opname terakhir ${when(item.opnamePada)}, ${item.opnameSelisih === 0 ? "cocok" : `selisih ${(item.opnameSelisih ?? 0) > 0 ? "+" : "-"}${fmtItem(Math.abs(item.opnameSelisih ?? 0), item)}`}` : "Belum pernah di-opname"}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {bisaUbah ? (
                <div className="grid w-full grid-cols-2 gap-1.5">
                  <button type="button" disabled={item.stokGudang <= 0} title="Pindahkan dari gudang ke toko" onClick={() => setDialog({ kind: "ambil", item })} className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-bold text-white disabled:opacity-40">
                    <Store className="size-4" /> Ambil ke toko
                  </button>
                  <button type="button" disabled={item.stokToko <= 0} title="Pindahkan dari toko ke gudang" onClick={() => setDialog({ kind: "setor", item })} className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40">
                    <Warehouse className="size-4" /> Simpan ke gudang
                  </button>
                </div>
              ) : null}
              {bisaUbah ? (
                <button type="button" onClick={() => setDialog({ kind: "tambah", item })} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800">
                  <Plus className="size-4" /> Tambah stok
                </button>
              ) : null}
              {bisaUbah ? (
                <button type="button" aria-label="Hitung stok gudang" title="Hitung stok gudang (hitungan sementara)" onClick={() => setDialog({ kind: "opname", item })} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 text-sm font-bold text-violet-900">
                  <ClipboardCheck className="size-4" /> Hitung
                </button>
              ) : null}
              {canHistory ? (
                <button type="button" aria-label="Riwayat barang" title="Riwayat mutasi barang ini" onClick={() => onHistory(item.productId)} className="grid size-10 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700">
                  <History className="size-4" />
                </button>
              ) : null}
              {admin ? (
                <>
                  <button type="button" aria-label="Sesuaikan stok" title="Sesuaikan stok" onClick={() => setDialog({ kind: "sesuaikan", item })} className="grid size-10 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700">
                    <SlidersHorizontal className="size-4" />
                  </button>
                  <button type="button" aria-label="Hapus dari gudang" title="Hapus dari daftar gudang" onClick={() => void removeItem(item)} className="grid size-10 place-items-center rounded-lg border border-red-200 bg-white text-red-600">
                    <Trash2 className="size-4" />
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {data ? <Pager page={data.page} total={data.total} perPage={data.perPage} onPage={setPage} /> : null}

      {dialog?.kind === "tambah-barang" ? <TambahDialog onClose={() => setDialog(null)} onDone={done} onExisting={goToExisting} /> : null}
      {dialog?.kind === "tambah" ? <TambahDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "ambil" ? <AmbilDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "setor" ? <SetorDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "sesuaikan" ? <SesuaikanDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "opname" ? <GudangHitungDialog item={dialog.item} canCount={bisaUbah} admin={admin} onClose={() => setDialog(null)} onChanged={load} onDone={done} /> : null}
    </>
  );
}

const TIPE_LABEL: Record<GudangLog["tipe"], { text: string; cls: string }> = {
  MASUK: { text: "Tambah stok", cls: "bg-emerald-100 text-emerald-800" },
  PINDAH: { text: "Ambil ke toko", cls: "bg-blue-100 text-blue-800" },
  SETOR: { text: "Simpan ke gudang", cls: "bg-teal-100 text-teal-800" },
  KOREKSI: { text: "Koreksi", cls: "bg-amber-100 text-amber-900" },
  OPNAME: { text: "Opname", cls: "bg-violet-100 text-violet-800" },
};

function jumlahText(log: GudangLog) {
  const text = fmtItem(Math.abs(log.jumlah), log);
  if (log.tipe === "MASUK") return `+${text} ke gudang`;
  if (log.tipe === "PINDAH") return `${text}: gudang ke toko`;
  if (log.tipe === "SETOR") return `${text}: toko ke gudang`;
  if (log.tipe === "OPNAME") return log.jumlah === 0 ? `hitung fisik ${fmtItem(log.qtyInput, log)}, cocok` : `hitung fisik ${fmtItem(log.qtyInput, log)}, selisih ${log.jumlah < 0 ? "-" : "+"}${text}`;
  return `${log.jumlah < 0 ? "-" : "+"}${text}`;
}

function RiwayatTab({ hid, onClearHid }: { hid?: number; onClearHid: () => void }) {
  const [q, setQ] = usePersistedState("gudang:rq", "");
  const [tipe, setTipe] = usePersistedState("gudang:rtipe", "");
  const [belumDicek, setBelumDicek] = usePersistedState("gudang:rbelum", false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState<GudangLog | null>(null);
  const dq = useDebounced(q.trim());

  useEffect(() => setPage(1), [dq, tipe, belumDicek, hid]);

  const load = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void gudangLogs({ data: { q: dq, tipe, belumDicek, productId: hid ?? null, page } })
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError("");
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, tipe, belumDicek, hid, page, tick]);

  async function cek(ids: number[], nilai: boolean) {
    try {
      await gudangCek({ data: { logIds: ids, nilai } });
      toast.success(nilai ? "Ditandai sudah dicek" : "Tanda dicek dibatalkan");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menandai.");
    }
  }

  async function remove(log: GudangLog) {
    const efek =
      log.tipe === "PINDAH"
        ? "Stok gudang dikembalikan dan stok toko dikurangi."
        : log.tipe === "SETOR"
          ? "Stok gudang dikurangi dan stok toko dikembalikan."
          : log.tipe === "MASUK"
          ? "Stok gudang dikurangi sebesar catatan ini."
          : "Pengaruh koreksi pada stok gudang dibatalkan.";
    if (!(await confirmDialog(`Hapus catatan "${log.nama}" (${jumlahText(log)})? ${efek}`, { title: "Hapus catatan gudang", confirmText: "Hapus" }))) return;
    try {
      await gudangHapusLog({ data: { logId: log.id } });
      toast.success("Catatan dihapus dan stok dikoreksi", { description: log.nama });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus catatan.");
    }
  }

  /** Surat mutasi satu catatan. Arah: Ambil ke toko = Gudang ke Toko; alokasi faktur = Toko ke Gudang; tambah stok lain = masuk gudang. */
  function cetakSurat(log: GudangLog) {
    const dariAlokasi = log.catatan.startsWith("Alokasi faktur");
    const dari = log.tipe === "PINDAH" ? "Gudang" : dariAlokasi || log.tipe === "SETOR" ? "Toko" : "Luar (pemasok / lainnya)";
    const ke = log.tipe === "PINDAH" ? "Toko" : "Gudang";
    try {
      printSuratMutasi({
        nomor: `MT-${log.id}`,
        tanggal: log.tanggal,
        dari,
        ke,
        referensi: dariAlokasi ? log.catatan : undefined,
        catatan: dariAlokasi ? "" : log.catatan,
        petugas: log.olehNama || log.oleh,
        items: [{ nama: log.nama, kode: log.kode, partNumber: log.partNumber, qtyText: fmtItem(Math.abs(log.jumlah), log) }],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencetak");
    }
  }

  const admin = Boolean(data?.admin);
  const belumIds = (data?.items ?? []).filter((l) => (l.tipe === "MASUK" || l.tipe === "PINDAH" || l.tipe === "SETOR") && !l.dicek).map((l) => l.id);

  return (
    <>
      <Panel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-9`} placeholder="Cari barang, petugas, atau catatan" aria-label="Cari riwayat" value={q} onChange={(event) => setQ(event.target.value)} />
          </div>
          <select className={`${inputClass} sm:!w-44`} aria-label="Jenis catatan" value={tipe} onChange={(event) => setTipe(event.target.value)}>
            <option value="">Semua jenis</option>
            <option value="MASUK">Tambah stok</option>
            <option value="PINDAH">Ambil ke toko</option>
            <option value="SETOR">Simpan ke gudang</option>
            <option value="KOREKSI">Koreksi</option>
            <option value="OPNAME">Opname</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={belumDicek} onChange={(event) => setBelumDicek(event.target.checked)} /> Belum dicek Admin
            {data ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">{data.belumDicek}</span> : null}
          </label>
          {admin && belumIds.length > 0 ? (
            <button type="button" onClick={() => void cek(belumIds, true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-800">
              <Check className="size-4" /> Tandai {belumIds.length} yang tampil sudah dicek
            </button>
          ) : null}
        </div>
        {hid ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Menampilkan riwayat satu barang.
            <button type="button" onClick={onClearHid} className="ml-auto flex items-center gap-1 font-bold">
              <X className="size-3.5" /> Tampilkan semua
            </button>
          </div>
        ) : null}
      </Panel>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Memuat...</p> : null}
      {data && data.items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada catatan mutasi.</div> : null}

      <div className={`space-y-2 ${loading ? "opacity-60" : ""}`}>
        {data?.items.map((log) => (
          <article key={log.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TIPE_LABEL[log.tipe].cls}`}>{TIPE_LABEL[log.tipe].text}</span>
              <span className="text-xs text-slate-500">{when(log.tanggal)}</span>
              {log.tipe === "MASUK" || log.tipe === "PINDAH" || log.tipe === "SETOR" ? (
                log.dicek ? (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Dicek{log.dicekNama ? ` oleh ${log.dicekNama}` : ""}</span>
                ) : (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Belum dicek</span>
                )
              ) : null}
            </div>
            <p className="mt-1.5 break-words text-[15px] font-extrabold leading-snug text-slate-900">{log.nama}</p>
            <p className="text-xs text-slate-600">
              {log.partNumber || log.kode} · <b className="text-slate-900">{jumlahText(log)}</b>
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              Oleh {log.olehNama || log.oleh || "-"}
              {log.catatan ? ` · ${log.catatan}` : ""}
              {log.diubahNama ? ` · diedit ${log.diubahNama}` : ""}
            </p>
            {log.tipe === "MASUK" || log.tipe === "PINDAH" || log.tipe === "SETOR" ? (
              <button type="button" onClick={() => cetakSurat(log)} className="mt-2 flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800">
                <FileText className="size-4" /> Cetak surat mutasi
              </button>
            ) : null}
            {admin ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {log.tipe === "MASUK" || log.tipe === "PINDAH" || log.tipe === "SETOR" ? (
                  <button type="button" onClick={() => void cek([log.id], !log.dicek)} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800">
                    <Check className="size-4" /> {log.dicek ? "Batalkan tanda dicek" : "Tandai sudah dicek"}
                  </button>
                ) : null}
                {log.itemAda ? (
                  <>
                    <button type="button" onClick={() => setEdit(log)} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800">
                      <Pencil className="size-4" /> Edit
                    </button>
                    <button type="button" onClick={() => void remove(log)} className="flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-600">
                      <Trash2 className="size-4" /> Hapus
                    </button>
                  </>
                ) : (
                  <span className="self-center text-[11px] text-slate-500">Barang sudah dihapus dari daftar gudang, catatan hanya bisa dilihat.</span>
                )}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {data ? <Pager page={data.page} total={data.total} perPage={data.perPage} onPage={setPage} /> : null}

      {edit ? (
        <EditLogDialog
          log={edit}
          onClose={() => setEdit(null)}
          onDone={() => {
            setEdit(null);
            load();
          }}
        />
      ) : null}
    </>
  );
}


type PerluData = Awaited<ReturnType<typeof gudangPerluDiambil>>;

/** Barang yang stok tokonya sudah di bawah minimum tetapi masih ada di gudang. Saran: isi toko sampai 2x stok minimum. */
function PerluTab() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<PerluData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [ambil, setAmbil] = useState<PerluData["items"][number] | null>(null);
  const dq = useDebounced(q.trim());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void gudangPerluDiambil({ data: { q: dq } })
      .then((res) => { if (alive) { setData(res); setError(""); } })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [dq, tick]);

  return (
    <>
      <Panel>
        <p className="text-sm font-extrabold text-slate-900">Perlu diambil dari gudang</p>
        <p className="mt-0.5 text-xs text-slate-600">Stok toko sudah sama dengan atau di bawah stok minimum, sedangkan gudang masih ada. Jumlah saran mengisi toko sampai 2 kali stok minimum (paling banyak sebesar stok gudang) dan bisa diubah saat mengambil.</p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder="Cari barang" aria-label="Cari barang" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Panel>
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Memuat...</p> : null}
      {data && data.items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Tidak ada barang yang perlu diambil dari gudang.</div> : null}
      <div className={`space-y-2 ${loading ? "opacity-60" : ""}`}>
        {data?.items.map((item) => (
          <article key={item.productId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words text-[15px] font-extrabold leading-snug text-slate-900">{item.nama}</p>
                <p className="text-xs text-slate-600">{[item.partNumber || item.kode, item.merek, item.kategori].filter(Boolean).join(" · ")}</p>
              </div>
              {item.stokToko <= 0 ? <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold text-white">Toko habis</span> : <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-900">Menipis</span>}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-100 p-2"><p className="text-slate-600">Stok toko</p><p className="text-sm font-extrabold text-slate-900">{fmtItem(item.stokToko, item)}</p></div>
              <div className="rounded-lg bg-slate-100 p-2"><p className="text-slate-600">Minimum</p><p className="text-sm font-extrabold text-slate-900">{fmtItem(item.stokMin, item)}</p></div>
              <div className="rounded-lg bg-emerald-50 p-2"><p className="text-emerald-800">Stok gudang</p><p className="text-sm font-extrabold text-emerald-900">{fmtItem(item.stokGudang, item)}</p></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-700">Saran ambil: <b className="text-slate-900">{fmtItem(item.saran, item)}</b></p>
              {data.bisaUbah ? (
                <button type="button" onClick={() => setAmbil(item)} className="flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-bold text-white">
                  <ArrowRightLeft className="size-4" /> Ambil ke toko
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {ambil ? <AmbilDialog item={ambil} initialQty={ambil.saran} onClose={() => setAmbil(null)} onDone={() => { setAmbil(null); setTick((n) => n + 1); }} /> : null}
    </>
  );
}
