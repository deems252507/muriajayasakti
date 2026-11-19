import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { inputClass, Panel } from "@/components/shop/shell";
import { HasilBadge, Metric } from "@/components/shop/opname-ui";
import { getOpnameDetail, listOpnameHistory } from "@/lib/shop/api";

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

const RANGES = [
  { id: "all", label: "Semua tanggal", days: 0 },
  { id: "7", label: "7 hari", days: 7 },
  { id: "30", label: "30 hari", days: 30 },
  { id: "90", label: "3 bulan", days: 90 },
];

const th = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2.5 align-middle";
const btn = "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";

export function OpnameHistory() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState("all");
  const [kategori, setKategori] = useState("");
  const [q, setQ] = useState("");
  const [onlySelisih, setOnlySelisih] = useState(false);
  const [page, setPage] = useState(1);
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
  }, [from, to, kategori, q, onlySelisih, page]);

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-slate-600">
            Dari tanggal
            <input type="date" className={`${inputClass} mt-1`} value={from} max={to || undefined} onChange={(e) => { setRange(""); setPage(1); setFrom(e.target.value); }} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Sampai tanggal
            <input type="date" className={`${inputClass} mt-1`} value={to} min={from || undefined} onChange={(e) => { setRange(""); setPage(1); setTo(e.target.value); }} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Kategori
            <select className={`${inputClass} mt-1`} value={kategori} onChange={(e) => { setPage(1); setKategori(e.target.value); }}>
              <option value="">Semua kategori</option>
              {(data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Cari barang
            <input className={`${inputClass} mt-1`} placeholder="Nama atau part number" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => pickRange(r.id, r.days)}
              className={`h-8 rounded-lg border px-3 text-xs font-semibold ${range === r.id ? "border-blue-300 bg-blue-50 text-blue-800" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {r.label}
            </button>
          ))}
          <label className="ml-1 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="size-4" checked={onlySelisih} onChange={(e) => { setPage(1); setOnlySelisih(e.target.checked); }} />
            Hanya yang ada selisih
          </label>
          <button type="button" className={`${btn} ml-auto`} onClick={clearFilters}>Hapus filter</button>
        </div>
      </Panel>

      <Panel>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className={th}>Tanggal</th>
                <th className={th}>Kategori</th>
                <th className={`${th} text-center`}>Dicek</th>
                <th className={`${th} text-center`}>Hasil</th>
                <th className={th}>Oleh</th>
              </tr>
            </thead>
            <tbody>
              {data && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center">
                    <div className="font-semibold text-slate-700">{filtered ? "Tidak ada catatan yang cocok" : "Belum ada pengecekan"}</div>
                    <div className="mt-1 text-sm text-slate-500">{filtered ? "Ubah rentang tanggal atau kata pencarian." : "Hasil pengecekan di tab Cek akan muncul di sini."}</div>
                  </td>
                </tr>
              ) : null}
              {!data && !error ? <tr><td colSpan={5} className="py-10 text-center text-slate-500">Memuat riwayat...</td></tr> : null}
              {items.map((row) => (
                <tr
                  key={`${row.tgl}|${row.kategori}|${row.username}`}
                  className="cursor-pointer border-t border-line hover:bg-slate-50"
                  tabIndex={0}
                  onClick={() => setOpen(row)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(row); } }}
                >
                  <td className={`${td} whitespace-nowrap`}>{dateLabel(row.tgl)}</td>
                  <td className={td}>
                    <div className="font-semibold text-slate-900">{row.kategori || "Tanpa kategori"}</div>
                    {row.hit ? (
                      <div className="mt-0.5 text-xs font-medium text-blue-700">
                        {row.hit.nama}: {row.hit.sistem === row.hit.fisik ? "cocok" : `stok ${row.hit.sistem} → ${row.hit.fisik}`}
                      </div>
                    ) : null}
                  </td>
                  <td className={`${td} whitespace-nowrap text-center`}>{row.dicek} barang</td>
                  <td className={`${td} text-center`}>
                    <div className="flex flex-wrap justify-center gap-1">
                      {row.selisih === 0 ? <HasilBadge hasil="cocok" /> : <span className="inline-block whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{row.selisih} selisih</span>}
                      {row.habis > 0 ? <span className="inline-block whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{row.habis} habis</span> : null}
                    </div>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>{total ? `Menampilkan ${start + 1}–${Math.min(start + perPage, total)} dari ${total} catatan` : ""}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Sebelumnya</button>
            <span className="num text-xs">Hal {page}/{pages}</span>
            <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
          </div>
        </div>
      </Panel>

      {open ? <DetailBox row={open} q={q} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** Kotak hasil satu pengecekan: ringkasan angka dan rincian tiap barang. */
function DetailBox({ row, q, onClose }: { row: Row; q: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    let alive = true;
    void getOpnameDetail({ data: { tgl: row.tgl, kategori: row.kategori, username: row.username } })
      .then((res) => { if (alive) setDetail(res); })
      .catch((e: Error) => { if (alive) { toast.error(e.message || "Gagal memuat rincian."); onClose(); } });
    return () => { alive = false; };
  }, [row]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const count = (h: string) => (detail ?? []).filter((d) => d.hasil === h).length;
  const needle = q.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Hasil pengecekan ${row.kategori}`}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Hasil pengecekan: {row.kategori || "Tanpa kategori"}</h3>
            <p className="text-sm text-slate-600">{dateLabel(row.tgl)} · oleh {row.name}</p>
          </div>
          <button type="button" aria-label="Tutup" className="grid size-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          {!detail ? (
            <p className="py-6 text-center text-sm text-slate-500">Memuat rincian...</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                <Metric label="Dicek" value={detail.length} />
                <Metric label="Cocok" value={count("cocok")} tone="text-emerald-700" />
                <Metric label="Berubah" value={count("kurang") + count("lebih")} tone="text-amber-700" />
                <Metric label="Habis" value={count("habis")} tone="text-red-700" />
              </div>
              <p className="mb-1 mt-4 text-xs font-semibold text-slate-500">Rincian barang</p>
              <ul>
                {detail.map((d, i) => {
                  const match = needle !== "" && `${d.nama} ${d.partNumber}`.toLowerCase().includes(needle);
                  return (
                    <li key={`${d.ts}-${i}`} className={`flex items-center justify-between gap-3 border-t border-line px-2 py-2 text-sm ${match ? "rounded-lg bg-blue-50" : ""}`}>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{d.nama}</div>
                        <div className="text-xs text-slate-500">{[d.merek, d.partNumber, timeOnly(d.ts)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {d.sistem !== d.fisik ? <span className="num text-xs text-slate-600">{d.sistem} → <b>{d.fisik}</b></span> : null}
                        <HasilBadge hasil={d.hasil} selisih={d.fisik - d.sistem} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <button type="button" className={btn} onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
