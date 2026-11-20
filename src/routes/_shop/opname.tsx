import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, RotateCcw, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KategoriPicker } from "@/components/shop/opname-kategori";
import { OpnameDraft } from "@/components/shop/opname-draft";
import { OpnameCek } from "@/components/shop/opname-cek";
import { OpnameHistory } from "@/components/shop/opname-history";
import { OpnameReport } from "@/components/shop/opname-report";
import { OpnameRows } from "@/components/shop/opname-rows";
import { FILTER_OPTIONS, Pager, TONE, type OpnameFilterKey, type OpnameTone } from "@/components/shop/opname-ui";
import { Panel, inputClass } from "@/components/shop/shell";
import { usePersistedState } from "@/lib/persist";
import { listKategoriBarang, opnameList, opnameSaveSettings, opnameSettings, opnameSummary } from "@/lib/shop/api";
import type { OpnameItem, OpnameSummary } from "@/lib/shop/types";

type Tab = "daftar" | "sementara" | "riwayat" | "laporan";

const asId = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/_shop/opname")({
  // ?cek=ID membuka halaman Cek Barang; ?tab=riwayat|laporan membuka tab itu; ?hid=ID menyaring riwayat satu barang.
  validateSearch: (search: Record<string, unknown>): { tab?: "sementara" | "riwayat" | "laporan"; cek?: number; hid?: number } => ({
    tab: search.tab === "sementara" || search.tab === "riwayat" || search.tab === "laporan" ? search.tab : undefined,
    cek: asId(search.cek),
    hid: asId(search.hid),
  }),
  component: OpnamePage,
});

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function OpnamePage() {
  const me = Route.useRouteContext().me;
  const { tab: tabParam, cek, hid } = Route.useSearch();
  const navigate = useNavigate();
  const canSave = me.role === "Admin";
  const tab: Tab = tabParam ?? "daftar";

  // Filter daftar diingat selama tab browser terbuka (juga dipakai tombol "Lanjut ke Barang Berikutnya").
  const [q, setQ] = usePersistedState("opname:q", "");
  const [kategori, setKategori] = usePersistedState<string[]>("opname:kategori2", []);
  const [filter, setFilter] = usePersistedState<OpnameFilterKey>("opname:filter", "semua");
  const [categories, setCategories] = useState<string[]>([]);
  const [summaryTick, setSummaryTick] = useState(0);

  useEffect(() => {
    void listKategoriBarang()
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  const goList = useCallback(() => void navigate({ to: "/opname", search: {}, replace: true }), [navigate]);
  const openCek = useCallback((id: number, replace = false) => void navigate({ to: "/opname", search: { cek: id }, replace }), [navigate]);
  const goTab = (next: Tab) => void navigate({ to: "/opname", search: next === "daftar" ? {} : { tab: next } });

  if (cek) {
    return (
      <OpnameCek
        productId={cek}
        canSave={canSave}
        ctx={{ q: q.trim(), kategori: kategori, filter }}
        onBack={goList}
        onOpen={(id) => openCek(id, true)}
        onHistory={(id) => void navigate({ to: "/opname", search: { tab: "riwayat", hid: id } })}
        onSaved={() => setSummaryTick((n) => n + 1)}
      />
    );
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "daftar", label: "Daftar Barang" },
    { key: "sementara", label: "Hitungan Sementara" },
    { key: "riwayat", label: "Riwayat" },
    { key: "laporan", label: "Laporan" },
  ];

  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-accent">
            <ClipboardCheck className="size-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-tight text-slate-900">Stok Opname</h2>
            <p className="text-xs text-slate-600">Cek stok barang kapan saja. Status pemeriksaan setiap barang selalu tersimpan.</p>
          </div>
        </div>
        <div role="tablist" aria-label="Menu Stok Opname" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-label={t.label}
              onClick={() => goTab(t.key)}
              className={`h-11 rounded-lg text-sm font-bold transition ${tab === t.key ? "bg-white text-accent shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Panel>

      {tab === "daftar" ? (
        <Daftar
          canSave={canSave}
          categories={categories}
          q={q}
          setQ={setQ}
          kategori={kategori}
          setKategori={setKategori}
          filter={filter}
          setFilter={setFilter}
          summaryTick={summaryTick}
          onOpen={(id) => openCek(id)}
          onHistory={(id) => void navigate({ to: "/opname", search: { tab: "riwayat", hid: id } })}
        />
      ) : null}
      {tab === "sementara" ? (
        <Panel>
          <OpnameDraft categories={categories} canSave={canSave} onOpen={(id) => openCek(id)} onChanged={() => setSummaryTick((n) => n + 1)} />
        </Panel>
      ) : null}
      {tab === "riwayat" ? (
        <Panel>
          <OpnameHistory
            categories={categories}
            productId={hid ?? null}
            onClearProduct={() => void navigate({ to: "/opname", search: { tab: "riwayat" }, replace: true })}
            onOpenItem={(id) => openCek(id)}
            canOpen
            canDelete={canSave}
          />
        </Panel>
      ) : null}
      {tab === "laporan" ? (
        <Panel>
          <OpnameReport categories={categories} />
        </Panel>
      ) : null}
    </div>
  );
}

function Daftar({
  canSave,
  categories,
  q,
  setQ,
  kategori,
  setKategori,
  filter,
  setFilter,
  summaryTick,
  onOpen,
  onHistory,
}: {
  canSave: boolean;
  categories: string[];
  q: string;
  setQ: (v: string) => void;
  kategori: string[];
  setKategori: (v: string[]) => void;
  filter: OpnameFilterKey;
  setFilter: (v: OpnameFilterKey) => void;
  summaryTick: number;
  onOpen: (id: number) => void;
  onHistory: (id: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<OpnameSummary | null>(null);
  const [data, setData] = useState<{ total: number; perPage: number; items: OpnameItem[] } | null>(null);
  const [error, setError] = useState("");
  const dq = useDebounced(q.trim());

  useEffect(() => {
    let alive = true;
    void opnameSummary({ data: { kategori: kategori } })
      .then((res) => {
        if (alive) setSummary(res);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || "Gagal memuat ringkasan.");
      });
    return () => {
      alive = false;
    };
  }, [kategori, summaryTick]);

  useEffect(() => {
    let alive = true;
    void opnameList({ data: { q: dq, kategori: kategori, filter, page } })
      .then((res) => {
        if (!alive) return;
        setError("");
        setData(res);
      })
      .catch((err: Error) => {
        if (!alive) return;
        setError(err.message || "Gagal memuat daftar barang.");
      });
    return () => {
      alive = false;
    };
  }, [dq, kategori, filter, page]);

  const changePage = (next: number) => {
    setPage(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const pick = (key: OpnameFilterKey) => {
    setPage(1);
    setFilter(key);
  };
  const reset = () => {
    setQ("");
    setKategori([]);
    setFilter("semua");
    setPage(1);
  };
  const dirty = Boolean(q || kategori.length > 0 || filter !== "semua");

  const cards: Array<{ key: OpnameFilterKey; label: string; value: number | null; tone: OpnameTone; span?: boolean }> = [
    { key: "semua", label: "Total Barang", value: summary?.total ?? null, tone: "blue", span: true },
    { key: "sudah", label: "Sudah Dicek", value: summary?.sudah ?? null, tone: "green" },
    { key: "belum", label: "Belum Dicek", value: summary?.belum ?? null, tone: "gray" },
    { key: "selisih", label: "Ada Selisih", value: summary?.selisih ?? null, tone: "orange" },
    { key: "ulang", label: "Perlu Cek Ulang", value: summary?.ulang ?? null, tone: "yellow" },
    { key: "draft", label: "Sedang Dihitung", value: summary?.draft ?? null, tone: "purple" },
  ];

  return (
    <>
      <Panel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {cards.map((card) => {
            const tone = TONE[card.tone];
            const active = filter === card.key;
            return (
              <button
                key={card.key}
                type="button"
                aria-label={`${card.label}: tampilkan daftarnya`}
                aria-pressed={active}
                onClick={() => pick(card.key)}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${card.span ? "col-span-2 sm:col-span-1" : ""} ${tone.panel} ${active ? "ring-2 ring-accent ring-offset-1" : "hover:brightness-95"}`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">{card.label}</span>
                <span className="num mt-0.5 text-2xl font-extrabold leading-tight text-slate-900">{card.value == null ? "…" : card.value.toLocaleString("id-ID")}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-sm font-extrabold text-slate-900">Progres Pemeriksaan</p>
            <p className="num text-lg font-extrabold text-accent">{summary ? `${summary.progress}%` : "…"}</p>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary?.progress ?? 0}>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${summary?.progress ?? 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {summary ? `${summary.sudah.toLocaleString("id-ID")} dari ${summary.total.toLocaleString("id-ID")} barang sudah dicek${kategori.length ? ` (kategori ${kategori.join(", ")})` : ""}` : "Memuat..."}
          </p>
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="relative sm:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputClass} pl-9 pr-10`}
              placeholder="Cari nama, kode, part number, alt, merek"
              aria-label="Cari barang"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
            {q ? (
              <button type="button" aria-label="Hapus pencarian" onClick={() => { setPage(1); setQ(""); }} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <KategoriPicker value={kategori} options={categories} onChange={(next) => { setPage(1); setKategori(next); }} />
          <select className={inputClass} aria-label="Status pemeriksaan" value={filter} onChange={(e) => pick(e.target.value as OpnameFilterKey)}>
            {FILTER_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button type="button" aria-label="Reset filter" disabled={!dirty} onClick={reset} className="col-span-full inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-40 sm:col-span-2 xl:col-span-1">
            <RotateCcw className="size-4" /> Reset Filter
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <p className="mt-3 text-xs font-semibold text-slate-600">{data ? `${data.total.toLocaleString("id-ID")} barang` : "Memuat..."}</p>
        <div className="mt-2">
          {data ? (
            <OpnameRows items={data.items} q={dq} canSave={canSave} onOpen={onOpen} onHistory={onHistory} />
          ) : (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          )}
        </div>
        {data ? <Pager page={page} total={data.total} perPage={data.perPage} onPage={changePage} /> : null}
      </Panel>

      {canSave ? <SyncSetting /> : null}
    </>
  );
}

function SyncSetting() {
  const [autoSync, setAutoSync] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void opnameSettings()
      .then((res) => setAutoSync(res.autoSync))
      .catch(() => undefined);
  }, []);
  if (autoSync == null) return null;
  return (
    <Panel>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0"
          checked={autoSync}
          disabled={saving}
          onChange={(e) => {
            const next = e.target.checked;
            setSaving(true);
            void opnameSaveSettings({ data: { autoSync: next } })
              .then((res) => {
                setAutoSync(res.autoSync);
                toast.success(res.autoSync ? "Jumlah di sistem akan disesuaikan otomatis setelah pemeriksaan." : "Pemeriksaan hanya dicatat, jumlah di sistem tidak diubah.");
              })
              .catch((err: Error) => toast.error(err.message))
              .finally(() => setSaving(false));
          }}
        />
        <span className="min-w-0 text-sm">
          <span className="block font-bold text-slate-900">Sesuaikan jumlah di sistem otomatis</span>
          <span className="block text-xs leading-5 text-slate-600">
            Jika aktif, setelah pemeriksaan disimpan jumlah barang di sistem disamakan dengan jumlah fisik. Jika nonaktif, pemeriksaan hanya dicatat tanpa mengubah jumlah.
          </span>
        </span>
      </label>
    </Panel>
  );
}
