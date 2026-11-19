import { Check, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { Panel } from "@/components/shop/shell";
import { getOpnameSchedule, resetOpnameRound, saveOpnameInterval } from "@/lib/shop/api";

type Schedule = Awaited<ReturnType<typeof getOpnameSchedule>>;
type Row = Schedule["items"][number];
type Mode = "all" | "pick";

const TZ = "Asia/Makassar";
const INTERVALS = [1, 2, 3, 6];
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });

const th = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2.5 align-middle";
const btn = "inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold disabled:opacity-50";
const btnNeutral = `${btn} border-line bg-white text-slate-800 hover:bg-slate-50`;
const btnPrimary = `${btn} border-accent bg-accent text-white hover:opacity-90`;

const ORDER: Record<string, number> = { terlambat: 0, segera: 1, belum: 2, aman: 3 };

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

  const rows = [...(data?.items ?? [])].sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || ((a.hariLagi ?? 9999) - (b.hariLagi ?? 9999)) || a.kategori.localeCompare(b.kategori));
  const pick = mode === "pick";
  const allPicked = rows.length > 0 && sel.length === rows.length;
  const scopeText = !data ? "" : pick ? (sel.length ? `Berlaku untuk ${sel.length} kategori yang dicentang.` : "Centang kategori di tabel untuk memilih.") : `Berlaku untuk semua ${rows.length} kategori.`;

  function toggle(name: string) {
    setSel((prev) => (prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]));
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Pengaturan cek berkala</h3>
          <p className="text-sm text-slate-600">Atur seberapa sering barang harus dicek ulang.</p>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist">
          {([["all", "Semua kategori"], ["pick", "Pilih kategori"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`h-9 rounded-lg px-4 text-sm font-semibold ${mode === id ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              {pick ? (
                <th className={`${th} w-10`}>
                  <input type="checkbox" className="size-4" aria-label="Pilih semua kategori" checked={allPicked} onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.kategori) : [])} />
                </th>
              ) : null}
              <th className={th}>Kategori</th>
              <th className={th}>Interval</th>
              <th className={th}>Sudah dicek</th>
              <th className={th}>Terakhir dicek</th>
              <th className={th}>Cek berikutnya</th>
            </tr>
          </thead>
          <tbody>
            {!data && !error ? <tr><td colSpan={6} className="py-10 text-center text-slate-500">Memuat jadwal...</td></tr> : null}
            {data && rows.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-slate-500">Belum ada kategori barang.</td></tr> : null}
            {rows.map((row) => {
              const on = pick && sel.includes(row.kategori);
              const pct = row.total ? Math.round((row.dicek / row.total) * 100) : 0;
              return (
                <tr key={row.kategori} className={`border-t border-line ${on ? "bg-blue-50" : ""}`}>
                  {pick ? (
                    <td className={td}>
                      <input type="checkbox" className="size-4" aria-label={`Pilih ${row.kategori}`} checked={on} onChange={() => toggle(row.kategori)} />
                    </td>
                  ) : null}
                  <td className={`${td} font-semibold text-slate-900`}>{row.kategori}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {row.intervalBulan} bulan
                    {row.custom ? <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-px text-[10px] font-bold text-blue-800">khusus</span> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div className="num text-xs">{row.dicek} / {row.total}</div>
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  </td>
                  <td className={`${td} whitespace-nowrap text-xs`}>{row.terakhir ? dateLabel(row.terakhir) : "-"}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    <div>{row.berikutnya ? dateLabel(row.berikutnya) : "-"}</div>
                    <div className="mt-0.5"><StatusBadge row={row} /></div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-slate-50 p-4">
        <p className="text-sm text-slate-600">{scopeText}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-slate-800">Ulangi setiap</span>
          {INTERVALS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBulan(n)}
              className={`h-9 rounded-lg border px-3 text-sm font-semibold ${bulan === n ? "border-blue-300 bg-blue-50 text-blue-800" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {n} bulan
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={saving || !data} onClick={() => void save()}><Check className="size-4" /> Simpan interval</button>
          <button type="button" className={btnNeutral} disabled={saving || !data} onClick={() => void resetRound()}><RotateCcw className="size-4" /> Mulai putaran baru</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Cek berikutnya dihitung dari tanggal terakhir ada barang yang dicek di kategori itu.{!pick ? " Menyimpan untuk Semua kategori menggantikan interval khusus yang pernah diatur." : ""}
        </p>
      </div>
    </Panel>
  );
}
