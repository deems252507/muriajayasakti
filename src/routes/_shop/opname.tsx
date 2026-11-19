import { createFileRoute } from "@tanstack/react-router";
import { Check, PackageX, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { usePersistedState } from "@/lib/persist";
import { inputClass, Panel } from "@/components/shop/shell";
import { HasilBadge, hasAlt, ItemIdentityBlock, stokText } from "@/components/shop/opname-ui";
import { OpnameHistory } from "@/components/shop/opname-history";
import { OpnameSettings } from "@/components/shop/opname-settings";
import { batalOpnameCheck, listOpname, resetOpnameRound, saveOpnameCheck } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/opname")({ component: OpnamePage });

type Tab = "cek" | "riwayat" | "pengaturan";
type OpnameData = Awaited<ReturnType<typeof listOpname>>;
type Item = OpnameData["items"][number];
type UnitChoice = "base" | "alt";

/** Selisih lebih dari ini diminta konfirmasi dulu sebelum stok diubah. */
const BIG_DIFF = 10;
/** Batas stok yang diterima server. */
const MAX_STOK = 1000000;

const TABS: { id: Tab; label: string }[] = [
  { id: "cek", label: "Cek" },
  { id: "riwayat", label: "Riwayat" },
  { id: "pengaturan", label: "Pengaturan" },
];

const btnBase = "inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold disabled:opacity-50";
const btnNeutral = `${btnBase} border-line bg-white text-slate-800 hover:bg-slate-50`;
const btnPrimary = `${btnBase} border-accent bg-accent text-white hover:opacity-90`;

/** Kolom daftar barang di layar lebar: Barang | Stok sistem | Stok fisik | Aksi. */
const GRID = "md:grid md:grid-cols-[minmax(0,1fr)_150px_250px_minmax(200px,auto)] md:items-center md:gap-4";

const fmt = (n: number) => n.toLocaleString("id-ID");
const TONE: Record<string, string> = {
  cocok: "border-l-emerald-400",
  kurang: "border-l-amber-400",
  lebih: "border-l-blue-400",
  habis: "border-l-red-400",
};

function OpnamePage() {
  const [tab, setTab] = usePersistedState<Tab>("opname:tab", "cek");
  const current: Tab = TABS.some((t) => t.id === tab) ? tab : "cek";
  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600 sm:max-w-xl">
            Cek stok fisik barang. Kalau angkanya beda, stok di Daftar Sparepart langsung disesuaikan, dan setiap pengecekan bisa dibatalkan di Cek atau Riwayat.
          </p>
          <div className="flex w-full rounded-xl bg-slate-100 p-1 sm:inline-flex sm:w-auto" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                onClick={() => setTab(t.id)}
                className={`h-10 flex-1 rounded-lg px-4 text-sm font-semibold sm:flex-none ${current === t.id ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      {current === "cek" ? <OpnameCek /> : current === "riwayat" ? <OpnameHistory /> : <OpnameSettings />}
    </div>
  );
}

function OpnameCek() {
  const [q, setQ] = usePersistedState("opname:q", "");
  const [kategori, setKategori] = usePersistedState<string[]>("opname:kat", []);
  const [status, setStatus] = usePersistedState("opname:status", "belum");
  const [page, setPage] = useState(1);
  const [kategoriQ, setKategoriQ] = useState("");
  const [data, setData] = useState<OpnameData | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [units, setUnits] = useState<Record<number, UnitChoice>>({});
  const [redo, setRedo] = useState<number[]>([]);
  const [busy, setBusy] = useState<number[]>([]);
  const loadSeq = useRef(0);
  const undoing = useRef<Set<number>>(new Set());
  const dropdown = useRef<HTMLDetailsElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Selalu muat memakai filter terbaru, walau fungsi dipanggil dari proses simpan yang dimulai lebih awal.
  const latest = useRef({ q, kategori, status, page });
  latest.current = { q, kategori, status, page };

  function load(next?: number) {
    const seq = ++loadSeq.current;
    const cur = latest.current;
    const target = next ?? cur.page;
    void listOpname({ data: { q: cur.q, kategori: cur.kategori, status: cur.status, page: target } })
      .then((res) => {
        if (seq !== loadSeq.current) return;
        const pages = Math.max(1, Math.ceil(res.total / res.perPage));
        // Halaman terakhir baru saja kosong (mis. semua barangnya sudah dicek): mundur ke halaman yang masih ada.
        if (target > pages) { setPage(pages); return; }
        setError("");
        setData(res);
      })
      .catch((e: Error) => {
        if (seq !== loadSeq.current) return;
        setError(e.message || "Gagal memuat daftar barang.");
      });
  }

  useEffect(() => {
    const timer = setTimeout(() => load(page), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [q, kategori, status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saat tab dibuka lagi, ambil stok terbaru (mungkin ada penjualan di kasir selagi Anda menghitung).
  useEffect(() => {
    const onFocus = () => load(page);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [q, kategori, status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tutup daftar kategori kalau layar disentuh di luarnya.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = dropdown.current;
      if (el && el.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const clearDraft = (id: number) => setDrafts((d) => { const next = { ...d }; delete next[id]; return next; });
  const closeRedo = (id: number) => setRedo((r) => r.filter((v) => v !== id));
  const changed = () => window.dispatchEvent(new Event("mjs-opname-changed"));

  function goPage(n: number) {
    setPage(Math.max(1, n));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Batalkan pengecekan: stok kembali seperti sebelum dicek. Dipakai tombol di baris dan tombol di pesan hasil. */
  async function undo(checkId: number, nama: string) {
    if (undoing.current.has(checkId)) return;
    undoing.current.add(checkId);
    try {
      await batalOpnameCheck({ data: { id: checkId } });
      toast.success(`${nama}: pengecekan dibatalkan, stok dikembalikan.`);
      load();
      changed();
    } catch (e) {
      toast.error((e as Error).message || "Gagal membatalkan pengecekan.");
    } finally {
      undoing.current.delete(checkId);
    }
  }

  async function submit(item: Item, fisik: number) {
    if (busy.includes(item.id)) return;
    const unit = item.satuan;
    if (fisik === 0 && item.stok > 0) {
      const ok = await confirmDialog(
        `Tandai ${item.nama} habis? Stok ${fmt(item.stok)} ${unit} akan menjadi 0.`,
        { title: "Barang habis?", confirmText: "Ya, habis", danger: true },
      );
      if (!ok) return;
    } else if (Math.abs(fisik - item.stok) > BIG_DIFF) {
      const ok = await confirmDialog(
        `Stok ${item.nama} akan berubah dari ${fmt(item.stok)} menjadi ${fmt(fisik)} ${unit}. Apakah angkanya benar?`,
        { title: "Selisih besar", confirmText: "Ya, ubah stok" },
      );
      if (!ok) return;
    }
    setBusy((b) => [...b, item.id]);
    try {
      const res = await saveOpnameCheck({ data: { id: item.id, sistem: item.stok, fisik } });
      if (!res.ok) {
        toast.error(`Stok ${item.nama} di sistem sudah berubah menjadi ${fmt(res.current)} ${unit}. Angka sudah diperbarui, cek lagi.`);
      } else {
        const checkId = res.checkId;
        const undoAction = { label: "Batalkan", onClick: () => { void undo(checkId, item.nama); } };
        if (fisik === item.stok) {
          toast.success(`${item.nama}: cocok`, { duration: 8000, action: undoAction });
        } else {
          toast.success(`${item.nama}: stok ${fmt(item.stok)} → ${fmt(fisik)} ${unit}`, {
            description: "Stok di Daftar Sparepart sudah disesuaikan. Salah pencet? Tekan Batalkan.",
            duration: 8000,
            action: undoAction,
          });
        }
      }
      clearDraft(item.id);
      closeRedo(item.id);
      load();
      changed();
    } catch (e) {
      toast.error((e as Error).message || "Gagal menyimpan hasil cek.");
    } finally {
      setBusy((b) => b.filter((id) => id !== item.id));
    }
  }

  /** Jumlah fisik (dalam satuan dasar) dari isian; null kalau belum diisi atau tidak valid. */
  function fisikOf(item: Item): number | null {
    const raw = drafts[item.id] ?? "";
    if (!/^\d+$/.test(raw)) return null;
    const mult = hasAlt(item) && units[item.id] === "alt" ? item.isiSatuanAlt : 1;
    const total = Number(raw) * mult;
    return Number.isSafeInteger(total) && total <= MAX_STOK ? total : null;
  }

  function saveDraft(item: Item) {
    const raw = drafts[item.id] ?? "";
    if (!/^\d+$/.test(raw)) { toast.error("Isi stok fisik dengan angka bulat, 0 atau lebih."); return; }
    const fisik = fisikOf(item);
    if (fisik === null) { toast.error(`Angka terlalu besar. Maksimal ${fmt(MAX_STOK)} ${item.satuan}.`); return; }
    void submit(item, fisik);
  }

  async function startNewRound() {
    const scope = kategori.length ? kategori.join(", ") : "semua kategori";
    const ok = await confirmDialog(
      `Tanda sudah dicek untuk ${scope} akan dikosongkan, jadi semua barangnya kembali Belum dicek. Riwayat lama tetap tersimpan.`,
      { title: "Mulai putaran baru?", confirmText: "Ya, mulai baru" },
    );
    if (!ok) return;
    try {
      const res = await resetOpnameRound({ data: { kategori } });
      toast.success(`${res.reset} barang siap dicek ulang`);
      setRedo([]);
      setPage(1);
      load(1);
      changed();
    } catch (e) {
      toast.error((e as Error).message || "Gagal memulai putaran baru.");
    }
  }

  const items = data?.items ?? [];
  const counts = data?.counts;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const done = counts ? counts.total - counts.belum : 0;
  const pct = counts && counts.total ? Math.round((done / counts.total) * 100) : 0;
  const categories = (data?.categories ?? []).filter((c) => c.toLowerCase().includes(kategoriQ.trim().toLowerCase()));
  const hasKategori = (c: string) => kategori.some((v) => v.toLowerCase() === c.toLowerCase());
  const toggleKategori = (c: string) => {
    setPage(1);
    setKategori((prev) => (prev.some((v) => v.toLowerCase() === c.toLowerCase()) ? prev.filter((v) => v.toLowerCase() !== c.toLowerCase()) : [...prev, c]));
  };
  const multiKategori = kategori.length !== 1;

  const chips: { id: string; label: string; n: number | undefined; tone: string }[] = [
    { id: "", label: "Semua", n: counts?.total, tone: "text-slate-900" },
    { id: "belum", label: "Belum dicek", n: counts?.belum, tone: "text-slate-900" },
    { id: "cocok", label: "Cocok", n: counts?.cocok, tone: "text-emerald-700" },
    { id: "selisih", label: "Selisih", n: counts?.selisih, tone: "text-amber-700" },
    { id: "habis", label: "Habis", n: counts?.habis, tone: "text-red-700" },
  ];

  function emptyText() {
    if (!counts || counts.total === 0) return q || kategori.length ? "Tidak ada barang untuk filter ini." : "Belum ada barang.";
    if (status === "belum") return "Semua barang di filter ini sudah dicek. Pilih \"Mulai putaran baru\" kalau mau memeriksa ulang.";
    return "Tidak ada barang untuk filter ini.";
  }

  return (
    <Panel>
      <div ref={topRef} className="scroll-mt-20" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">Barang</h3>
        <button type="button" className={btnNeutral} onClick={() => void startNewRound()} title="Kosongkan tanda sudah dicek untuk kategori yang dipilih">
          <RotateCcw className="size-4" /> Mulai putaran baru
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_260px]">
        <input
          className={inputClass}
          placeholder="Cari nama, kode, part number, atau merek"
          value={q}
          onChange={(e) => { setPage(1); setQ(e.target.value); }}
        />
        <details ref={dropdown} className="relative">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <span className="truncate">
              {kategori.length === 0 ? "Semua Kategori" : kategori.length <= 2 ? kategori.join(", ") : `${kategori.length} kategori dipilih`}
            </span>
            <span className="shrink-0 text-slate-600">▾</span>
          </summary>
          <div className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
            <div className="space-y-2 border-b border-line p-3">
              <input
                className="h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-blue-500"
                placeholder="Cari nama kategori..."
                value={kategoriQ}
                onChange={(e) => setKategoriQ(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-left text-sm font-bold hover:bg-slate-50" onClick={() => { setPage(1); setKategori([]); setKategoriQ(""); }}>
                  ☑ Semua Kategori
                </button>
                {kategori.length > 0 ? (
                  <button type="button" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-danger hover:bg-red-100" onClick={() => { setPage(1); setKategori([]); }}>
                    Hapus
                  </button>
                ) : null}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {categories.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500">Tidak ada kategori cocok.</p> : null}
              {categories.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="size-4" checked={hasKategori(c)} onChange={() => toggleKategori(c)} />
                  <span className="truncate">{c}</span>
                </label>
              ))}
            </div>
            <div className="border-t border-line p-2">
              <button type="button" className={`${btnPrimary} w-full`} onClick={() => { if (dropdown.current) dropdown.current.open = false; }}>
                OK, terapkan
              </button>
            </div>
          </div>
        </details>
      </div>

      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Saring status">
        {chips.map((c) => (
          <button
            key={c.id || "semua"}
            type="button"
            role="tab"
            aria-selected={status === c.id}
            onClick={() => { setPage(1); setStatus(c.id); }}
            className={`btn-tight inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold ${status === c.id ? "border-blue-300 bg-blue-50 text-blue-900" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {c.label}
            <span className={`num font-bold ${c.tone}`}>{c.n === undefined ? "-" : fmt(c.n)}</span>
          </button>
        ))}
      </div>

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
          <span>{fmt(done)} dari {fmt(counts?.total ?? 0)} barang sudah dicek</span>
          <span className="num font-semibold">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}

      <div className={`mt-3 hidden border-b-2 border-slate-800 bg-slate-50 px-1 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 ${GRID}`}>
        <div className="pl-3">Barang</div>
        <div>Stok sistem</div>
        <div>Stok fisik</div>
        <div>Aksi</div>
      </div>

      <ul className="mt-3 md:mt-0">
        {data && items.length === 0 ? <li className="py-10 text-center text-sm text-slate-500">{emptyText()}</li> : null}
        {!data && !error ? <li className="py-10 text-center text-sm text-slate-500">Memuat daftar barang...</li> : null}
        {items.map((item) => {
          const open = item.dicekAt === null || redo.includes(item.id);
          const draft = drafts[item.id] ?? "";
          const isBusy = busy.includes(item.id);
          const hadChange = item.dicekAt !== null && item.selisih !== 0;
          const alt = hasAlt(item);
          const unit: UnitChoice = alt && units[item.id] === "alt" ? "alt" : "base";
          const fisik = fisikOf(item);
          const diff = fisik === null ? null : fisik - item.stok;
          const stok = stokText(item.stok, item);
          const tooBig = draft !== "" && /^\d+$/.test(draft) && fisik === null;
          return (
            <li key={item.id} className={`mb-2 rounded-xl border border-line border-l-4 px-3 py-3 md:mb-0 md:rounded-none md:border-b md:border-r-0 md:border-t-0 md:px-1 ${item.dicekAt ? (TONE[item.hasil] ?? "border-l-slate-300") : "border-l-transparent"} ${GRID}`}>
              <div className="md:pl-2">
                <ItemIdentityBlock item={item} showKategori={multiKategori} />
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 md:mt-0 md:block">
                <span className="text-[11px] font-semibold text-slate-500 md:hidden">Stok sistem</span>
                <div>
                  {hadChange ? <span className="mr-1 text-xs text-slate-400 line-through">{fmt(item.stok - item.selisih)}</span> : null}
                  <span className={`num text-base font-bold ${item.stok <= 0 ? "text-red-700" : "text-slate-900"}`}>{stok.utama}</span>
                  {stok.alt ? <div className="text-xs text-slate-500">= {stok.alt}</div> : null}
                </div>
                <div className="md:mt-1">
                  {item.dicekAt ? <HasilBadge hasil={item.hasil} selisih={item.selisih} /> : <span className="inline-block whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Belum dicek</span>}
                </div>
              </div>

              <div className="mt-2 md:mt-0">
                {open ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-center text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
                        inputMode="numeric"
                        placeholder="Jumlah fisik"
                        aria-label={`Stok fisik ${item.nama}`}
                        value={draft}
                        disabled={isBusy}
                        onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 9); setDrafts((d) => ({ ...d, [item.id]: v })); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && draft !== "") saveDraft(item); }}
                      />
                      {alt ? (
                        <div className="inline-flex shrink-0 rounded-xl bg-slate-100 p-1" role="group" aria-label={`Satuan hitung ${item.nama}`}>
                          {([["base", item.satuan], ["alt", item.satuanAlt]] as const).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={unit === id}
                              disabled={isBusy}
                              onClick={() => setUnits((u) => ({ ...u, [item.id]: id }))}
                              className={`btn-tight h-9 rounded-lg px-2.5 text-xs font-bold ${unit === id ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-600"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="shrink-0 text-sm font-semibold text-slate-600">{item.satuan}</span>
                      )}
                    </div>
                    {tooBig ? (
                      <p className="mt-1 text-xs font-medium text-danger">Angka terlalu besar (maksimal {fmt(MAX_STOK)} {item.satuan}).</p>
                    ) : fisik !== null && diff !== null ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {unit === "alt" ? <>= <b>{fmt(fisik)} {item.satuan}</b> · </> : null}
                        {diff === 0 ? <span className="font-semibold text-emerald-700">Sama dengan sistem</span> : <span className={`font-semibold ${diff < 0 ? "text-amber-700" : "text-blue-700"}`}>Selisih {diff > 0 ? "+" : "−"}{fmt(Math.abs(diff))} {item.satuan}</span>}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Sudah dicek</span>
                )}
              </div>

              <div className="mt-2 md:mt-0">
                {!open ? (
                  <div className="grid grid-cols-2 gap-2 md:flex">
                    <button type="button" className={btnNeutral} onClick={() => setRedo((r) => (r.includes(item.id) ? r : [...r, item.id]))}>
                      <RotateCcw className="size-4" /> Cek ulang
                    </button>
                    {item.checkId !== null ? (
                      <button type="button" className={btnNeutral} onClick={() => void undo(item.checkId as number, item.nama)}>
                        <Undo2 className="size-4" /> Batalkan
                      </button>
                    ) : null}
                  </div>
                ) : draft !== "" ? (
                  <div className="grid grid-cols-2 gap-2 md:flex">
                    <button type="button" className={btnPrimary} disabled={isBusy || fisik === null} onClick={() => saveDraft(item)}><Check className="size-4" /> Simpan</button>
                    <button type="button" className={btnNeutral} disabled={isBusy} onClick={() => clearDraft(item.id)}>Batal</button>
                  </div>
                ) : (
                  <div className={`grid gap-2 md:flex ${redo.includes(item.id) ? "grid-cols-3" : "grid-cols-2"}`}>
                    <button type="button" className={btnNeutral} disabled={isBusy} onClick={() => void submit(item, item.stok)}><Check className="size-4" /> Cocok</button>
                    <button type="button" className={btnNeutral} disabled={isBusy} onClick={() => void submit(item, 0)}><PackageX className="size-4" /> Habis</button>
                    {redo.includes(item.id) ? <button type="button" className={btnNeutral} onClick={() => closeRedo(item.id)}>Batal</button> : null}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{data ? `${fmt(data.total)} barang · Hal ${data.page} dari ${pages}` : ""}</span>
        <div className="flex gap-2">
          <button type="button" className={btnNeutral} disabled={page <= 1} onClick={() => goPage(page - 1)}>Sebelumnya</button>
          <button type="button" className={btnNeutral} disabled={page >= pages} onClick={() => goPage(page + 1)}>Berikutnya</button>
        </div>
      </div>
    </Panel>
  );
}
