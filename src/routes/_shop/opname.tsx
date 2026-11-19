import { createFileRoute } from "@tanstack/react-router";
import { Check, PackageX, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { usePersistedState } from "@/lib/persist";
import { inputClass, Panel } from "@/components/shop/shell";
import { HasilBadge, Metric } from "@/components/shop/opname-ui";
import { OpnameHistory } from "@/components/shop/opname-history";
import { OpnameSettings } from "@/components/shop/opname-settings";
import { listOpname, resetOpnameRound, saveOpnameCheck } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop/opname")({ component: OpnamePage });

type Tab = "cek" | "riwayat" | "pengaturan";
type OpnameData = Awaited<ReturnType<typeof listOpname>>;
type Item = OpnameData["items"][number];

/** Selisih lebih dari ini diminta konfirmasi dulu sebelum stok diubah. */
const BIG_DIFF = 10;

const TABS: { id: Tab; label: string }[] = [
  { id: "cek", label: "Cek" },
  { id: "riwayat", label: "Riwayat" },
  { id: "pengaturan", label: "Pengaturan" },
];

const STATUS = [
  { id: "", label: "Semua status" },
  { id: "belum", label: "Belum dicek" },
  { id: "sudah", label: "Sudah dicek" },
  { id: "selisih", label: "Ada selisih" },
];

const th = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2.5 align-middle";
const btnBase = "inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold disabled:opacity-50";
const btnNeutral = `${btnBase} border-line bg-white text-slate-800 hover:bg-slate-50`;
const btnPrimary = `${btnBase} border-accent bg-accent text-white hover:opacity-90`;

function OpnamePage() {
  const [tab, setTab] = usePersistedState<Tab>("opname:tab", "cek");
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-slate-600">
            Cek stok fisik barang. Kalau angkanya beda, stok di Daftar Sparepart langsung disesuaikan dan setiap pengecekan tercatat di Riwayat.
          </p>
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`h-9 rounded-lg px-4 text-sm font-semibold ${tab === t.id ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-600 hover:text-slate-900"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      {tab === "cek" ? <OpnameCek /> : tab === "riwayat" ? <OpnameHistory /> : <OpnameSettings />}
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
  const [redo, setRedo] = useState<number[]>([]);
  const [busy, setBusy] = useState<number[]>([]);
  const loadSeq = useRef(0);
  const dropdown = useRef<HTMLDetailsElement>(null);

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

  const clearDraft = (id: number) => setDrafts((d) => { const next = { ...d }; delete next[id]; return next; });
  const closeRedo = (id: number) => setRedo((r) => r.filter((v) => v !== id));

  async function submit(item: Item, fisik: number) {
    if (busy.includes(item.id)) return;
    if (Math.abs(fisik - item.stok) > BIG_DIFF) {
      const ok = await confirmDialog(
        `Stok ${item.nama} akan berubah dari ${item.stok} menjadi ${fisik}. Apakah angkanya benar?`,
        { title: "Selisih besar", confirmText: "Ya, ubah stok" },
      );
      if (!ok) return;
    }
    setBusy((b) => [...b, item.id]);
    try {
      const res = await saveOpnameCheck({ data: { id: item.id, sistem: item.stok, fisik } });
      if (!res.ok) {
        toast.error(`Stok ${item.nama} di sistem sudah berubah menjadi ${res.current}. Angka sudah diperbarui, cek lagi.`);
      } else if (fisik === item.stok) {
        toast.success(`${item.nama}: cocok`);
      } else {
        toast.success(`${item.nama}: stok ${item.stok} → ${fisik}`, { description: "Stok di Daftar Sparepart sudah disesuaikan." });
      }
      clearDraft(item.id);
      closeRedo(item.id);
      load();
      window.dispatchEvent(new Event("mjs-opname-changed"));
    } catch (e) {
      toast.error((e as Error).message || "Gagal menyimpan hasil cek.");
    } finally {
      setBusy((b) => b.filter((id) => id !== item.id));
    }
  }

  function saveDraft(item: Item) {
    const raw = drafts[item.id] ?? "";
    if (!/^\d+$/.test(raw)) { toast.error("Isi stok fisik dengan angka bulat, 0 atau lebih."); return; }
    void submit(item, Number(raw));
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
      window.dispatchEvent(new Event("mjs-opname-changed"));
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

  function emptyText() {
    if (!counts || counts.total === 0) return q || kategori.length ? "Tidak ada barang untuk filter ini." : "Belum ada barang.";
    if (status === "belum") return "Semua barang di filter ini sudah dicek. Pilih \"Mulai putaran baru\" kalau mau memeriksa ulang.";
    return "Tidak ada barang untuk filter ini.";
  }

  return (
    <>
      <Panel>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            className={inputClass}
            placeholder="Cari nama, part number, atau merek"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
          <details ref={dropdown} className="relative min-w-[240px]">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-sm">
              <span className="truncate">
                {kategori.length === 0 ? "Semua Kategori" : kategori.length <= 2 ? kategori.join(", ") : `${kategori.length} kategori dipilih`}
              </span>
              <span className="shrink-0 text-slate-600">▾</span>
            </summary>
            <div className="absolute left-0 top-12 z-20 w-full min-w-[300px] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
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
                  <label key={c} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
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
          <select className={`${inputClass} md:w-44`} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button type="button" className="inline-flex h-11 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-line bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => void startNewRound()} title="Kosongkan tanda sudah dicek untuk kategori yang dipilih">
            <RotateCcw className="size-4" /> Mulai putaran baru
          </button>
        </div>
      </Panel>

      <Panel>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="Belum dicek" value={counts?.belum ?? 0} />
          <Metric label="Cocok" value={counts?.cocok ?? 0} tone="text-emerald-700" />
          <Metric label="Selisih" value={counts?.selisih ?? 0} tone="text-amber-700" />
          <Metric label="Habis" value={counts?.habis ?? 0} tone="text-red-700" />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
            <span>{done} dari {counts?.total ?? 0} barang sudah dicek</span>
            <span className="num font-semibold">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className={th}>Barang</th>
                <th className={`${th} text-center`}>Stok sistem</th>
                <th className={`${th} text-center`}>Stok fisik</th>
                <th className={`${th} text-center`}>Status</th>
                <th className={th}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data && items.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-slate-500">{emptyText()}</td></tr> : null}
              {!data && !error ? <tr><td colSpan={5} className="py-10 text-center text-slate-500">Memuat daftar barang...</td></tr> : null}
              {items.map((item) => {
                const open = item.dicekAt === null || redo.includes(item.id);
                const draft = drafts[item.id] ?? "";
                const isBusy = busy.includes(item.id);
                const changed = item.dicekAt !== null && item.selisih !== 0;
                return (
                  <tr key={item.id} className="border-t border-line">
                    <td className={td}>
                      <div className="font-semibold leading-snug text-slate-900">{item.nama}</div>
                      {item.merek ? (
                        <div className="mt-0.5"><span className="inline-block rounded bg-blue-100 px-1.5 py-px text-[11px] font-bold text-blue-800">{item.merek}</span></div>
                      ) : null}
                      <div className="mt-0.5 font-mono text-xs text-slate-500">{item.partNumber || item.kode || "-"}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-center`}>
                      {changed ? <span className="mr-1 text-xs text-slate-400 line-through">{item.stok - item.selisih}</span> : null}
                      <span className={`num font-bold ${item.stok <= 0 ? "text-red-700" : "text-slate-900"}`}>{item.stok} {item.satuan}</span>
                    </td>
                    <td className={`${td} text-center`}>
                      {open ? (
                        <input
                          className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
                          inputMode="numeric"
                          placeholder="isi jika beda"
                          aria-label={`Stok fisik ${item.nama}`}
                          value={draft}
                          disabled={isBusy}
                          onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setDrafts((d) => ({ ...d, [item.id]: v })); }}
                          onKeyDown={(e) => { if (e.key === "Enter" && draft !== "") saveDraft(item); }}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className={`${td} text-center`}>
                      {item.dicekAt ? <HasilBadge hasil={item.hasil} selisih={item.selisih} /> : <span className="inline-block whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Belum dicek</span>}
                    </td>
                    <td className={td}>
                      {!open ? (
                        <button type="button" className={btnNeutral} onClick={() => setRedo((r) => [...r, item.id])}>
                          <RotateCcw className="size-4" /> Cek ulang
                        </button>
                      ) : draft !== "" ? (
                        <div className="flex gap-1.5">
                          <button type="button" className={btnPrimary} disabled={isBusy} onClick={() => saveDraft(item)}><Check className="size-4" /> Simpan</button>
                          <button type="button" className={btnNeutral} disabled={isBusy} onClick={() => clearDraft(item.id)}>Batal</button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <button type="button" className={btnNeutral} disabled={isBusy} onClick={() => void submit(item, item.stok)}><Check className="size-4" /> Cocok</button>
                          <button type="button" className={btnNeutral} disabled={isBusy} onClick={() => void submit(item, 0)}><PackageX className="size-4" /> Habis</button>
                          {redo.includes(item.id) ? <button type="button" className={btnNeutral} onClick={() => closeRedo(item.id)}>Batal</button> : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>{data ? `${data.total} barang · Hal ${data.page} dari ${pages}` : ""}</span>
          <div className="flex gap-2">
            <button type="button" className={btnNeutral} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Sebelumnya</button>
            <button type="button" className={btnNeutral} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
          </div>
        </div>
      </Panel>
    </>
  );
}
