import { Check, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { inputClass, Panel } from "@/components/shop/shell";
import { getOpnameSchedule, resetOpnameRound, saveOpnameInterval } from "@/lib/shop/api";

type Schedule = Awaited<ReturnType<typeof getOpnameSchedule>>;
type Row = Schedule["items"][number];
type Mode = "all" | "pick";
type Filter = "" | "terlambat" | "segera" | "belum" | "aman";

const TZ = "Asia/Makassar";
const INTERVALS = [1, 2, 3, 6];
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });

const btn = "inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold disabled:opacity-50";
const btnNeutral = `${btn} border-line bg-white text-slate-800 hover:bg-slate-50`;
const btnPrimary = `${btn} border-accent bg-accent text-white hover:opacity-90`;

const ORDER: Record<string, number> = { terlambat: 0, segera: 1, belum: 2, aman: 3 };

/** Kolom daftar kategori di layar lebar: Kategori | Interval | Sudah dicek | Cek berikutnya. */
const GRID = "md:grid md:items-center md:gap-4";
const COLS_PLAIN = "md:grid-cols-[minmax(0,1fr)_110px_150px_240px]";
const COLS_PICK = "md:grid-cols-[28px_minmax(0,1fr)_110px_150px_240px]";

function StatusBadge({ row }: { row: Row }) {
  if (row.status === "belum") return <span className="inline-block whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Belum pernah dicek</span>;
  const days = row.hariLagi ?? 0;
  if (row.status === "terlambat") return <span className="inline-block whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Terlambat {Math.abs(days)} hari</span>;
  if (row.status === "segera") return <span className="inline-block whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{days} hari lagi</span>;
  return <span className="inline-block whitespace-nowrap rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Aman</span>;
}

/** Beri tahu menu di sidebar supaya angka merahnya diperbarui. */
const notifyChanged = () => window.dispatchEvent(new Event("mjs-opname-changed"));

