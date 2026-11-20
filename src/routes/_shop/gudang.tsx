import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft, Check, ClipboardCheck, History, Pencil, Plus, Search, SlidersHorizontal, Trash2, Warehouse, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AmbilDialog, EditLogDialog, ItemIdentity, SesuaikanDialog, TambahDialog } from "@/components/shop/gudang-dialogs";
import { GudangHitungDialog } from "@/components/shop/gudang-hitung";
import { Pager } from "@/components/shop/opname-ui";
import { Panel, inputClass } from "@/components/shop/shell";
import { confirmDialog } from "@/lib/confirm";
import { usePersistedState } from "@/lib/persist";
import { gudangCek, gudangHapusItem, gudangHapusLog, gudangList, gudangLogs } from "@/lib/shop/api";
import { formatQtyPack, when } from "@/lib/shop/format";
import type { GudangItem, GudangLog } from "@/lib/shop/types";

type Tab = "stok" | "riwayat";
type ListData = Awaited<ReturnType<typeof gudangList>>;
type LogData = Awaited<ReturnType<typeof gudangLogs>>;

const asId = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/_shop/gudang")({
  // ?tab=riwayat membuka riwayat; ?hid=ID menyaring riwayat satu barang.
  validateSearch: (search: Record<string, unknown>): { tab?: "riwayat"; hid?: number } => ({
    tab: search.tab === "riwayat" ? "riwayat" : undefined,
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
        <div role="tablist" aria-label="Menu Stok Gudang" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {([
            { key: "stok", label: "Stok Gudang" },
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
      {tab === "stok" ? <StokTab onHistory={(id) => void navigate({ to: "/gudang", search: { tab: "riwayat", hid: id } })} /> : <RiwayatTab hid={hid} onClearHid={() => void navigate({ to: "/gudang", search: { tab: "riwayat" }, replace: true })} />}
    </div>
  );
}

function StokTab({ onHistory }: { onHistory: (productId: number) => void }) {
  const [q, setQ] = usePersistedState("gudang:q", "");
  const [kategori, setKategori] = usePersistedState("gudang:kategori", "");
  const [hanyaStok, setHanyaStok] = usePersistedState("gudang:hanyaStok", false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<{ kind: "tambah-barang" } | { kind: "tambah" | "ambil" | "sesuaikan" | "opname"; item: GudangItem } | null>(null);
  const dq = useDebounced(q.trim());

  useEffect(() => setPage(1), [dq, kategori, hanyaStok]);

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
          <article key={item.productId} className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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
                <button type="button" disabled={item.stokGudang <= 0} onClick={() => setDialog({ kind: "ambil", item })} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-bold text-white disabled:opacity-40">
                  <ArrowRightLeft className="size-4" /> Ambil
                </button>
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
              <button type="button" aria-label="Riwayat barang" onClick={() => onHistory(item.productId)} className="grid size-10 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700">
                <History className="size-4" />
              </button>
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

      {dialog?.kind === "tambah-barang" ? <TambahDialog onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "tambah" ? <TambahDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "ambil" ? <AmbilDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "sesuaikan" ? <SesuaikanDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === "opname" ? <GudangHitungDialog item={dialog.item} canCount={bisaUbah} admin={admin} onClose={() => setDialog(null)} onChanged={load} onDone={done} /> : null}
    </>
  );
}

const TIPE_LABEL: Record<GudangLog["tipe"], { text: string; cls: string }> = {
  MASUK: { text: "Tambah stok", cls: "bg-emerald-100 text-emerald-800" },
  PINDAH: { text: "Ambil ke toko", cls: "bg-blue-100 text-blue-800" },
  KOREKSI: { text: "Koreksi", cls: "bg-amber-100 text-amber-900" },
  OPNAME: { text: "Opname", cls: "bg-violet-100 text-violet-800" },
};

function jumlahText(log: GudangLog) {
  const text = fmtItem(Math.abs(log.jumlah), log);
  if (log.tipe === "MASUK") return `+${text} ke gudang`;
  if (log.tipe === "PINDAH") return `${text}: gudang ke toko`;
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

  const admin = Boolean(data?.admin);
  const belumIds = (data?.items ?? []).filter((l) => (l.tipe === "MASUK" || l.tipe === "PINDAH") && !l.dicek).map((l) => l.id);

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
              {log.tipe === "MASUK" || log.tipe === "PINDAH" ? (
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
            {admin ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {log.tipe === "MASUK" || log.tipe === "PINDAH" ? (
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
