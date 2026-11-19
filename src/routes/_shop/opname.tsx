import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck, History, ListChecks, PackageX, RotateCcw, Save, Settings2, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExpandButton, ExpandGroup } from "@/components/ui/button-7";
import { confirmDialog } from "@/lib/confirm";
import { usePersistedState } from "@/lib/persist";
import { inputClass, Panel } from "@/components/shop/shell";
import {
  opnameHistory,
  opnameHistoryDetail,
  opnameItems,
  opnameOverview,
  resetOpnameMarks,
  saveOpname,
  saveOpnameSettings,
} from "@/lib/shop/api";
import { todayInput, when } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/opname")({ component: OpnamePage });

type CatStatus = "belum" | "terlambat" | "sebagian" | "segera" | "aman";
type Cat = {
  kategori: string;
  total: number;
  valid: number;
  ever: number;
  intervalBulan: number;
  lastChecked: string | null;
  next: string | null;
  status: CatStatus;
  days: number;
};
type Row = {
  id: number;
  kode: string;
  nama: string;
  merek: string;
  partNumber: string;
  satuan: string;
  satuanAlt: string;
  isiSatuanAlt: number;
  stok: number;
  checkedAt: string | null;
  checkedBy: string;
  cSistem: number | null;
  cFisik: number | null;
  valid: boolean;
};
/** Hitungan yang sudah diisi tapi belum disimpan. f = stok fisik, s = stok sistem saat barang mulai dihitung. */
type Draft = { f: number | null; s: number };
type Tab = "Cek" | "Riwayat" | "Pengaturan";

const DAY = 86400000;
const PER_PAGE = 25;
const INTERVALS = [1, 2, 3, 4, 6, 12];
const DRAFT_KEY = "mjs:opname-draft:v1";

function dateOnly(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function daysAgo(days: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() - days * DAY));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function afterMonths(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function announce() {
  window.dispatchEvent(new Event("mjs-opname-changed"));
}

/** Hitungan yang belum disimpan tetap ada walau halaman ditutup, supaya pengecekan bisa dilanjutkan. */
function useDrafts() {
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setDrafts(JSON.parse(raw) as Record<number, Draft>);
    } catch {
      /* data rusak atau storage diblokir: mulai kosong */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    } catch {
      /* storage penuh: abaikan */
    }
  }, [drafts, ready]);
  return [drafts, setDrafts] as const;
}

function effective(row: Row, draft?: Draft) {
  if (draft) return { fisik: draft.f, sistem: draft.s, saved: false };
  if (row.valid && row.cFisik !== null && row.cSistem !== null) return { fisik: row.cFisik, sistem: row.cSistem, saved: true };
  return { fisik: null as number | null, sistem: row.stok, saved: false };
}

type StatusKey = "belum" | "cocok" | "kurang" | "lebih" | "habis";
const TONE: Record<StatusKey, string> = {
  belum: "bg-slate-100 text-slate-600",
  cocok: "bg-emerald-100 text-emerald-800",
  kurang: "bg-amber-100 text-amber-800",
  lebih: "bg-blue-100 text-blue-800",
  habis: "bg-red-100 text-red-700",
};

