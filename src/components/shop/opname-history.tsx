import { Trash2, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { inputClass, Panel } from "@/components/shop/shell";
import { BatalBadge, HasilBadge, Metric } from "@/components/shop/opname-ui";
import { batalOpnameCheck, batalOpnameGroup, getOpnameDetail, hapusOpnameRiwayat, listOpnameHistory } from "@/lib/shop/api";

type HistoryData = Awaited<ReturnType<typeof listOpnameHistory>>;
type Row = HistoryData["items"][number];
type Detail = Awaited<ReturnType<typeof getOpnameDetail>>;

const TZ = "Asia/Makassar";
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD
const shiftDay = (n: number) => dayKey(new Date(Date.now() + n * 86400000));
const dateLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const timeOnly = (ts: string) =>
  new Date(ts).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(".", ":");
const fmt = (n: number) => n.toLocaleString("id-ID");

/** Beri tahu menu di sidebar supaya angka merahnya diperbarui. */
const notifyChanged = () => window.dispatchEvent(new Event("mjs-opname-changed"));

const RANGES = [
  { id: "all", label: "Semua tanggal", days: 0 },
  { id: "7", label: "7 hari", days: 7 },
  { id: "30", label: "30 hari", days: 30 },
  { id: "90", label: "3 bulan", days: 90 },
];

const btn = "inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";
const btnDanger = "inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-danger hover:bg-red-100 disabled:opacity-50";

/** Kolom daftar riwayat di layar lebar: Tanggal | Kategori | Dicek | Hasil | Oleh. */
const GRID = "md:grid md:grid-cols-[120px_minmax(0,1fr)_90px_minmax(170px,auto)_130px] md:items-center md:gap-4";

function ResultBadges({ row }: { row: Row }) {
  const aktif = row.dicek - row.batal;
  return (
    <div className="flex flex-wrap gap-1">
      {aktif <= 0 ? <BatalBadge /> : row.selisih === 0 ? <HasilBadge hasil="cocok" /> : <span className="inline-block whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{row.selisih} selisih</span>}
      {row.habis > 0 ? <span className="inline-block whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{row.habis} habis</span> : null}
      {row.batal > 0 && aktif > 0 ? <span className="inline-block whitespace-nowrap rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">{row.batal} dibatalkan</span> : null}
    </div>
  );
}

export function OpnameHistory() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState("all");
  const [kategori, setKategori] = useState("");
  const [q, setQ] = useState("");
  const [onlySelisih, setOnlySelisih] = useState(false);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    const seq = ++loadSeq.current;
    const timer = setTimeout(() => {
      void listOpnameHistory({ data: { from, to, kategori, q, onlySelisih, page } })
        .then((res) => {
          if (seq !== loadSeq.current) return;
          const pages = Math.max(1, Math.ceil(res.total / res.perPage));
          if (page > pages) { setPage(pages); return; }
          setError("");
          setData(res);
        })
        .catch((e: Error) => {
          if (seq !== loadSeq.current) return;
          setError(e.message || "Gagal memuat riwayat.");
        });
    }, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [from, to, kategori, q, onlySelisih, page, reload]);

  function pickRange(id: string, days: number) {
    setRange(id);
    setPage(1);
    setFrom(days ? shiftDay(-days) : "");
    setTo(days ? shiftDay(0) : "");
  }

  function clearFilters() {
    setFrom(""); setTo(""); setRange("all"); setKategori(""); setQ(""); setOnlySelisih(false); setPage(1);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 10;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const filtered = Boolean(from || to || kategori || q || onlySelisih);

  return (
    <>
      <Panel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-slate-600">
            Dari tanggal
            <input type="date" className={`${inputClass} mt-1`} value={from} max={to || undefined} onChange={(e) => { setRange(""); setPage(1); setFrom(e.target.value); }} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Sampai tanggal
            <input type="date" className={`${inputClass} mt-1`} value={to} min={from || undefined} onChange={(e) => { setRange(""); setPage(1); setTo(e.target.value); }} />
          </label>
          <label className="col-span-2 block text-xs font-semibold text-slate-600 lg:col-span-1">
            Kategori
            <select className={`${inputClass} mt-1`} value={kategori} onChange={(e) => { setPage(1); setKategori(e.target.value); }}>
              <option value="">Semua kategori</option>
              {(data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="col-span-2 block text-xs font-semibold text-slate-600 lg:col-span-1">
            Cari barang
            <input className={`${inputClass} mt-1`} placeholder="Nama, kode, atau part number" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </label>
        </div>
        <div className="-mx-1 mt-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => pickRange(r.id, r.days)}
              className={`btn-tight inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-sm font-semibold ${range === r.id ? "border-blue-300 bg-blue-50 text-blue-900" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="size-4" checked={onlySelisih} onChange={(e) => { setPage(1); setOnlySelisih(e.target.checked); }} />
            Hanya yang ada selisih
          </label>
          <button type="button" className={btn} onClick={clearFilters}>Hapus filter</button>
        </div>
      </Panel>

      <Panel>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}

        <div className={`hidden border-b-2 border-slate-800 bg-slate-50 px-1 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 ${GRID}`}>
          <div className="pl-2">Tanggal</div>
          <div>Kategori</div>
          <div>Dicek</div>
          <div>Hasil</div>
          <div>Oleh</div>
        </div>

        <ul>
          {data && items.length === 0 ? (
            <li className="py-10 text-center">
              <div className="font-semibold text-slate-700">{filtered ? "Tidak ada catatan yang cocok" : "Belum ada pengecekan"}</div>
              <div className="mt-1 text-sm text-slate-500">{filtered ? "Ubah rentang tanggal atau kata pencarian." : "Hasil pengecekan di tab Cek akan muncul di sini."}</div>
            </li>
          ) : null}
          {!data && !error ? <li className="py-10 text-center text-sm text-slate-500">Memuat riwayat...</li> : null}
          {items.map((row) => (
            <li
              key={`${row.tgl}|${row.kategori}|${row.username}`}
              role="button"
              className={`mb-2 cursor-pointer rounded-xl border border-line px-3 py-3 md:mb-0 md:rounded-none md:border-x-0 md:border-t-0 md:px-1 ${GRID}`}
              tabIndex={0}
              onClick={() => setOpen(row)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(row); } }}
            >
              <div className="whitespace-nowrap text-sm font-semibold text-slate-700 md:pl-2">{dateLabel(row.tgl)}</div>
              <div className="mt-0.5 min-w-0 md:mt-0">
                <div className="break-words font-bold text-slate-900">{row.kategori || "Tanpa kategori"}</div>
                {row.hit ? (
                  <div className="mt-0.5 text-xs font-medium text-blue-700">
                    {row.hit.nama}: {row.hit.sistem === row.hit.fisik ? "cocok" : `stok ${fmt(row.hit.sistem)} → ${fmt(row.hit.fisik)}`}
                  </div>
                ) : null}
              </div>
              <div className="mt-1 whitespace-nowrap text-sm text-slate-600 md:mt-0">
                {row.dicek} barang<span className="md:hidden"> · oleh {row.name}</span>
              </div>
              <div className="mt-1.5 md:mt-0"><ResultBadges row={row} /></div>
              <div className="hidden whitespace-nowrap text-sm md:block">{row.name}</div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>{total ? `Menampilkan ${start + 1}–${Math.min(start + perPage, total)} dari ${total} catatan` : ""}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Sebelumnya</button>
            <span className="num text-xs">Hal {page}/{pages}</span>
            <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
          </div>
        </div>
      </Panel>

      {open ? <DetailBox row={open} q={q} onClose={() => setOpen(null)} onChanged={() => { setReload((n) => n + 1); notifyChanged(); }} /> : null}
    </>
  );
}

/** Kotak hasil satu pengecekan: ringkasan angka, rincian tiap barang, dan tombol Batalkan / Hapus riwayat. */
function DetailBox({ row, q, onClose, onChanged }: { row: Row; q: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let alive = true;
    void getOpnameDetail({ data: { tgl: row.tgl, kategori: row.kategori, username: row.username } })
      .then((res) => { if (alive) setDetail(res); })
      .catch((e: Error) => { if (alive) { toast.error(e.message || "Gagal memuat rincian."); onCloseRef.current(); } });
    return () => { alive = false; };
  }, [row, ver]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = detail ?? [];
  const aktif = rows.filter((d) => !d.batal);
  const dibatalkan = rows.length - aktif.length;
  const count = (h: string) => aktif.filter((d) => d.hasil === h).length;
  const needle = q.trim().toLowerCase();
  const adaPerubahan = aktif.filter((d) => d.sistem !== d.fisik).length;

  async function cancelOne(d: Detail[number]) {
    if (busy) return;
    const ok = await confirmDialog(
      d.sistem === d.fisik
        ? `Batalkan pengecekan ${d.nama}? Stok tidak berubah, hanya tanda sudah dicek yang dilepas.`
        : `Batalkan pengecekan ${d.nama}? Stok dikembalikan dari ${fmt(d.fisik)} ke ${fmt(d.sistem)} ${d.satuan}.`,
      { title: "Batalkan pengecekan?", confirmText: "Ya, batalkan" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await batalOpnameCheck({ data: { id: d.id } });
      toast.success(`${d.nama}: pengecekan dibatalkan`);
      setVer((n) => n + 1);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message || "Gagal membatalkan pengecekan.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAll() {
    if (busy || aktif.length === 0) return;
    const ok = await confirmDialog(
      `Batalkan ${aktif.length} pengecekan di kotak ini? Stok ${adaPerubahan} barang yang berubah dikembalikan seperti sebelum dicek.`,
      { title: "Batalkan semua pengecekan?", confirmText: "Ya, batalkan semua" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await batalOpnameGroup({ data: { tgl: row.tgl, kategori: row.kategori, username: row.username } });
      if (res.failed > 0) toast.error(`${res.done} dibatalkan, ${res.failed} gagal (stok barang sudah berubah). Cek lagi rinciannya.`);
      else toast.success(`${res.done} pengecekan dibatalkan, stok dikembalikan.`);
      setVer((n) => n + 1);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message || "Gagal membatalkan pengecekan.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    if (busy) return;
    const warn = adaPerubahan > 0
      ? ` Stok ${adaPerubahan} barang yang pernah diubah TIDAK ikut dikembalikan. Pakai "Batalkan semua" dulu kalau stoknya perlu dikembalikan.`
      : " Stok barang tidak berubah.";
    const ok = await confirmDialog(
      `Riwayat ${row.kategori || "tanpa kategori"} tanggal ${dateLabel(row.tgl)} (${rows.length} catatan) dihapus dari daftar.${warn}`,
      { title: "Hapus riwayat ini?", confirmText: "Ya, hapus riwayat", danger: true },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await hapusOpnameRiwayat({ data: { tgl: row.tgl, kategori: row.kategori, username: row.username } });
      toast.success(`Riwayat dihapus (${res.deleted} catatan).`);
      onChanged();
      onCloseRef.current();
    } catch (e) {
      toast.error((e as Error).message || "Gagal menghapus riwayat.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Hasil pengecekan ${row.kategori}`}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="break-words text-base font-bold text-slate-900">Hasil pengecekan: {row.kategori || "Tanpa kategori"}</h3>
            <p className="text-sm text-slate-600">{dateLabel(row.tgl)} · oleh {row.name}</p>
          </div>
          <button type="button" aria-label="Tutup" className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {!detail ? (
            <p className="py-6 text-center text-sm text-slate-500">Memuat rincian...</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                <Metric label="Dicek" value={aktif.length} />
                <Metric label="Cocok" value={count("cocok")} tone="text-emerald-700" />
                <Metric label="Berubah" value={count("kurang") + count("lebih")} tone="text-amber-700" />
                <Metric label="Habis" value={count("habis")} tone="text-red-700" />
              </div>
              {dibatalkan > 0 ? <p className="mt-2 text-xs text-slate-500">{dibatalkan} pengecekan sudah dibatalkan dan tidak dihitung di atas.</p> : null}
              <p className="mb-1 mt-4 text-xs font-semibold text-slate-500">Rincian barang</p>
              <ul>
                {rows.map((d) => {
                  const match = needle !== "" && `${d.nama} ${d.partNumber} ${d.kode}`.toLowerCase().includes(needle);
                  const sat = d.satuan ? ` ${d.satuan}` : "";
                  return (
                    <li key={d.id} className={`border-t border-line px-2 py-2.5 text-sm ${match ? "rounded-lg bg-blue-50" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`break-words font-medium ${d.batal ? "text-slate-400 line-through" : "text-slate-900"}`}>{d.nama}</div>
                          <div className="break-all text-xs text-slate-500">{[d.merek, d.kode ? `Kode ${d.kode}` : "", d.partNumber ? `PN ${d.partNumber}` : "", timeOnly(d.ts)].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {d.batal ? <BatalBadge /> : <HasilBadge hasil={d.hasil} selisih={d.fisik - d.sistem} />}
                          <span className={`num text-xs ${d.batal ? "text-slate-400" : "text-slate-600"}`}>
                            {d.sistem !== d.fisik ? <>{fmt(d.sistem)} → <b>{fmt(d.fisik)}</b>{sat}</> : <>{fmt(d.fisik)}{sat}</>}
                          </span>
                        </div>
                      </div>
                      {!d.batal ? (
                        <div className="mt-1.5 flex justify-end">
                          <button type="button" className="btn-tight inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => void cancelOne(d)}>
                            <Undo2 className="size-3.5" /> Batalkan
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-line px-4 py-3 sm:flex sm:justify-end sm:px-5">
          <button type="button" className={btn} disabled={busy || !detail || aktif.length === 0} onClick={() => void cancelAll()}>
            <Undo2 className="size-4" /> Batalkan semua
          </button>
          <button type="button" className={btnDanger} disabled={busy || !detail} onClick={() => void removeAll()}>
            <Trash2 className="size-4" /> Hapus riwayat
          </button>
          <button type="button" className={`${btn} col-span-2 sm:col-span-1`} onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