export function OpnameSettings() {
  const [data, setData] = useState<Schedule | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [sel, setSel] = useState<string[]>([]);
  const [bulan, setBulan] = useState(2);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const firstLoad = useRef(true);

  function load() {
    void getOpnameSchedule()
      .then((res) => {
        setError("");
        setData(res);
        if (firstLoad.current) { firstLoad.current = false; setBulan(res.defaultInterval); }
      })
      .catch((e: Error) => setError(e.message || "Gagal memuat jadwal cek."));
  }

  useEffect(() => { load(); }, []);

  const all = [...(data?.items ?? [])].sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || ((a.hariLagi ?? 9999) - (b.hariLagi ?? 9999)) || a.kategori.localeCompare(b.kategori));
  const needle = search.trim().toLowerCase();
  const rows = all.filter((r) => (!filter || r.status === filter) && (!needle || r.kategori.toLowerCase().includes(needle)));
  const countOf = (s: string) => all.filter((r) => r.status === s).length;
  const pick = mode === "pick";
  const visibleNames = rows.map((r) => r.kategori);
  const allPicked = visibleNames.length > 0 && visibleNames.every((n) => sel.includes(n));
  const scopeText = !data ? "" : pick ? (sel.length ? `Berlaku untuk ${sel.length} kategori yang dicentang.` : "Centang kategori di daftar untuk memilih.") : `Berlaku untuk semua ${all.length} kategori.`;

  const chips: { id: Filter; label: string; n: number; tone: string }[] = [
    { id: "", label: "Semua", n: all.length, tone: "text-slate-900" },
    { id: "terlambat", label: "Terlambat", n: countOf("terlambat"), tone: "text-red-700" },
    { id: "segera", label: "Segera", n: countOf("segera"), tone: "text-amber-700" },
    { id: "belum", label: "Belum pernah", n: countOf("belum"), tone: "text-slate-900" },
    { id: "aman", label: "Aman", n: countOf("aman"), tone: "text-emerald-700" },
  ];

  function toggle(name: string) {
    setSel((prev) => (prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]));
  }

  function toggleVisible() {
    setSel((prev) => (allPicked ? prev.filter((n) => !visibleNames.includes(n)) : [...prev, ...visibleNames.filter((n) => !prev.includes(n))]));
  }

  async function save() {
    if (pick && sel.length === 0) { toast.error("Pilih minimal satu kategori."); return; }
    setSaving(true);
    try {
      await saveOpnameInterval({ data: { semua: !pick, kategori: sel, bulan } });
      toast.success(`Interval ${bulan} bulan disimpan untuk ${pick ? `${sel.length} kategori` : "semua kategori"}.`);
      load();
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message || "Gagal menyimpan interval.");
    } finally {
      setSaving(false);
    }
  }

  async function resetRound() {
    if (pick && sel.length === 0) { toast.error("Pilih minimal satu kategori."); return; }
    const scope = pick ? sel.join(", ") : "semua kategori";
    const ok = await confirmDialog(
      `Tanda sudah dicek untuk ${scope} akan dikosongkan, jadi semua barangnya kembali Belum dicek. Riwayat lama tetap tersimpan.`,
      { title: "Mulai putaran baru?", confirmText: "Ya, mulai baru" },
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await resetOpnameRound({ data: { kategori: pick ? sel : [] } });
      toast.success(`${res.reset} barang siap dicek ulang`);
      load();
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message || "Gagal memulai putaran baru.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <div>
        <h3 className="text-base font-bold text-slate-900">Pengaturan cek berkala</h3>
        <p className="text-sm text-slate-600">Atur seberapa sering barang harus dicek ulang.</p>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}

      <div className="mt-3 rounded-xl border border-line bg-slate-50 p-3">
        <div className="flex w-full rounded-xl bg-slate-200/70 p-1 sm:inline-flex sm:w-auto" role="tablist">
          {([["all", "Semua kategori"], ["pick", "Pilih kategori"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`h-10 flex-1 rounded-lg px-4 text-sm font-semibold sm:flex-none ${mode === id ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-600">{scopeText}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-medium text-slate-800">Ulangi setiap</span>
          {INTERVALS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBulan(n)}
              className={`btn-tight h-10 rounded-lg border px-3 text-sm font-semibold ${bulan === n ? "border-blue-300 bg-blue-50 text-blue-900" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {n} bulan
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
          <button type="button" className={btnPrimary} disabled={saving || !data} onClick={() => void save()}><Check className="size-4" /> Simpan interval</button>
          <button type="button" className={btnNeutral} disabled={saving || !data} onClick={() => void resetRound()}><RotateCcw className="size-4" /> Putaran baru</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Cek berikutnya dihitung dari tanggal terakhir ada barang yang dicek di kategori itu.{!pick ? " Menyimpan untuk Semua kategori menggantikan interval khusus yang pernah diatur." : ""}
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <input className={inputClass} placeholder="Cari kategori..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {pick ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium text-slate-800">
            <input type="checkbox" className="size-4" checked={allPicked} disabled={visibleNames.length === 0} onChange={toggleVisible} />
            Pilih semua yang tampil ({visibleNames.length})
          </label>
        ) : null}
      </div>

      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Saring jadwal">
        {chips.map((c) => (
          <button
            key={c.id || "semua"}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={`btn-tight inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold ${filter === c.id ? "border-blue-300 bg-blue-50 text-blue-900" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {c.label}
            <span className={`num font-bold ${c.tone}`}>{c.n}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-line">
        <div className={`hidden border-b-2 border-slate-800 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 ${GRID} ${pick ? COLS_PICK : COLS_PLAIN}`}>
          {pick ? <div /> : null}
          <div>Kategori</div>
          <div>Interval</div>
          <div>Sudah dicek</div>
          <div>Cek berikutnya</div>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto">
          {!data && !error ? <li className="py-8 text-center text-sm text-slate-500">Memuat jadwal...</li> : null}
          {data && all.length === 0 ? <li className="py-8 text-center text-sm text-slate-500">Belum ada kategori barang.</li> : null}
          {data && all.length > 0 && rows.length === 0 ? <li className="py-8 text-center text-sm text-slate-500">Tidak ada kategori untuk filter ini.</li> : null}
          {rows.map((row) => {
            const on = pick && sel.includes(row.kategori);
            const pct = row.total ? Math.round((row.dicek / row.total) * 100) : 0;
            const content = (
              <>
                {pick ? <input type="checkbox" className="absolute left-3 top-3.5 size-4 md:static" aria-label={`Pilih ${row.kategori}`} checked={on} onChange={() => toggle(row.kategori)} /> : null}
                <div className="min-w-0">
                  <div className="break-words text-sm font-bold text-slate-900">{row.kategori}</div>
                  <div className="mt-0.5 text-xs text-slate-500 md:hidden">
                    {row.intervalBulan} bulan{row.custom ? " (khusus)" : ""} · {row.dicek}/{row.total} dicek · terakhir {row.terakhir ? dateLabel(row.terakhir) : "-"}
                  </div>
                </div>
                <div className="hidden whitespace-nowrap text-sm md:block">
                  {row.intervalBulan} bulan
                  {row.custom ? <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-px text-[10px] font-bold text-blue-800">khusus</span> : null}
                </div>
                <div className="hidden md:block">
                  <div className="num text-xs">{row.dicek} / {row.total}</div>
                  <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:mt-0 md:block">
                  <StatusBadge row={row} />
                  <span className="whitespace-nowrap text-slate-500 md:mt-0.5 md:block">{row.berikutnya ? `Cek ${dateLabel(row.berikutnya)}` : ""}</span>
                </div>
              </>
            );
            const inner = `relative px-3 py-2.5 ${pick ? "pl-9 md:pl-3" : ""} ${GRID} ${pick ? COLS_PICK : COLS_PLAIN}`;
            return pick ? (
              <li key={row.kategori} className="border-t border-line first:border-t-0">
                <label className={`block cursor-pointer ${inner} ${on ? "bg-blue-50" : ""}`}>{content}</label>
              </li>
            ) : (
              <li key={row.kategori} className={`border-t border-line first:border-t-0 ${inner}`}>{content}</li>
            );
          })}
        </ul>
      </div>
      <p className="mt-2 text-xs text-slate-500">{data ? `${rows.length} dari ${all.length} kategori` : ""}</p>
    </Panel>
  );
}