function statusOf(sistem: number, fisik: number | null): { key: StatusKey; label: string; note: string } {
  if (fisik === null) return { key: "belum", label: "Belum dicek", note: "" };
  if (fisik === 0 && sistem > 0) return { key: "habis", label: "Habis", note: `Sistem masih ${sistem}` };
  if (fisik === sistem) return { key: "cocok", label: "Cocok", note: "" };
  if (fisik > sistem) return { key: "lebih", label: `Lebih ${fisik - sistem}`, note: sistem === 0 ? "Sistem sudah 0" : "" };
  return { key: "kurang", label: `Kurang ${sistem - fisik}`, note: "" };
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${tone}`}>{children}</span>;
}

function CatBadge({ cat }: { cat: Cat }) {
  if (cat.status === "aman") return <Badge tone="bg-emerald-100 text-emerald-800">Aman</Badge>;
  if (cat.status === "segera") return <Badge tone="bg-amber-100 text-amber-800">{cat.days} hari lagi</Badge>;
  if (cat.status === "terlambat") return <Badge tone="bg-red-100 text-red-700">Terlambat {cat.days} hari</Badge>;
  if (cat.status === "sebagian") return <Badge tone="bg-blue-100 text-blue-800">Belum lengkap</Badge>;
  return <Badge tone="bg-slate-100 text-slate-600">Belum pernah</Badge>;
}

function Pager({ page, pages, total, shown, onPage }: { page: number; pages: number; total: number; shown: number; onPage: (p: number) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-slate-600">Menampilkan {shown} dari {total}</span>
      <div className="flex items-center gap-2">
        <button className="h-10 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
        <span>Hal: {page}/{pages}</span>
        <button className="h-10 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
      </div>
    </div>
  );
}

const th = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 whitespace-nowrap";

function OpnamePage() {
  const [tab, setTab] = usePersistedState<Tab>("opname:tab", "Cek");
  const [cats, setCats] = useState<Cat[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadCats = useCallback(() => {
    void opnameOverview()
      .then((res) => { setCats(res.categories as Cat[]); setLoaded(true); })
      .catch((error: Error) => { setLoaded(true); toast.error(error.message || "Gagal memuat kategori."); });
  }, []);
  useEffect(() => { loadCats(); }, [loadCats]);

  const due = cats.filter((c) => c.status === "terlambat").length;
  const tabs: { key: Tab; icon: React.ReactNode }[] = [
    { key: "Cek", icon: <ClipboardCheck className="size-4" /> },
    { key: "Riwayat", icon: <History className="size-4" /> },
    { key: "Pengaturan", icon: <Settings2 className="size-4" /> },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-extrabold">Stok opname</h2>
            <p className="mt-0.5 text-xs text-muted">Cek stok fisik per kategori. Hasilnya otomatis menyesuaikan stok di Daftar Sparepart.</p>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${tab === item.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {item.icon}
                {item.key}
                {item.key === "Pengaturan" && due > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{due}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      {tab === "Cek" ? <CekTab cats={cats} loaded={loaded} reloadCats={loadCats} /> : null}
      {tab === "Riwayat" ? <RiwayatTab cats={cats} /> : null}
      {tab === "Pengaturan" ? <PengaturanTab cats={cats} loaded={loaded} reloadCats={loadCats} /> : null}
    </div>
  );
}

// ───────────────────────── Cek ─────────────────────────

function CekTab({ cats, loaded, reloadCats }: { cats: Cat[]; loaded: boolean; reloadCats: () => void }) {
  const [kategori, setKategori] = usePersistedState("opname:kategori", "");
  const [q, setQ] = usePersistedState("opname:q", "");
  const [status, setStatus] = usePersistedState("opname:status", "");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [interval, setIntervalBulan] = useState(3);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useDrafts();
  const [ids, setIds] = useState<number[]>([]);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const cat = cats.find((c) => c.kategori.toLowerCase() === kategori.toLowerCase());

  const loadRows = useCallback((name: string) => {
    if (!name) { setRows([]); return Promise.resolve(); }
    setLoading(true);
    return opnameItems({ data: { kategori: name } })
      .then((res) => { setRows(res.items as Row[]); setIntervalBulan(res.intervalBulan); })
      .catch((error: Error) => toast.error(error.message || "Gagal memuat barang."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { void loadRows(kategori); }, [kategori, loadRows]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // Daftar yang tampil disusun saat filter/cari berubah, bukan tiap angka diketik, supaya baris tidak hilang saat Anda mengetik.
  useEffect(() => {
    const needle = q.trim().toLowerCase();
    const next = rows.filter((r) => {
      const e = effective(r, draftsRef.current[r.id]);
      const s = statusOf(e.sistem, e.fisik);
      if (needle && !`${r.nama} ${r.kode} ${r.partNumber} ${r.merek}`.toLowerCase().includes(needle)) return false;
      if (status === "belum") return s.key === "belum";
      if (status === "sudah") return s.key !== "belum";
      if (status === "cocok") return s.key === "cocok";
      if (status === "selisih") return s.key !== "belum" && s.key !== "cocok";
      if (status === "habis") return s.key === "habis";
      return true;
    });
    setIds(next.map((r) => r.id));
    setPage(1);
  }, [rows, q, status]);

  const calc = useMemo(() => {
    let sudah = 0, cocok = 0, selisih = 0, habis = 0, pending = 0;
    for (const r of rows) {
      const d = drafts[r.id];
      const e = effective(r, d);
      const s = statusOf(e.sistem, e.fisik);
      if (e.fisik !== null) sudah += 1;
      if (s.key === "cocok") cocok += 1;
      else if (s.key !== "belum") selisih += 1;
      if (s.key === "habis") habis += 1;
      if (d && d.f !== null) pending += 1;
    }
    return { sudah, cocok, selisih, habis, pending };
  }, [rows, drafts]);

  function setFisik(row: Row, f: number | null) {
    setDrafts((prev) => ({ ...prev, [row.id]: { f, s: prev[row.id] ? prev[row.id].s : row.stok } }));
  }
  function clearDraft(id: number) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const pages = Math.max(1, Math.ceil(ids.length / PER_PAGE));
  const pageRows = ids.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((id) => byId.get(id)).filter((r): r is Row => Boolean(r));

  async function markPageCocok() {
    const todo = pageRows.filter((r) => {
      const e = effective(r, drafts[r.id]);
      return !e.saved && e.fisik === null;
    });
    if (!todo.length) { toast.info("Tidak ada barang yang belum dicek di halaman ini."); return; }
    if (!(await confirmDialog(`Tandai ${todo.length} barang di halaman ini cocok dengan stok sistem? Lakukan ini hanya kalau Anda sudah menghitung semuanya di rak.`, { title: "Tandai halaman ini cocok?", confirmText: "Ya, cocok semua" }))) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of todo) next[r.id] = { f: r.stok, s: r.stok };
      return next;
    });
  }

  async function finish() {
    const payload = rows.flatMap((r) => {
      const d = drafts[r.id];
      return d && d.f !== null ? [{ productId: r.id, sistem: d.s, fisik: d.f }] : [];
    });
    if (!payload.length) { toast.error("Belum ada barang yang diisi."); return; }
    const selisih = payload.filter((p) => p.fisik !== p.sistem).length;
    const ok = await confirmDialog(
      `Simpan hasil cek ${payload.length} barang kategori ${kategori} ke riwayat? ${selisih ? `${selisih} barang berselisih. Stok di Daftar Sparepart akan disesuaikan dengan hitungan fisik.` : "Semua cocok, stok tidak berubah."}${rows.some((r) => !drafts[r.id] && effective(r, undefined).fisik === null && !payload.some((p) => p.productId === r.id)) ? " Barang yang belum dicek tidak diubah dan bisa dilanjutkan lain waktu." : ""}`,
      { title: "Selesai, simpan ke riwayat?", confirmText: "Simpan ke riwayat" },
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await saveOpname({ data: { kategori, items: payload } });
      setDrafts((prev) => {
        const next = { ...prev };
        for (const p of payload) delete next[p.productId];
        return next;
      });
      toast.success(`Opname ${kategori} tersimpan`, { description: `${res?.dicek ?? payload.length} barang dicek, ${res?.selisih ?? selisih} selisih disesuaikan.` });
      await loadRows(kategori);
      reloadCats();
      announce();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan opname.");
    } finally {
      setSaving(false);
    }
  }

  const waiting = cats.filter((c) => c.status === "terlambat" || c.status === "belum" || c.status === "sebagian");

  return (
    <Panel>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-extrabold">Cek stok fisik</h3>
        {kategori ? <p className="text-xs text-muted">Cek berikutnya setelah selesai: <b className="text-slate-700">{dateOnly(afterMonths(interval))}</b></p> : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 lg:flex-row">
        <select className={`${inputClass} lg:max-w-xs`} value={kategori} onChange={(e) => { setKategori(e.target.value); setQ(""); setStatus(""); }}>
          <option value="">{loaded ? "Pilih kategori" : "Memuat kategori..."}</option>
          {cats.map((c) => (
            <option key={c.kategori} value={c.kategori}>
              {c.kategori} ({c.valid}/{c.total}){c.status === "terlambat" ? " · terlambat" : ""}
            </option>
          ))}
        </select>
        <input className={inputClass} placeholder="Cari nama, kode, merek, atau part number" value={q} onChange={(e) => setQ(e.target.value)} disabled={!kategori} />
        <select className={`${inputClass} lg:max-w-[260px]`} value={status} onChange={(e) => setStatus(e.target.value)} disabled={!kategori}>
          <option value="">Semua status</option>
          <option value="belum">Belum dicek</option>
          <option value="sudah">Sudah dicek</option>
          <option value="cocok">Cocok</option>
          <option value="selisih">Ada selisih</option>
          <option value="habis">Habis di fisik, ada di sistem</option>
        </select>
      </div>

      {!kategori ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-slate-50 p-6 text-center">
          <p className="font-semibold">Pilih kategori untuk mulai mengecek</p>
          <p className="mt-1 text-sm text-muted">Setiap kategori dicek sendiri, jadi daftar barangnya pendek dan mudah dipantau.</p>
          {waiting.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Waktunya dicek</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {waiting.slice(0, 8).map((c) => (
                  <button key={c.kategori} type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-slate-50" onClick={() => setKategori(c.kategori)}>
                    {c.kategori}
                    <CatBadge cat={c} />
                  </button>
                ))}
              </div>
              {waiting.length > 8 ? <p className="mt-2 text-xs text-muted">Dan {waiting.length - 8} kategori lain di daftar pilihan atau tab Pengaturan.</p> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <button type="button" onClick={() => setStatus("sudah")} className="rounded-xl border border-line bg-white p-3 text-left hover:bg-slate-50">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Sudah dicek</span>
              <span className="mt-1 block text-xl font-extrabold">{calc.sudah} <span className="text-sm font-semibold text-muted">/ {rows.length}</span></span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded bg-slate-200"><span className="block h-full bg-emerald-500 transition-all" style={{ width: `${rows.length ? Math.round((calc.sudah / rows.length) * 100) : 0}%` }} /></span>
            </button>
            <button type="button" onClick={() => setStatus("cocok")} className="rounded-xl border border-line bg-white p-3 text-left hover:bg-slate-50">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Cocok</span>
              <span className="mt-1 block text-xl font-extrabold text-emerald-700">{calc.cocok}</span>
            </button>
            <button type="button" onClick={() => setStatus("selisih")} className="rounded-xl border border-line bg-white p-3 text-left hover:bg-slate-50">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Ada selisih</span>
              <span className="mt-1 block text-xl font-extrabold text-amber-700">{calc.selisih}</span>
            </button>
            <button type="button" onClick={() => setStatus("habis")} className="rounded-xl border border-red-200 bg-red-50 p-3 text-left hover:bg-red-100">
              <span className="text-[11px] font-bold uppercase tracking-wide text-red-700">Habis di fisik, ada di sistem</span>
              <span className="mt-1 block text-xl font-extrabold text-red-700">{calc.habis}</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Centang kalau jumlah fisik sama dengan sistem, tekan <b>Habis</b> kalau rak kosong, atau ketik jumlah yang Anda hitung.
              {status || q ? <button type="button" className="ml-2 font-semibold text-accent underline" onClick={() => { setStatus(""); setQ(""); }}>Hapus filter</button> : null}
            </p>
            <ExpandGroup>
              <ExpandButton size="md" label="Tandai halaman ini cocok" icon={<CheckCheck />} onClick={() => void markPageCocok()} />
            </ExpandGroup>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${th} w-10`} aria-label="Cocok" />
                  <th className={th}>Barang</th>
                  <th className={`${th} text-right`}>Sistem</th>
                  <th className={th}>Stok fisik</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const d = drafts[r.id];
                  const e = effective(r, d);
                  const s = statusOf(e.sistem, e.fisik);
                  const conv = r.satuanAlt && r.isiSatuanAlt > 0 ? `${Math.floor(e.sistem / r.isiSatuanAlt)} ${r.satuanAlt} + ${e.sistem % r.isiSatuanAlt}` : "";
                  return (
                    <tr key={r.id} className={`border-t border-line align-top ${s.key === "habis" ? "bg-red-50/60" : s.key === "belum" ? "" : "bg-slate-50/50"}`}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 cursor-pointer"
                          aria-label={`Cocok: ${r.nama}`}
                          checked={e.fisik !== null && e.fisik === e.sistem}
                          disabled={e.saved}
                          onChange={(ev) => (ev.target.checked ? setFisik(r, d ? d.s : r.stok) : clearDraft(r.id))}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold">{r.nama}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span>{r.kode}</span>
                          {r.merek ? <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">{r.merek}</span> : null}
                          {r.partNumber ? <span>{r.partNumber}</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-bold">{e.sistem} {r.satuan}</span>
                        {conv ? <div className="text-[11px] text-muted">{conv}</div> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          className="h-10 w-24 rounded-lg border border-line bg-white px-2 text-right text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                          placeholder="isi jumlah"
                          aria-label={`Stok fisik ${r.nama}`}
                          disabled={e.saved}
                          value={e.fisik === null ? "" : e.fisik}
                          onChange={(ev) => {
                            const v = ev.target.value;
                            if (v === "") setFisik(r, null);
                            else setFisik(r, Math.max(0, Math.round(Number(v) || 0)));
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={TONE[s.key]}>{s.label}</Badge>
                        {s.note ? <div className="mt-1 text-[11px] font-semibold text-red-700">{s.note}</div> : null}
                        {e.saved && r.checkedAt ? <div className="mt-1 text-[11px] text-muted">Dicek {dateOnly(r.checkedAt)}{r.checkedBy ? ` oleh ${r.checkedBy}` : ""}</div> : null}
                        {!e.saved && d && d.f !== null ? <div className="mt-1 text-[11px] text-muted">Belum disimpan</div> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {e.saved ? (
                          <ExpandGroup><ExpandButton label="Cek ulang" icon={<RotateCcw />} onClick={() => setFisik(r, null)} /></ExpandGroup>
                        ) : e.fisik !== null ? (
                          <ExpandGroup><ExpandButton label="Cek ulang" icon={<RotateCcw />} onClick={() => clearDraft(r.id)} /></ExpandGroup>
                        ) : (
                          <ExpandGroup><ExpandButton variant="danger" label="Habis" icon={<PackageX />} onClick={() => setFisik(r, 0)} /></ExpandGroup>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">Memuat barang...</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">{rows.length === 0 ? "Belum ada barang di kategori ini." : "Tidak ada barang yang cocok dengan filter."}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pager page={page} pages={pages} total={ids.length} shown={pageRows.length} onPage={setPage} />

          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              {calc.pending > 0 ? <b className="text-slate-700">{calc.pending} barang terisi, belum disimpan. </b> : null}
              Boleh disimpan sebelum semua selesai, dan dilanjutkan lain waktu.
            </p>
            <ExpandGroup>
              <ExpandButton size="md" variant="primary" label={saving ? "Menyimpan..." : "Selesai, simpan ke riwayat"} icon={<Save />} onClick={() => { if (!saving) void finish(); }} />
            </ExpandGroup>
          </div>
        </>
      )}
    </Panel>
  );
}

// ───────────────────────── Riwayat ─────────────────────────

type LogRow = { id: number; tanggal: string; kategori: string; oleh: string; dicek: number; selisih: number };
type LogItem = { kode: string; nama: string; satuan: string; sistem: number; fisik: number };

function RiwayatTab({ cats }: { cats: Cat[] }) {
  const [start, setStart] = usePersistedState("opname:rw:start", "");
  const [end, setEnd] = usePersistedState("opname:rw:end", "");
  const [kategori, setKategori] = usePersistedState("opname:rw:kategori", "");
  const [q, setQ] = usePersistedState("opname:rw:q", "");
  const [onlySelisih, setOnlySelisih] = usePersistedState("opname:rw:selisih", false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; perPage: number; rows: LogRow[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, LogItem[]>>({});

  useEffect(() => {
    let alive = true;
    void opnameHistory({ data: { start, end, kategori, q, onlySelisih, page } })
      .then((res) => { if (alive) setData(res as { total: number; perPage: number; rows: LogRow[] }); })
      .catch((error: Error) => toast.error(error.message || "Gagal memuat riwayat."));
    return () => { alive = false; };
  }, [start, end, kategori, q, onlySelisih, page]);

  function toggle(id: number) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!detail[id]) {
      void opnameHistoryDetail({ data: { id } })
        .then((items) => setDetail((prev) => ({ ...prev, [id]: items as LogItem[] })))
        .catch((error: Error) => toast.error(error.message));
    }
  }
  function range(days: number | null) {
    setPage(1);
    if (days === null) { setStart(""); setEnd(""); return; }
    setStart(daysAgo(days));
    setEnd(todayInput());
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 15)));

  return (
    <Panel>
      <h3 className="text-base font-extrabold">Riwayat pengecekan</h3>
      <p className="mt-0.5 text-xs text-muted">Bukti setiap pengecekan: tanggal, siapa yang mengecek, dan hasilnya. Klik baris untuk melihat tiap barang.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-muted">Dari tanggal<input type="date" className={`${inputClass} mt-1`} value={start} onChange={(e) => { setPage(1); setStart(e.target.value); }} /></label>
        <label className="text-xs font-semibold text-muted">Sampai tanggal<input type="date" className={`${inputClass} mt-1`} value={end} onChange={(e) => { setPage(1); setEnd(e.target.value); }} /></label>
        <label className="text-xs font-semibold text-muted">Kategori
          <select className={`${inputClass} mt-1`} value={kategori} onChange={(e) => { setPage(1); setKategori(e.target.value); }}>
            <option value="">Semua kategori</option>
            {cats.map((c) => <option key={c.kategori} value={c.kategori}>{c.kategori}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">Cari barang<input className={`${inputClass} mt-1`} placeholder="Nama atau kode barang" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="h-9 rounded-lg border border-line px-3 text-sm" onClick={() => range(null)}>Semua tanggal</button>
        <button type="button" className="h-9 rounded-lg border border-line px-3 text-sm" onClick={() => range(7)}>7 hari</button>
        <button type="button" className="h-9 rounded-lg border border-line px-3 text-sm" onClick={() => range(30)}>30 hari</button>
        <button type="button" className="h-9 rounded-lg border border-line px-3 text-sm" onClick={() => range(90)}>3 bulan</button>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm"><input type="checkbox" checked={onlySelisih} onChange={(e) => { setPage(1); setOnlySelisih(e.target.checked); }} />Hanya yang ada selisih</label>
        <button type="button" className="h-9 rounded-lg border border-line px-3 text-sm font-semibold" onClick={() => { setStart(""); setEnd(""); setKategori(""); setQ(""); setOnlySelisih(false); setPage(1); }}>Hapus filter</button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={`${th} w-8`} />
              <th className={th}>Tanggal</th>
              <th className={th}>Kategori</th>
              <th className={th}>Dicek</th>
              <th className={th}>Selisih</th>
              <th className={th}>Oleh</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <FragmentRows key={r.id} row={r} open={open === r.id} items={detail[r.id]} onToggle={() => toggle(r.id)} />
            ))}
            {data && data.rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">Belum ada riwayat pengecekan{start || end || kategori || q || onlySelisih ? " pada filter ini" : ""}.</td></tr> : null}
            {!data ? <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">Memuat riwayat...</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={data?.total ?? 0} shown={data?.rows.length ?? 0} onPage={setPage} />
    </Panel>
  );
}

function FragmentRows({ row, open, items, onToggle }: { row: LogRow; open: boolean; items?: LogItem[]; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-line hover:bg-slate-50" onClick={onToggle}>
        <td className="px-3 py-2.5"><ChevronRight className={`size-4 text-muted transition-transform ${open ? "rotate-90" : ""}`} /></td>
        <td className="px-3 py-2.5 whitespace-nowrap font-medium">{when(row.tanggal)}</td>
        <td className="px-3 py-2.5 font-semibold">{row.kategori}</td>
        <td className="px-3 py-2.5">{row.dicek} barang</td>
        <td className="px-3 py-2.5">{row.selisih === 0 ? <Badge tone={TONE.cocok}>Cocok</Badge> : <Badge tone={TONE.kurang}>{row.selisih} barang</Badge>}</td>
        <td className="px-3 py-2.5">{row.oleh || "-"}</td>
      </tr>
      {open ? (
        <tr className="bg-slate-50/70">
          <td />
          <td colSpan={5} className="px-3 pb-3">
            {!items ? <p className="py-2 text-sm text-muted">Memuat rincian...</p> : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    <th className="py-1.5 pr-3">Barang</th>
                    <th className="py-1.5 pr-3 text-right">Sistem</th>
                    <th className="py-1.5 pr-3 text-right">Fisik</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, idx) => {
                    const s = statusOf(i.sistem, i.fisik);
                    return (
                      <tr key={`${i.kode}-${idx}`} className="border-t border-line">
                        <td className="py-1.5 pr-3"><span className="font-semibold">{i.nama}</span> <span className="text-muted">{i.kode}</span></td>
                        <td className="py-1.5 pr-3 text-right">{i.sistem} {i.satuan}</td>
                        <td className="py-1.5 pr-3 text-right">{i.fisik} {i.satuan}</td>
                        <td className="py-1.5"><Badge tone={TONE[s.key]}>{s.label}</Badge>{s.note ? <span className="ml-1.5 text-[11px] text-red-700">{s.note}</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ───────────────────────── Pengaturan ─────────────────────────

function PengaturanTab({ cats, loaded, reloadCats }: { cats: Cat[]; loaded: boolean; reloadCats: () => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulan, setBulan] = useState(3);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cats.filter((c) => !needle || c.kategori.toLowerCase().includes(needle));
  }, [cats, q]);
  const pages = Math.max(1, Math.ceil(shown.length / 15));
  const pageRows = shown.slice((page - 1) * 15, page * 15);
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.includes(c.kategori));

  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await task();
      toast.success(done);
      reloadCats();
      announce();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function applyAll() {
    if (!(await confirmDialog(`Atur semua ${cats.length} kategori menjadi dicek setiap ${bulan} bulan?`, { title: "Atur semua kategori?", confirmText: "Terapkan" }))) return;
    await run(() => saveOpnameSettings({ data: { all: true, intervalBulan: bulan } }), "Interval semua kategori disimpan");
  }
  async function applyPicked() {
    if (!picked.length) { toast.error("Centang kategori dulu."); return; }
    await run(() => saveOpnameSettings({ data: { kategori: picked, intervalBulan: bulan } }), `Interval ${picked.length} kategori disimpan`);
  }
  async function resetPicked() {
    if (!picked.length) { toast.error("Centang kategori dulu."); return; }
    if (!(await confirmDialog(`Reset tanda sudah dicek untuk ${picked.length} kategori? Semua barangnya kembali berstatus belum dicek. Stok dan riwayat tidak berubah.`, { title: "Reset tanda cek?", confirmText: "Reset", danger: true }))) return;
    await run(() => resetOpnameMarks({ data: { kategori: picked } }), "Tanda cek direset");
    setPicked([]);
  }

  return (
    <Panel>
      <h3 className="text-base font-extrabold">Pengaturan cek berkala</h3>
      <p className="mt-0.5 text-xs text-muted">Atur seberapa sering barang harus dicek ulang. Angka merah di menu = jumlah kategori yang sudah lewat jadwal.</p>

      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <input className={`${inputClass} lg:max-w-xs`} placeholder="Cari kategori" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <span className="text-sm text-slate-600">Dicek setiap</span>
          <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
            {INTERVALS.map((n) => <option key={n} value={n}>{n} bulan</option>)}
          </select>
          <ExpandGroup>
            <ExpandButton size="md" label={`Terapkan ke yang dicentang (${picked.length})`} icon={<ListChecks />} onClick={() => { if (!busy) void applyPicked(); }} />
            <ExpandButton size="md" label="Terapkan ke semua" icon={<Settings2 />} onClick={() => { if (!busy) void applyAll(); }} />
            <ExpandButton size="md" variant="danger" label="Reset tanda cek" icon={<RotateCcw />} onClick={() => { if (!busy) void resetPicked(); }} />
          </ExpandGroup>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={`${th} w-10`}>
                <input type="checkbox" className="size-4 cursor-pointer" aria-label="Pilih semua kategori yang tampil" checked={allShownPicked} onChange={(e) => setPicked(e.target.checked ? shown.map((c) => c.kategori) : [])} />
              </th>
              <th className={th}>Kategori</th>
              <th className={th}>Interval</th>
              <th className={th}>Sudah dicek</th>
              <th className={th}>Cek berikutnya</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => {
              const pct = c.total ? Math.round((c.valid / c.total) * 100) : 0;
              return (
                <tr key={c.kategori} className="border-t border-line hover:bg-slate-50">
                  <td className="px-3 py-2.5"><input type="checkbox" className="size-4 cursor-pointer" aria-label={`Pilih ${c.kategori}`} checked={picked.includes(c.kategori)} onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, c.kategori] : prev.filter((v) => v !== c.kategori)))} /></td>
                  <td className="px-3 py-2.5 font-semibold">{c.kategori}</td>
                  <td className="px-3 py-2.5">
                    <select
                      className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
                      value={c.intervalBulan}
                      disabled={busy}
                      onChange={(e) => void run(() => saveOpnameSettings({ data: { kategori: [c.kategori], intervalBulan: Number(e.target.value) } }), `Interval ${c.kategori} disimpan`)}
                    >
                      {(INTERVALS.includes(c.intervalBulan) ? INTERVALS : [...INTERVALS, c.intervalBulan].sort((a, b) => a - b)).map((n) => <option key={n} value={n}>{n} bulan</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-semibold">{c.valid} / {c.total}</div>
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                    {c.lastChecked ? <div className="mt-1 text-[11px] text-muted">Terakhir {dateOnly(c.lastChecked)}</div> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold">{dateOnly(c.next)}</div>
                    <div className="mt-1"><CatBadge cat={c} /></div>
                  </td>
                </tr>
              );
            })}
            {!loaded ? <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">Memuat kategori...</td></tr> : null}
            {loaded && shown.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">{q.trim() ? `Tidak ada kategori yang cocok dengan "${q}".` : "Belum ada kategori."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={shown.length} shown={pageRows.length} onPage={setPage} />
    </Panel>
  );
}
