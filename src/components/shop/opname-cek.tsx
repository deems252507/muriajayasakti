import { AlertTriangle, ArrowLeft, Check, CheckCircle2, History, Info, Minus, PackageX, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { usePersistedState } from "@/lib/persist";
import { opnameDraftConfirm, opnameDraftDelete, opnameDraftSave, opnameGetItem, opnameNext, opnameReset, opnameSave, opnameSettings } from "@/lib/shop/api";
import type { OpnameDraftEntry, OpnameItem, OpnameLog, OpnameSaveResult } from "@/lib/shop/types";
import {
  HASIL_LABEL,
  draftEntryText,
  umurHari,
  HasilBadge,
  ItemTitle,
  MetaLine,
  StatusBadge,
  TONE,
  dusText,
  hasilTone,
  hitungHasil,
  itemTone,
  newToken,
  selisihClass,
  selisihText,
  waktuText,
} from "@/components/shop/opname-ui";

type Recent = {
  id: number;
  stokSebelum: number;
  stokFisik: number;
  selisih: number;
  stokSesudah: number;
  hasil: OpnameLog["hasil"];
  catatan: string;
  petugas: string;
  dicekPada: string;
};

type Loaded = {
  item: OpnameItem;
  openedAt: string;
  expected: number;
  recent: Recent[];
  drafts: OpnameDraftEntry[];
  draftMutasi: { n: number; net: number };
  lokasiList: string[];
};
type Done = Extract<OpnameSaveResult, { ok: true }>;
type Conflict = Extract<OpnameSaveResult, { ok: false }>;

const MAX_FISIK = 999_999_999;

export function OpnameCek({
  productId,
  canSave,
  ctx,
  onBack,
  onOpen,
  onHistory,
  onSaved,
}: {
  productId: number;
  /** Hanya Admin yang boleh menyimpan; Owner hanya melihat. */
  canSave: boolean;
  /** Filter daftar yang sedang dipakai (dipakai tombol "Lanjut ke Barang Berikutnya"). */
  ctx: { q: string; kategori: string[]; filter: string };
  onBack: () => void;
  onOpen: (id: number) => void;
  onHistory: (id: number) => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [fisikText, setFisikText] = useState("");
  const [unit, setUnit] = useState<"base" | "alt">("base");
  const [catatan, setCatatan] = useState("");
  const [lokasi, setLokasi] = usePersistedState("opname:lokasi", "");
  const [draftBusy, setDraftBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const savingRef = useRef(false);
  const attempt = useRef<{ key: string; token: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchItem(): Promise<Loaded> {
    const res = await opnameGetItem({ data: { productId } });
    return { item: res.item, openedAt: res.openedAt, expected: res.item.stok, recent: res.recent, drafts: res.drafts, draftMutasi: res.draftMutasi, lokasiList: res.lokasiList };
  }

  async function tandaiUlang() {
    if (!data) return;
    if (!(await confirmDialog(`Tandai "${data.item.nama}" perlu dicek ulang? Hanya status yang berubah. Stok dan riwayat pemeriksaan tidak diubah.`, { title: "Tandai cek ulang", confirmText: "Ya, tandai" }))) return;
    try {
      await opnameReset({ data: { mode: "barang", productId } });
      setData(await fetchItem());
      onSaved();
      toast.success("Barang ditandai perlu cek ulang.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    setDone(null);
    setConflict(null);
    setFisikText("");
    setUnit("base");
    setCatatan("");
    attempt.current = null;
    savingRef.current = false;
    setSaving(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    void Promise.all([fetchItem(), opnameSettings()])
      .then(([loaded, settings]) => {
        if (!alive) return;
        setData(loaded);
        setAutoSync(settings.autoSync);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || "Gagal memuat barang.");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const ready = Boolean(data) && canSave && !done;
  useEffect(() => {
    if (ready) inputRef.current?.focus({ preventScroll: true });
  }, [ready, data?.item.id]);

  const item = data?.item ?? null;
  const expected = data?.expected ?? 0;
  const satuan = item?.satuan || "Pcs";
  // Satuan pemeriksaan: satuan dasar (mis. Pcs) atau satuan alternatif dari Master Data (mis. Dus, isi N satuan dasar).
  const hasAlt = Boolean(item && item.satuanAlt && item.isiSatuanAlt > 0);
  const factor = unit === "alt" && item && hasAlt ? item.isiSatuanAlt : 1;
  const unitName = unit === "alt" && item && hasAlt ? item.satuanAlt : satuan;
  const qty = fisikText === "" ? null : Number(fisikText);
  const fisik = qty == null ? null : qty * factor; // selalu dalam satuan dasar; inilah yang disimpan
  const maxQty = Math.floor(MAX_FISIK / factor);
  const selisih = fisik == null ? null : fisik - expected;
  const preview = fisik == null ? null : hitungHasil(expected, fisik);

  function bump(delta: number) {
    if (fisikText === "" && delta < 0) return;
    const current = fisikText === "" ? 0 : Number(fisikText);
    setFisikText(String(Math.max(0, Math.min(maxQty, current + delta))));
  }

  function pickUnit(next: "base" | "alt") {
    if (next === unit) return;
    setUnit(next);
    setFisikText(""); // angka lama beda satuan: isi ulang supaya tidak salah hitung
  }

  async function save() {
    if (!data || !item || !canSave || savingRef.current) return;
    if (fisik == null) {
      toast.error("Isi jumlah fisik terlebih dahulu.");
      inputRef.current?.focus();
      return;
    }
    const hasil = hitungHasil(expected, fisik);
    if (hasil !== "SESUAI" && autoSync) {
      const ok = await confirmDialog(`Jumlah di sistem akan disesuaikan dari ${expected} menjadi ${fisik} ${satuan}. Simpan hasil pemeriksaan ini?`, {
        title: "Simpan pemeriksaan?",
        confirmText: "Ya, simpan",
      });
      if (!ok) return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // Token tetap sama untuk data yang sama (klik ganda / kirim ulang tidak menyesuaikan stok dua kali),
    // dan berganti kalau angkanya berubah.
    const key = `${item.id}|${expected}|${fisik}|${catatan.trim()}`;
    if (attempt.current?.key !== key) attempt.current = { key, token: newToken() };
    try {
      const res = await opnameSave({
        data: { productId: item.id, fisik, catatan: catatan.trim(), token: attempt.current.token, openedAt: data.openedAt, expectedStok: expected },
      });
      if (res.ok) {
        setDone(res);
        setConflict(null);
        attempt.current = null;
        onSaved();
        toast.success("Pemeriksaan tersimpan", { description: item.nama });
      } else {
        // Stok berubah sejak halaman dibuka: tidak ada yang ditulis. Muat stok terbaru dan minta petugas menghitung ulang.
        setConflict(res);
        attempt.current = null;
        try {
          setData(await fetchItem());
        } catch {
          /* tampilan lama tetap dipakai; petugas bisa muat ulang */
        }
        toast.warning("Jumlah di sistem berubah. Hitung ulang lalu simpan lagi.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pemeriksaan gagal disimpan.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const draftTotal = data ? data.drafts.reduce((sum, d) => sum + d.jumlah, 0) : 0;

  async function saveDraft() {
    if (!data || !item || !canSave || draftBusy || savingRef.current) return;
    if (!lokasi.trim()) {
      toast.error("Isi lokasi hitungan, misalnya Gudang atau Toko.");
      return;
    }
    if (qty == null) {
      toast.error("Isi jumlah fisik terlebih dahulu.");
      inputRef.current?.focus();
      return;
    }
    setDraftBusy(true);
    try {
      await opnameDraftSave({ data: { productId: item.id, lokasi: lokasi.trim(), qty, unit, catatan: catatan.trim() } });
      toast.success(`Hitungan ${lokasi.trim()} disimpan sementara`, { description: "Stok sistem belum berubah." });
      setFisikText("");
      setCatatan("");
      setConflict(null);
      setData(await fetchItem());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hitungan sementara gagal disimpan.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function removeDraft(entry: OpnameDraftEntry) {
    if (!entry.id || draftBusy) return;
    const ok = await confirmDialog(`Hapus hitungan ${entry.lokasi} (${entry.qty} ${entry.satuan})? Stok sistem tidak berubah.`, { title: "Hapus hitungan sementara?", confirmText: "Hapus" });
    if (!ok) return;
    setDraftBusy(true);
    try {
      await opnameDraftDelete({ data: { draftId: entry.id } });
      setData(await fetchItem());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus hitungan.");
    } finally {
      setDraftBusy(false);
    }
  }

  function editDraft(entry: OpnameDraftEntry) {
    setLokasi(entry.lokasi);
    setUnit(hasAlt && item && entry.satuan === item.satuanAlt ? "alt" : "base");
    setFisikText(String(entry.qty));
    inputRef.current?.focus();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Konfirmasi total semua lokasi: stok sistem baru berubah di sini. */
  async function confirmTotal(force = false): Promise<void> {
    if (!data || !item || !canSave || savingRef.current || data.drafts.length === 0) return;
    const hasil = hitungHasil(expected, draftTotal);
    if (!force && hasil !== "SESUAI" && autoSync) {
      const ok = await confirmDialog(`Total semua lokasi ${draftTotal} ${satuan}. Jumlah di sistem akan disesuaikan dari ${expected} menjadi ${draftTotal} ${satuan}. Konfirmasi?`, {
        title: "Konfirmasi total?",
        confirmText: "Ya, konfirmasi",
      });
      if (!ok) return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const key = `${item.id}|${expected}|draft|${data.drafts.map((d) => `${d.id}:${d.jumlah}`).join(",")}|${catatan.trim()}`;
    if (attempt.current?.key !== key) attempt.current = { key, token: newToken() };
    let retryForce = false;
    try {
      const res = await opnameDraftConfirm({
        data: { items: [{ productId: item.id, expectedStok: expected, token: attempt.current.token }], force, catatan: catatan.trim(), openedAt: data.openedAt },
      });
      const entry = res.items[0];
      if (!entry || entry.error || !entry.r) {
        toast.error(entry?.error || "Konfirmasi gagal. Coba lagi.");
      } else if (entry.r.ok) {
        setDone(entry.r);
        setConflict(null);
        attempt.current = null;
        onSaved();
        toast.success("Total hitungan dikonfirmasi", { description: item.nama });
      } else if ("peringatan" in entry.r) {
        const w = entry.r;
        const ok = await confirmDialog(
          `Sejak hitungan pertama ada ${w.jumlahMutasi} perubahan stok (total ${selisihText(w.netMutasi)} ${satuan}), misalnya penjualan. Total hitungan mungkin sudah tidak pas dengan keadaan sekarang. Tetap konfirmasi total ${w.total} ${satuan}?`,
          { title: "Stok berubah saat dihitung", confirmText: "Tetap konfirmasi" },
        );
        retryForce = ok;
      } else {
        setConflict(entry.r);
        attempt.current = null;
        try {
          setData(await fetchItem());
        } catch {
          /* tampilan lama tetap dipakai */
        }
        toast.warning("Jumlah di sistem berubah. Periksa lagi, lalu konfirmasi ulang.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konfirmasi gagal. Coba lagi.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (retryForce) await confirmTotal(true);
  }

  async function next() {
    if (moving) return;
    setMoving(true);
    try {
      const res = await opnameNext({ data: { productId, q: ctx.q, kategori: ctx.kategori, filter: ctx.filter } });
      if (!res.nextId || res.sisa === 0) {
        toast.success("Semua barang pada daftar ini sudah dicek.");
        onBack();
      } else {
        onOpen(res.nextId);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuka barang berikutnya.");
    } finally {
      setMoving(false);
    }
  }

  async function recheck() {
    setDone(null);
    setConflict(null);
    setFisikText("");
    setUnit("base");
    setCatatan("");
    try {
      setData(await fetchItem());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat barang.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" aria-label="Kembali ke daftar" onClick={onBack} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-slate-700 active:scale-95">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Stok Opname</p>
          <h2 className="truncate text-lg font-extrabold leading-tight">Cek Barang</h2>
        </div>
        {item ? (
          <button type="button" aria-label="Lihat riwayat barang ini" onClick={() => onHistory(item.id)} className="ml-auto inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-xs font-bold text-slate-700">
            <History className="size-4" /> Riwayat
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          <button type="button" className="mt-2 bg-white text-slate-800" onClick={onBack}>Kembali ke daftar</button>
        </div>
      ) : null}

      {!data && !error ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-36 animate-pulse rounded-2xl bg-white/70" />
          <div className="h-44 animate-pulse rounded-2xl bg-white/70" />
        </div>
      ) : null}

      {data && item ? (
        <div className="space-y-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <ItemTitle item={item} className="text-base" />
                <div className="mt-2 space-y-0.5">
                  <MetaLine label="Kategori" value={item.kategori} />
                  <MetaLine label="Part Number" value={item.partNumber || item.kode} mono />
                  <MetaLine label="Part Number Alt" value={item.partNumbersAlt} mono />
                </div>
              </div>
              <div className="shrink-0 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Stok Sistem</p>
                <p className="num text-2xl font-extrabold leading-tight text-slate-900">{expected.toLocaleString("id-ID")}</p>
                <p className="text-xs font-semibold text-slate-600">{satuan}</p>
                {dusText(item, expected) ? <p className="mt-0.5 text-[11px] font-medium text-blue-700">= {dusText(item, expected)}</p> : null}
              </div>
            </div>
          </section>

          <section className={`rounded-xl border p-3 text-sm ${TONE[itemTone(item)].panel}`}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={item.statusCek} />
              {item.hasil ? <HasilBadge hasil={item.hasil} stale={item.statusCek === "PERLU_CEK_ULANG"} /> : null}
            </div>
            {item.dicekPada ? (
              <p className="mt-1.5 text-xs leading-5">
                Terakhir dicek {waktuText(item.dicekPada)}{item.petugas ? ` oleh ${item.petugas}` : ""}. Sistem {item.stokSebelum} · Fisik {item.stokFisik} · Selisih {selisihText(item.selisih)}.
                {item.statusCek === "PERLU_CEK_ULANG"
                  ? item.resetPada
                    ? ` Ditandai perlu cek ulang${item.resetOleh ? ` oleh ${item.resetOleh}` : ""} (${waktuText(item.resetPada)}), jadi barang ini perlu dicek ulang.`
                    : ` Jumlah di sistem berubah setelah pemeriksaan itu (sekarang ${item.stok} ${satuan}), jadi barang ini perlu dicek ulang.`
                  : ""}
                {item.catatan ? ` Catatan: ${item.catatan}` : ""}
              </p>
            ) : (
              <p className="mt-1.5 text-xs leading-5">Barang ini belum pernah diperiksa.</p>
            )}
            {canSave && item.statusCek === "SUDAH_DICEK" ? (
              <button
                type="button"
                onClick={() => void tandaiUlang()}
                className="mt-2 inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800"
              >
                Tandai perlu cek ulang
              </button>
            ) : null}
          </section>

          {conflict ? (
            <section className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900" role="alert">
              <p className="flex items-center gap-2 font-extrabold"><AlertTriangle className="size-4 shrink-0" /> Jumlah di sistem berubah</p>
              <p className="mt-1 text-xs leading-5">
                Saat Anda memeriksa, jumlah di sistem berubah dari {conflict.stokDilihat} menjadi {conflict.stokTerbaru} {satuan}
                {conflict.jumlahMutasi > 0 ? ` (${conflict.jumlahMutasi} perubahan stok, total ${selisihText(conflict.netMutasi)})` : ""}.
                Belum ada yang disimpan. Hitung ulang barangnya, pastikan angka fisik benar, lalu simpan lagi.
              </p>
            </section>
          ) : null}

          {!done && data.drafts.length > 0 ? (
            <DraftPanel
              drafts={data.drafts}
              satuan={satuan}
              expected={expected}
              total={draftTotal}
              mutasi={data.draftMutasi}
              canSave={canSave}
              busy={draftBusy || saving}
              item={item}
              onEdit={editDraft}
              onRemove={(e) => void removeDraft(e)}
            />
          ) : null}

          {done ? (
            <>
              <section className={`rounded-2xl border p-4 ${TONE[hasilTone(done.hasil)].panel}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-7 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-base font-extrabold leading-tight">{done.duplikat ? "Pemeriksaan ini sudah tersimpan" : "Pemeriksaan tersimpan"}</p>
                    <p className="text-xs">{HASIL_LABEL[done.hasil]}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Trio label="Stok Sistem" value={`${done.stokSebelum}`} unit={satuan} />
                  <Trio label="Stok Fisik" value={`${done.stokFisik}`} unit={satuan} />
                  <Trio label="Selisih" value={selisihText(done.selisih)} unit={satuan} valueClass={selisihClass(done.selisih)} />
                </div>
                <dl className="mt-3 divide-y divide-black/5 text-xs">
                  <Row label="Jumlah di sistem sekarang" value={`${done.stokSesudah} ${satuan}${done.disesuaikan ? " (sudah disesuaikan)" : done.selisih !== 0 ? " (tidak diubah)" : ""}`} />
                  <Row label="Tanggal dan jam" value={waktuText(done.dicekPada)} />
                  <Row label="Petugas" value={done.petugas || "-"} />
                  {done.rincian?.length ? <Row label="Rincian lokasi" value={done.rincian.map(draftEntryText).join(" + ")} /> : null}
                </dl>
              </section>
              <div className="sticky bottom-0 z-10 -mx-3 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:-mx-6 md:px-6">
                <div className="mx-auto flex max-w-xl flex-col gap-2">
                  <button type="button" aria-label="Lanjut ke barang berikutnya" disabled={moving} onClick={() => void next()} className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-extrabold text-white shadow-sm disabled:opacity-60">
                    {moving ? "Membuka..." : "Lanjut ke Barang Berikutnya"}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-label="Periksa ulang barang ini" onClick={() => void recheck()} className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800">
                      <RefreshCw className="size-4" /> Periksa Lagi
                    </button>
                    <button type="button" aria-label="Kembali ke daftar" onClick={onBack} className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800">
                      Kembali ke Daftar
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : canSave ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label htmlFor="opname-lokasi" className="text-sm font-extrabold text-slate-900">Lokasi hitungan <span className="font-medium text-slate-500">(opsional)</span></label>
                <input
                  id="opname-lokasi"
                  list="opname-lokasi-list"
                  value={lokasi}
                  maxLength={40}
                  disabled={saving || draftBusy}
                  onChange={(e) => setLokasi(e.target.value)}
                  placeholder="Contoh: Gudang, Toko"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                />
                <datalist id="opname-lokasi-list">
                  {data.lokasiList.map((l) => <option key={l} value={l} />)}
                </datalist>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">Barang ada di beberapa tempat? Isi lokasi lalu pilih “Simpan Hitungan Sementara”. Stok sistem baru berubah saat Anda konfirmasi total.</p>
                <label htmlFor="opname-fisik" className="mt-3 block text-sm font-extrabold text-slate-900">Masukkan Jumlah Fisik</label>
                {hasAlt ? (
                  <div role="group" aria-label="Satuan pemeriksaan" className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                    <button type="button" aria-label={`Hitung dalam ${satuan}`} aria-pressed={unit === "base"} disabled={saving} onClick={() => pickUnit("base")} className={`h-11 rounded-lg text-sm font-bold ${unit === "base" ? "bg-white text-accent shadow-sm" : "text-slate-600"}`}>
                      {satuan}
                    </button>
                    <button type="button" aria-label={`Hitung dalam ${item.satuanAlt}`} aria-pressed={unit === "alt"} disabled={saving} onClick={() => pickUnit("alt")} className={`h-11 rounded-lg text-sm font-bold ${unit === "alt" ? "bg-white text-accent shadow-sm" : "text-slate-600"}`}>
                      {item.satuanAlt} <span className="font-medium opacity-70">(isi {item.isiSatuanAlt} {satuan})</span>
                    </button>
                  </div>
                ) : null}
                <div className="mt-2 flex items-stretch gap-2">
                  <button type="button" aria-label="Kurangi satu" onClick={() => bump(-1)} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent text-white active:scale-95 disabled:opacity-40" disabled={saving}>
                    <Minus className="size-6" />
                  </button>
                  <div className="relative min-w-0 flex-1">
                    <input
                      id="opname-fisik"
                      ref={inputRef}
                      value={fisikText}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      enterKeyHint="done"
                      placeholder="0"
                      disabled={saving}
                      onChange={(e) => setFisikText(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-14 w-full rounded-xl border-2 border-slate-200 bg-white pl-3 pr-14 text-center text-3xl font-extrabold text-slate-900 outline-none focus:border-accent focus:ring-4 focus:ring-blue-100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 max-w-12 -translate-y-1/2 truncate text-sm font-bold text-slate-500">{unitName}</span>
                  </div>
                  <button type="button" aria-label="Tambah satu" onClick={() => bump(1)} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent text-white active:scale-95 disabled:opacity-40" disabled={saving}>
                    <Plus className="size-6" />
                  </button>
                </div>
                <button type="button" aria-label="Isi sama dengan stok sistem" disabled={saving} onClick={() => { setUnit("base"); setFisikText(String(Math.max(0, expected))); }} className="mt-2 h-11 w-full rounded-xl bg-blue-50 text-xs font-bold text-accent active:scale-[.99]">
                  Jumlah fisik sama dengan stok sistem ({Math.max(0, expected)} {satuan})
                </button>
                {fisik != null && unit === "alt" ? <p className="mt-2 text-center text-xs font-semibold text-blue-700">{qty} {unitName} = {fisik.toLocaleString("id-ID")} {satuan}</p> : null}
                {fisik != null && unit === "base" && dusText(item, fisik) ? <p className="mt-2 text-center text-xs font-medium text-blue-700">{fisik} {satuan} = {dusText(item, fisik)}</p> : null}

                {preview && data.drafts.length === 0 ? (
                  <div className={`mt-3 flex items-start gap-2 rounded-xl border p-3 ${TONE[hasilTone(preview)].panel}`} aria-live="polite">
                    {preview === "SESUAI" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : preview === "FISIK_HABIS" ? <PackageX className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
                    <div className="min-w-0 text-sm">
                      <p className="font-extrabold">{preview === "SESUAI" ? "Sesuai dengan stok sistem" : HASIL_LABEL[preview]}</p>
                      <p className="text-xs leading-5">{hasilPesan(preview, expected, fisik ?? 0, satuan, autoSync)}</p>
                    </div>
                  </div>
                ) : data.drafts.length > 0 ? null : (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <Info className="mt-0.5 size-4 shrink-0" /> Isi jumlah fisik untuk melihat hasilnya.
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label htmlFor="opname-catatan" className="text-sm font-extrabold text-slate-900">Catatan <span className="font-medium text-slate-500">(opsional)</span></label>
                <textarea
                  id="opname-catatan"
                  rows={2}
                  maxLength={500}
                  value={catatan}
                  disabled={saving}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Contoh: di rak A1, kemasan penyok"
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
                />
              </section>

              {data.drafts.length === 0 ? (
                <section className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                  <Trio label="Stok Sistem" value={`${expected}`} unit={satuan} />
                  <Trio label="Stok Fisik" value={fisik == null ? "-" : `${fisik}`} unit={fisik == null ? "" : satuan} />
                  <Trio label="Selisih" value={selisihText(selisih)} unit={selisih == null ? "" : satuan} valueClass={selisihClass(selisih)} />
                </section>
              ) : null}

              <RecentList rows={data.recent} satuan={satuan} />

              <div className="sticky bottom-0 z-10 -mx-3 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:-mx-6 md:px-6">
                <div className="mx-auto max-w-xl">
                  {data.drafts.length > 0 ? (
                    <button type="button" aria-label="Konfirmasi total semua lokasi" disabled={saving || draftBusy} onClick={() => void confirmTotal()} className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-extrabold text-white shadow-sm active:scale-[.99] disabled:opacity-50">
                      <Check className="size-5" /> {saving ? "Menyimpan..." : `Konfirmasi Total (${draftTotal.toLocaleString("id-ID")} ${satuan})`}
                    </button>
                  ) : (
                    <button type="button" aria-label="Simpan pemeriksaan" disabled={saving || draftBusy || fisik == null} onClick={() => void save()} className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-extrabold text-white shadow-sm active:scale-[.99] disabled:opacity-50">
                      <Check className="size-5" /> {saving ? "Menyimpan..." : "Simpan Pemeriksaan"}
                    </button>
                  )}
                  <button type="button" aria-label="Simpan hitungan sementara" disabled={saving || draftBusy || fisik == null || !lokasi.trim()} onClick={() => void saveDraft()} className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-xl border border-violet-300 bg-violet-50 text-sm font-extrabold text-violet-900 disabled:opacity-50">
                    {draftBusy ? "Menyimpan..." : "Simpan Hitungan Sementara"}
                  </button>
                  <p className="mt-1.5 text-center text-[11px] text-slate-500">
                    {data.drafts.length > 0
                      ? "Hitungan sementara belum mengubah stok. Stok sistem berubah saat Konfirmasi Total."
                      : autoSync
                        ? "Setelah disimpan, status menjadi Sudah Dicek dan jumlah di sistem disesuaikan."
                        : "Setelah disimpan, status menjadi Sudah Dicek. Jumlah di sistem tidak diubah."}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <Info className="mr-1 inline size-4 align-text-bottom" /> Akun ini hanya dapat melihat hasil pemeriksaan. Pemeriksaan disimpan oleh Admin.
              </section>
              <RecentList rows={data.recent} satuan={satuan} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function hasilPesan(hasil: OpnameLog["hasil"], sistem: number, fisik: number, satuan: string, autoSync: boolean) {
  const sync = autoSync ? ` Jumlah di sistem akan disesuaikan menjadi ${fisik} ${satuan}.` : " Jumlah di sistem tidak diubah.";
  switch (hasil) {
    case "SESUAI":
      return "Jumlah fisik sama dengan stok sistem. Tidak ada penyesuaian.";
    case "FISIK_HABIS":
      return `Barang tidak ada di fisik, padahal stok sistem ${sistem} ${satuan}.${sync}`;
    case "STOK_SISTEM_0":
      return `Stok sistem ${sistem <= 0 ? "0" : sistem}, tetapi di fisik masih ada ${fisik} ${satuan}.${sync}`;
    default: {
      const beda = Math.abs(fisik - sistem);
      return `Fisik ${beda} ${satuan} ${fisik > sistem ? "lebih banyak" : "lebih sedikit"} dari stok sistem.${sync}`;
    }
  }
}

function Trio({ label, value, unit, valueClass = "text-slate-900" }: { label: string; value: string; unit?: string; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/70 px-1 py-2 ring-1 ring-black/5">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`num truncate text-xl font-extrabold leading-tight ${valueClass}`}>{value}</p>
      {unit ? <p className="truncate text-[10px] font-medium text-slate-500">{unit}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

function RecentList({ rows, satuan }: { rows: Recent[]; satuan: string }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-extrabold text-slate-900">Pemeriksaan sebelumnya</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.id} className="py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{waktuText(row.dicekPada)}</span>
              <HasilBadge hasil={row.hasil} />
            </div>
            <p className="mt-0.5 text-slate-600">
              Sistem {row.stokSebelum} · Fisik {row.stokFisik} · Selisih <b className={selisihClass(row.selisih)}>{selisihText(row.selisih)}</b> {satuan} · oleh {row.petugas || "-"}
            </p>
            {row.catatan ? <p className="text-slate-500">Catatan: {row.catatan}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DraftPanel({
  drafts,
  satuan,
  expected,
  total,
  mutasi,
  canSave,
  busy,
  item,
  onEdit,
  onRemove,
}: {
  drafts: OpnameDraftEntry[];
  satuan: string;
  expected: number;
  total: number;
  mutasi: { n: number; net: number };
  canSave: boolean;
  busy: boolean;
  item: OpnameItem;
  onEdit: (e: OpnameDraftEntry) => void;
  onRemove: (e: OpnameDraftEntry) => void;
}) {
  const hasil = hitungHasil(expected, total);
  const tone = TONE[hasilTone(hasil)];
  const tertua = drafts.map((d) => d.diubah).filter(Boolean).sort()[0] ?? null;
  const umur = umurHari(tertua);
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
      <p className="text-sm font-extrabold text-violet-900">Hitungan Sementara</p>
      <p className="text-[11px] text-violet-800">Belum mengubah stok sistem. Stok berubah saat Konfirmasi Total.</p>
      <ul className="mt-2 divide-y divide-violet-100 rounded-xl bg-white">
        {drafts.map((d) => (
          <li key={d.id ?? d.lokasi} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">{d.lokasi}: {d.qty.toLocaleString("id-ID")} {d.satuan}{d.satuan !== satuan ? ` = ${d.jumlah.toLocaleString("id-ID")} ${satuan}` : ""}</p>
              <p className="text-[11px] text-slate-500">{d.petugas || "-"} · {waktuText(d.diubah)}</p>
            </div>
            {canSave ? (
              <>
                <button type="button" aria-label={`Ubah hitungan ${d.lokasi}`} disabled={busy} onClick={() => onEdit(d)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700"><Pencil className="size-4" /></button>
                <button type="button" aria-label={`Hapus hitungan ${d.lokasi}`} disabled={busy} onClick={() => onRemove(d)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-red-200 bg-red-50 text-danger"><Trash2 className="size-4" /></button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <div className={`mt-2 rounded-xl border p-3 text-sm ${tone.panel}`}>
        <p className="font-extrabold">Total semua lokasi: {total.toLocaleString("id-ID")} {satuan}{dusText(item, total) ? ` (${dusText(item, total)})` : ""}</p>
        <p className="text-xs leading-5">
          Stok sistem sekarang {expected.toLocaleString("id-ID")} {satuan} · Selisih {selisihText(total - expected)} · {HASIL_LABEL[hasil]}
        </p>
      </div>
      {umur ? <p className="mt-2 rounded-lg bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900">Hitungan pertama sudah {umur} hari lalu. Pastikan angkanya masih benar.</p> : null}
      {mutasi.n > 0 ? (
        <p className="mt-2 rounded-lg bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900">
          Sejak hitungan pertama ada {mutasi.n} perubahan stok (total {selisihText(mutasi.net)} {satuan}). Total di atas mungkin sudah tidak pas.
        </p>
      ) : null}
    </section>
  );
}
