import { createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ExpandButton, ExpandGroup } from "@/components/ui/button-7";
import { AlertTriangle, ChevronDown, Download, LogIn, Package, ReceiptText, Settings, Truck, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { inputClass, Panel } from "@/components/shop/shell";
import { listAudit } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/jejak")({ component: JejakPage });

type Row = { id: unknown; ts: string; name: string; username: string; action: string };
const PAGE = 50;
const TZ = "Asia/Makassar";

/* ---------- tanggal & waktu ---------- */
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD
const shiftDay = (n: number) => dayKey(new Date(Date.now() + n * 86400000));
const timeOnly = (ts: string) =>
  new Date(ts).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(".", ":");
const fullTime = (ts: string) =>
  new Date(ts).toLocaleString("id-ID", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).replace(/\./g, ":");
const dayLabel = (key: string) => {
  if (key === shiftDay(0)) return "Hari ini";
  if (key === shiftDay(-1)) return "Kemarin";
  return new Date(`${key}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const agoLabel = (ts: string) => {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
};

const RANGES = [
  { id: "today", label: "Hari ini", start: () => shiftDay(0), end: () => shiftDay(0) },
  { id: "yesterday", label: "Kemarin", start: () => shiftDay(-1), end: () => shiftDay(-1) },
  { id: "week", label: "7 hari", start: () => shiftDay(-6), end: () => shiftDay(0) },
  { id: "all", label: "Semua", start: () => "", end: () => "" },
] as const;
type RangeId = (typeof RANGES)[number]["id"] | "custom";

/* ---------- klasifikasi aktivitas ---------- */
type CatId = "transaksi" | "barang" | "pemasok" | "kas" | "sistem" | "akses";
const CATS: Record<CatId, { label: string; icon: LucideIcon; badge: string }> = {
  transaksi: { label: "Transaksi", icon: ReceiptText, badge: "bg-blue-50 text-blue-700" },
  barang: { label: "Barang & harga", icon: Package, badge: "bg-emerald-50 text-emerald-700" },
  pemasok: { label: "Barang masuk", icon: Truck, badge: "bg-amber-50 text-amber-700" },
  kas: { label: "Kas & shift", icon: Wallet, badge: "bg-violet-50 text-violet-700" },
  sistem: { label: "Akun & sistem", icon: Settings, badge: "bg-slate-100 text-slate-700" },
  akses: { label: "Login", icon: LogIn, badge: "bg-slate-100 text-slate-600" },
};
const CAT_ORDER: CatId[] = ["transaksi", "barang", "pemasok", "kas", "sistem", "akses"];

type Item = Row & { cat: CatId; title: string; changes: string[]; check: boolean; isLogin: boolean; day: string };

function classify(row: Row): Item {
  const raw = String(row.action ?? "");
  const [head, ...rest] = raw.split(" — ");
  const changes = rest.join(" — ").split("; ").map((x) => x.trim()).filter(Boolean);
  let cat: CatId = "sistem";
  let title = head;
  let isLogin = false;

  if (/^(Admin|Owner|Kasir|Staf) masuk$/.test(raw)) { cat = "akses"; title = "Masuk ke aplikasi"; isLogin = true; }
  else if (/^Login gagal/.test(raw)) cat = "akses";
  else if (/pemasok/i.test(raw)) cat = "pemasok";
  else if (/^(Nota|Retur|Pelunasan|Ubah nota|Edit struk|Edit bon|Hapus retur|Hapus nota)/.test(raw)) cat = "transaksi";
  else if (/^(Ubah barang|Tambah barang|Hapus barang|Impor CSV)/.test(raw)) cat = "barang";
  else if (/^(Buka |Tutup shift|Hapus arsip shift|Kas keluar|Kas masuk|Hapus kas)/.test(raw)) cat = "kas";

  const check = /^(Hapus|Edit |Ubah nota|Login gagal)/.test(raw) || changes.some((c) => /^harga/.test(c));
  return { ...row, cat, title, changes, check, isLogin, day: dayKey(new Date(row.ts)) };
}

/* ---------- pengelompokan ---------- */
type Entry = { first: Item; last: Item; count: number; all: Item[] };
type Group = { key: string; items: Entry[] };

function groupRows(rows: Item[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    let g = groups[groups.length - 1];
    if (!g || g.key !== row.day) { g = { key: row.day, items: [] }; groups.push(g); }
    const prev = g.items[g.items.length - 1];
    // data urut terbaru dulu: gabungkan aksi yang sama persis oleh user yang sama
    if (prev && prev.first.username === row.username && prev.first.action === row.action) {
      prev.count += 1;
      prev.last = row;
      prev.all.push(row);
    } else {
      g.items.push({ first: row, last: row, count: 1, all: [row] });
    }
  }
  return groups;
}

/* ---------- ekspor ---------- */
function exportCsv(rows: Item[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [["Waktu", "Pengguna", "Kategori", "Aktivitas", "Status"].join(",")];
  for (const r of rows) {
    lines.push([
      esc(new Date(r.ts).toLocaleString("sv-SE", { timeZone: TZ })),
      esc(r.name),
      esc(CATS[r.cat].label),
      esc(r.action),
      esc(r.check ? "Perlu dicek" : "Biasa"),
    ].join(","));
  }
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `riwayat-aktivitas-${shiftDay(0)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- tampilan ---------- */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-bold transition ${active ? "border-transparent bg-slate-900 text-white" : "border-line bg-white text-muted hover:border-slate-300"}`}
    >
      {children}
    </button>
  );
}

function Change({ text }: { text: string }) {
  const [from, to] = text.split(" → ");
  if (to === undefined) return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">{text}</span>;
  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">
      <span className="text-muted">{from}</span> <span className="text-muted">→</span> <b>{to}</b>
    </span>
  );
}

function JejakPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [range, setRange] = useState<RangeId>("today");
  const [from, setFrom] = useState(shiftDay(-6));
  const [to, setTo] = useState(shiftDay(0));
  const [user, setUser] = useState("");
  const [cat, setCat] = useState<CatId | "">("");
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [all, setAll] = useState<Row[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void listAudit({ data: { q: debouncedQ, noLogin: !showLogin } })
      .then((res) => { if (alive) setAll(res as Row[]); })
      .catch(() => { if (alive) setAll([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [debouncedQ, showLogin]);

  useEffect(() => { setLimit(PAGE); setOpen(""); }, [debouncedQ, range, from, to, user, cat, onlyCheck, showLogin]);

  const items = useMemo(() => all.map(classify), [all]);

  const users = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) if (!m.has(it.username)) m.set(it.username, it.name);
    return [...m.entries()];
  }, [items]);

  const inRange = useMemo(() => {
    let start = ""; let end = "";
    if (range === "custom") { start = from; end = to; }
    else { const r = RANGES.find((x) => x.id === range)!; start = r.start(); end = r.end(); }
    return items.filter((it) => (!start || it.day >= start) && (!end || it.day <= end) && (showLogin || !it.isLogin));
  }, [items, range, from, to, showLogin]);

  const summary = useMemo(() => {
    const work = inRange.filter((it) => !it.isLogin);
    const byUser = new Map<string, number>();
    for (const it of work) byUser.set(it.name, (byUser.get(it.name) ?? 0) + 1);
    const top = [...byUser.entries()].sort((a, b) => b[1] - a[1])[0];
    return { total: work.length, check: work.filter((it) => it.check).length, top };
  }, [inRange]);

  const catCount = useMemo(() => {
    const m: Partial<Record<CatId, number>> = {};
    for (const it of inRange) m[it.cat] = (m[it.cat] ?? 0) + 1;
    return m;
  }, [inRange]);

  const filtered = useMemo(
    () => inRange.filter((it) => (!user || it.username === user) && (!cat || it.cat === cat) && (!onlyCheck || it.check)),
    [inRange, user, cat, onlyCheck],
  );

  const shown = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const groups = useMemo(() => groupRows(shown), [shown]);
  const filtering = Boolean(user || cat || onlyCheck || debouncedQ);

  return (
    <Panel className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Riwayat Aktivitas</h2>
          <p className="mt-1 text-xs text-muted">Pantau perubahan penting: transaksi, stok, harga, kas, dan shift.</p>
        </div>
        <ExpandGroup align="end">
          <ExpandButton icon={<Download />} label="Ekspor CSV" disabled={filtered.length === 0} onClick={() => exportCsv(filtered)} />
        </ExpandGroup>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-line px-3 py-2.5">
          <div className="text-xl font-extrabold">{summary.total}</div>
          <div className="text-[11px] text-muted">Aktivitas</div>
        </div>
        <button
          type="button"
          onClick={() => setOnlyCheck((v) => !v)}
          aria-pressed={onlyCheck}
          className={`rounded-xl border px-3 py-2.5 text-left transition ${onlyCheck ? "border-red-300 bg-red-50" : "border-line hover:border-slate-300"}`}
        >
          <div className={`text-xl font-extrabold ${summary.check ? "text-red-600" : ""}`}>{summary.check}</div>
          <div className="text-[11px] text-muted">Perlu dicek</div>
        </button>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <div className="truncate text-sm font-extrabold leading-7">{summary.top ? summary.top[0] : "-"}</div>
          <div className="text-[11px] text-muted">{summary.top ? `Paling aktif (${summary.top[1]})` : "Paling aktif"}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>
        ))}
        <Chip active={range === "custom"} onClick={() => setRange("custom")}>Pilih tanggal</Chip>
      </div>
      {range === "custom" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <input type="date" aria-label="Dari tanggal" className={`${inputClass} !h-9 !w-auto`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span>sampai</span>
          <input type="date" aria-label="Sampai tanggal" className={`${inputClass} !h-9 !w-auto`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <input className={`${inputClass} min-w-0 flex-1 basis-56`} placeholder="Cari aktivitas, pengguna, nomor nota..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputClass} !w-auto`} aria-label="Filter pengguna" value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">Semua pengguna</option>
          {users.map(([u, n]) => <option key={u} value={u}>{n}</option>)}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip active={cat === ""} onClick={() => setCat("")}>Semua jenis</Chip>
        {CAT_ORDER.filter((c) => c !== "akses" || showLogin || catCount.akses).map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? "" : c)}>
            {CATS[c].label}{catCount[c] ? ` (${catCount[c]})` : ""}
          </Chip>
        ))}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showLogin} onChange={(e) => setShowLogin(e.target.checked)} />
          Tampilkan login
        </label>
      </div>

      <div className="mt-4">
        {loading && groups.length === 0 ? <div className="py-8 text-center text-sm text-muted">Memuat aktivitas...</div> : null}
        {!loading && groups.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            {filtering ? "Tidak ada aktivitas yang cocok dengan filter ini." : "Belum ada aktivitas penting pada periode ini."}
            {!showLogin && !filtering ? <div className="mt-1 text-xs">Centang "Tampilkan login" untuk melihat riwayat masuk.</div> : null}
          </div>
        ) : null}

        {groups.map((g) => (
          <section key={g.key} className="mb-4">
            <h3 className="sticky top-0 z-10 bg-white/95 py-1.5 text-xs font-extrabold text-muted backdrop-blur">{dayLabel(g.key)}</h3>
            <ul>
              {g.items.map((it) => {
                const id = String(it.first.id);
                const isOpen = open === id;
                const meta = CATS[it.first.cat];
                const Icon = meta.icon;
                return (
                  <li key={id} className={`border-t border-line ${it.first.check ? "bg-red-50/40" : ""}`}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? "" : id)}
                      className="flex w-full items-start gap-3 px-1 py-2.5 text-left hover:bg-slate-50"
                    >
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${meta.badge}`} title={meta.label}>
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-semibold break-words">{it.first.title}</span>
                          {it.count > 1 ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold">×{it.count}</span> : null}
                          {it.first.check ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                              <AlertTriangle size={11} /> Perlu dicek
                            </span>
                          ) : null}
                        </span>
                        {it.first.changes.length ? (
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {it.first.changes.map((c) => <Change key={c} text={c} />)}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-xs text-muted">
                          {it.first.name} · {meta.label}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted">
                        {it.count > 1 ? `${timeOnly(it.last.ts)}–${timeOnly(it.first.ts)}` : timeOnly(it.first.ts)}
                        <ChevronDown size={14} className={`transition ${isOpen ? "rotate-180" : ""}`} />
                      </span>
                    </button>

                    {isOpen ? (
                      <dl className="mx-1 mb-3 ml-12 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                        <dt className="text-muted">Waktu</dt>
                        <dd>{fullTime(it.first.ts)} <span className="text-muted">({agoLabel(it.first.ts)})</span></dd>
                        <dt className="text-muted">Pengguna</dt>
                        <dd>{it.first.name} <span className="text-muted">@{it.first.username}</span></dd>
                        <dt className="text-muted">Jenis</dt>
                        <dd>{meta.label}</dd>
                        <dt className="text-muted">Catatan asli</dt>
                        <dd className="break-words">{it.first.action}</dd>
                        {it.count > 1 ? (
                          <>
                            <dt className="text-muted">Terjadi pada</dt>
                            <dd>{it.all.map((x) => timeOnly(x.ts)).join(", ")}</dd>
                          </>
                        ) : null}
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {hasMore ? (
          <button type="button" disabled={loading} onClick={() => setLimit((l) => l + PAGE)} className="mx-auto mt-2 block rounded-lg border border-line px-4 py-2 text-xs font-bold">
            Muat lebih banyak ({filtered.length - limit} lagi)
          </button>
        ) : null}
      </div>
    </Panel>
  );
}
