import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { inputClass, Panel } from "@/components/shop/shell";
import { listAudit } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/jejak")({ component: JejakPage });

type Row = { id: unknown; ts: string; name: string; username: string; action: string };
const PAGE = 50;
const TZ = "Asia/Makassar";

const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD
const shiftDay = (n: number) => dayKey(new Date(Date.now() + n * 86400000));
const timeOnly = (ts: string) =>
  new Date(ts).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(".", ":");
const dayLabel = (key: string) => {
  if (key === shiftDay(0)) return "Hari ini";
  if (key === shiftDay(-1)) return "Kemarin";
  return new Date(`${key}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

const RANGES = [
  { id: "today", label: "Hari ini", start: () => shiftDay(0), end: () => shiftDay(0) },
  { id: "yesterday", label: "Kemarin", start: () => shiftDay(-1), end: () => shiftDay(-1) },
  { id: "week", label: "7 hari", start: () => shiftDay(-6), end: () => shiftDay(0) },
  { id: "all", label: "Semua", start: () => "", end: () => "" },
] as const;

type Group = { key: string; items: Array<{ first: Row; last: Row; count: number }> };

function groupRows(rows: Row[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const key = dayKey(new Date(row.ts));
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, items: [] }; groups.push(g); }
    const prev = g.items[g.items.length - 1];
    // rows sorted newest-first: merge identical consecutive actions by the same user
    if (prev && prev.first.username === row.username && prev.first.action === row.action) {
      prev.count += 1;
      prev.last = row;
    } else {
      g.items.push({ first: row, last: row, count: 1 });
    }
  }
  return groups;
}

function JejakPage() {
  const [q, setQ] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("today");
  const [all, setAll] = useState<Row[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(false);

  // data tetap diambil dari listAudit yang lama (200 aktivitas terakhir)
  useEffect(() => {
    setLoading(true);
    void listAudit({ data: { q } })
      .then((res) => setAll(res as Row[]))
      .catch(() => setAll([]))
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => { setLimit(PAGE); }, [q, range]);

  const filtered = useMemo(() => {
    const r = RANGES.find((x) => x.id === range)!;
    const start = r.start();
    const end = r.end();
    return all.filter((row) => {
      const k = dayKey(new Date(row.ts));
      return (!start || k >= start) && (!end || k <= end);
    });
  }, [all, range]);

  const shown = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const groups = useMemo(() => groupRows(shown), [shown]);

  return (
    <Panel className="mx-auto max-w-4xl">
      <h2 className="text-lg font-extrabold">Riwayat Aktivitas</h2>
      <p className="mt-1 text-xs text-muted">Catatan aktivitas penting pengguna dan perubahan shift.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${range === r.id ? "border-transparent bg-slate-900 text-white" : "border-line bg-white text-muted"}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <input className={`${inputClass} mt-3`} placeholder="Cari aktivitas, pengguna..." value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="mt-3">
        {!loading && groups.length === 0 ? <div className="py-6 text-center text-sm text-muted">Belum ada aktivitas.</div> : null}
        {groups.map((g) => (
          <section key={g.key} className="mb-4">
            <h3 className="sticky top-0 z-10 bg-white/95 py-1 text-[11px] font-extrabold tracking-wide text-muted uppercase backdrop-blur">
              {dayLabel(g.key)}
            </h3>
            <ul>
              {g.items.map((it) => (
                <li key={String(it.first.id)} className="flex items-start gap-3 border-t border-line py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted">
                    {it.count > 1 ? `${timeOnly(it.last.ts)}–${timeOnly(it.first.ts)}` : timeOnly(it.first.ts)}
                  </span>
                  <span className="w-20 shrink-0 text-xs font-semibold">{it.first.name}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {it.first.action}
                    {it.count > 1 ? <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold">×{it.count}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {hasMore ? (
          <button type="button" disabled={loading} onClick={() => setLimit((l) => l + PAGE)} className="mx-auto mt-2 block rounded-lg border border-line px-4 py-2 text-xs font-bold">
            {loading ? "Memuat..." : "Muat lebih banyak"}
          </button>
        ) : null}
      </div>
    </Panel>
  );
}
