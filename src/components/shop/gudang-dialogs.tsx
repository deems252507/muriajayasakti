import { Search, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { KategoriPicker } from "@/components/shop/opname-kategori";
import { Field, MarkWords, PrimaryButton, inputClass } from "@/components/shop/shell";
import { gudangEdit, gudangPindah, gudangSearchMaster, gudangSesuaikan, gudangTambah, listKategoriBarang } from "@/lib/shop/api";
import { formatQtyPack, hasAltUnit, toBaseQty } from "@/lib/shop/format";
import type { GudangItem, GudangLog, GudangPickItem } from "@/lib/shop/types";

type Units = { satuan: string; satuanAlt: string; isiSatuanAlt: number };
type Unit = "base" | "alt";

/** Identitas barang dari Master Data: nama, kode pajak, part number, part number alt, kategori. */
export function ItemIdentity({ item }: { item: { nama: string; kode: string; partNumber: string; partNumbersAlt: string; kategori: string; merek?: string; kodePajak: string } }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-[15px] font-extrabold leading-snug text-slate-900">{item.nama}</p>
      <div className="mt-1 space-y-0.5 text-xs text-slate-600">
        {item.kodePajak ? (
          <p>
            Kode Pajak <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 font-mono font-bold text-violet-800">{item.kodePajak}</span>
          </p>
        ) : null}
        <p>
          Part Number <span className="font-mono font-semibold text-slate-800">{item.partNumber || item.kode}</span>
        </p>
        {item.partNumbersAlt ? (
          <p>
            Part Number Alt <span className="font-mono font-semibold text-slate-800">{item.partNumbersAlt}</span>
          </p>
        ) : null}
        <p>
          {[item.kategori, item.merek].filter(Boolean).join(" · ")}
          {item.kode ? <span className="ml-2 font-mono text-slate-500">{item.kode}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, sheet = false }: { title: string; onClose: () => void; children: React.ReactNode; sheet?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={`fixed inset-0 z-50 grid overflow-y-auto bg-ink/40 ${sheet ? "place-items-end p-0 sm:place-items-center sm:p-4" : "place-items-center p-4"}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full max-w-lg bg-panel p-4 shadow-xl ${sheet ? "max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:my-6 sm:rounded-2xl" : "my-6 rounded-2xl"}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-extrabold text-slate-900">{title}</h3>
          <button type="button" aria-label="Tutup" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Jumlah + pilihan satuan (satuan dasar atau satuan besar seperti Dus) sesuai Master Data. */
export function QtyField({ label, qty, unit, units, onQty, onUnit }: { label: string; qty: string; unit: Unit; units: Units; onQty: (v: string) => void; onUnit: (u: Unit) => void }) {
  const alt = hasAltUnit(units.satuanAlt, units.isiSatuanAlt);
  const n = Number(qty);
  const valid = qty.trim() !== "" && Number.isInteger(n) && n >= 0;
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          className={inputClass}
          inputMode="numeric"
          placeholder="0"
          aria-label={label}
          value={qty}
          onChange={(event) => onQty(event.target.value.replace(/\D/g, "").slice(0, 9))}
        />
        {alt ? (
          <select className={`${inputClass} !w-32 shrink-0`} aria-label="Satuan" value={unit} onChange={(event) => onUnit(event.target.value === "alt" ? "alt" : "base")}>
            <option value="alt">{units.satuanAlt}</option>
            <option value="base">{units.satuan}</option>
          </select>
        ) : (
          <span className="grid h-11 shrink-0 place-items-center rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700">{units.satuan}</span>
        )}
      </div>
      {alt && unit === "alt" && valid ? (
        <p className="mt-1 text-xs text-slate-600">
          1 {units.satuanAlt} = {units.isiSatuanAlt} {units.satuan}. Total {formatQtyPack(toBaseQty(n, "alt", units.isiSatuanAlt), units.satuan, units.satuanAlt, units.isiSatuanAlt)}.
        </p>
      ) : null}
    </Field>
  );
}

export function defaultUnit(units: Units): Unit {
  return hasAltUnit(units.satuanAlt, units.isiSatuanAlt) ? "alt" : "base";
}

export function baseOf(qty: string, unit: Unit, units: Units) {
  const n = Number(qty);
  if (qty.trim() === "" || !Number.isInteger(n) || n < 0) return null;
  return toBaseQty(n, unit, units.isiSatuanAlt);
}

export function fmt(base: number, units: Units) {
  return formatQtyPack(base, units.satuan, units.satuanAlt, units.isiSatuanAlt);
}

function Actions({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">
        Batal
      </button>
      <PrimaryButton type="submit" disabled={busy}>
        {busy ? "Menyimpan..." : label}
      </PrimaryButton>
    </div>
  );
}

export function ErrorLine({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
      {text}
    </p>
  ) : null;
}

/** Tambah barang ke daftar gudang (pilih dari Master Data) dan/atau tambah stok gudang. */
/** Dua kotak stok berdampingan: Gudang dulu, baru Toko (sesuai alur barang). */
function StokPair({ item }: { item: GudangPickItem }) {
  const terdaftar = item.sudahDiGudang;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <div className={`rounded-lg px-2.5 py-1.5 ${terdaftar ? "bg-violet-50" : "border border-dashed border-slate-300 bg-white"}`}>
        <span className="block text-[10px] font-bold uppercase tracking-wide text-violet-800">Gudang</span>
        <b className={`num text-sm ${terdaftar ? "text-violet-900" : "text-slate-400"}`}>{terdaftar ? fmt(item.stokGudang ?? 0, item) : "Belum di gudang"}</b>
      </div>
      <div className="rounded-lg bg-slate-100 px-2.5 py-1.5">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600">Toko</span>
        <b className="num text-sm text-slate-900">{fmt(item.stokToko, item)}</b>
      </div>
    </div>
  );
}

/** Satu hasil pencarian: kata yang cocok disorot kuning seperti di Daftar Sparepart. */
function PickRow({ row, q, onPick }: { row: GudangPickItem; q: string; onPick: () => void }) {
  return (
    // Bukan <button>: styles.css memberi semua <button> tata letak flex rata tengah yang merusak susunan kartu.
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick();
        }
      }}
      className={`block w-full cursor-pointer rounded-xl border border-l-4 border-slate-200 bg-white p-3 text-left transition hover:border-accent active:bg-slate-50 ${row.sudahDiGudang ? "border-l-emerald-500" : "border-l-slate-300"}`}
    >
      <p className="break-words text-[15px] font-extrabold leading-snug text-slate-900">
        <MarkWords text={row.nama} q={q} />
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {row.merek ? <span className="rounded bg-blue-100 px-1.5 py-px text-[11px] font-bold text-blue-800"><MarkWords text={row.merek} q={q} /></span> : null}
        {row.kodePajak ? <span className="rounded bg-slate-200 px-1.5 py-px font-mono text-[11px] font-bold text-slate-800">[<MarkWords text={row.kodePajak} q={q} />]</span> : null}
        {row.kategori ? <span className="text-[11px] font-semibold text-slate-500"><MarkWords text={row.kategori} q={q} /></span> : null}
        {row.sudahDiGudang ? <span className="rounded-full bg-emerald-100 px-2 py-px text-[10px] font-bold text-emerald-800">Sudah di gudang</span> : null}
      </div>
      <p className="mt-1 break-words font-mono text-xs text-slate-700">
        <span className="font-sans text-slate-500">PN </span>
        <MarkWords text={row.partNumber || row.kode} q={q} />
        {row.partNumbersAlt ? <span className="text-slate-500"> · Alt: <MarkWords text={row.partNumbersAlt} q={q} /></span> : null}
      </p>
      <StokPair item={row} />
    </div>
  );
}

export function TambahDialog({ item, onClose, onDone, onExisting }: { item?: GudangItem; onClose: () => void; onDone: () => void; onExisting?: (row: GudangPickItem) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GudangPickItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [limit, setLimit] = useState(40);
  const [kategori, setKategori] = useState<string[]>([]);
  const [kategoriList, setKategoriList] = useState<string[]>([]);
  const [picked, setPicked] = useState<GudangPickItem | null>(
    item
      ? {
          productId: item.productId,
          kode: item.kode,
          partNumber: item.partNumber,
          partNumbersAlt: item.partNumbersAlt,
          nama: item.nama,
          kategori: item.kategori,
          merek: item.merek,
          kodePajak: item.kodePajak,
          satuan: item.satuan,
          satuanAlt: item.satuanAlt,
          isiSatuanAlt: item.isiSatuanAlt,
          stokToko: item.stokToko,
          stokGudang: item.stokGudang,
          sudahDiGudang: true,
        }
      : null,
  );
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<Unit>(picked ? defaultUnit(picked) : "base");
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) return;
    void listKategoriBarang().then(setKategoriList).catch(() => undefined);
  }, [item]);

  useEffect(() => {
    if (picked) return;
    const term = q.trim();
    let alive = true;
    setSearching(true);
    // Tanpa kata kunci langsung memuat semua barang; saat mengetik, tunggu sebentar supaya tidak menembak server tiap huruf.
    const timer = window.setTimeout(() => {
      void gudangSearchMaster({ data: { q: term, limit, kategori } })
        .then((rows) => alive && (setResults(rows), setError("")))
        .catch((err: Error) => alive && setError(err.message))
        .finally(() => alive && setSearching(false));
    }, term ? 250 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q, picked, limit, kategori]);

  function pick(row: GudangPickItem) {
    // Barang yang sudah ada di gudang tidak didaftarkan lagi: arahkan ke kartunya di daftar Stok Gudang.
    if (row.sudahDiGudang && !item && onExisting) {
      onExisting(row);
      return;
    }
    setPicked(row);
    setUnit(defaultUnit(row));
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!picked) return;
    const n = Number(qty === "" ? "0" : qty);
    if (!Number.isInteger(n) || n < 0) return setError("Jumlah harus bilangan bulat 0 atau lebih.");
    if (picked.sudahDiGudang && n <= 0) return setError("Isi jumlah lebih dari 0 untuk menambah stok.");
    setBusy(true);
    setError("");
    try {
      const res = await gudangTambah({ data: { productId: picked.productId, qty: n, unit, catatan } });
      toast.success(res.baru ? "Barang ditambahkan ke gudang" : "Stok gudang bertambah", { description: `${picked.nama}: stok gudang ${fmt(res.stokGudang, picked)}` });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  const title = item ? "Tambah stok gudang" : "Tambah barang ke gudang";
  return (
    <Modal title={title} onClose={onClose} sheet>
      {!picked ? (
        <div>
          <p className="mb-2 text-xs text-slate-600">Pilih barang dari Daftar Sparepart. Barang yang belum ada di sana ditambahkan dulu di Daftar Sparepart.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="search"
                enterKeyHint="search"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
                placeholder="Ketik: nama, part number, kode pajak"
                aria-label="Cari barang"
                value={q}
                onChange={(event) => { setLimit(40); setQ(event.target.value); }}
              />
            </div>
            <div className="sm:w-56">
              <KategoriPicker alignRight value={kategori} options={kategoriList} onChange={(next) => { setLimit(40); setKategori(next); }} />
            </div>
          </div>
          <ErrorLine text={error} />
          <p className="mt-2 text-xs font-medium text-slate-500" aria-live="polite">
            {searching && results.length === 0
              ? "Memuat..."
              : q.trim()
                ? `${results.length}${results.length >= limit ? "+" : ""} barang cocok. Ketuk untuk memilih.`
                : kategori.length
                  ? `${results.length}${results.length >= limit ? "+" : ""} barang kategori ${kategori.join(", ")}. Ketuk untuk memilih.`
                  : `${results.length}${results.length >= limit ? "+" : ""} barang, urut kategori. Pilih kategori atau ketik untuk menyaring.`}
          </p>
          <div className="mt-2 max-h-[55dvh] space-y-2 overflow-y-auto overscroll-contain sm:max-h-[50vh]">
            {!searching && results.length === 0 ? <p className="p-3 text-center text-sm text-slate-500">{q.trim() ? "Barang tidak ditemukan di Daftar Sparepart." : "Daftar Sparepart masih kosong."}</p> : null}
            {results.map((row, index) => {
              const showKategori = !q.trim() && kategori.length === 0 && (index === 0 || (results[index - 1].kategori || "").toLowerCase() !== (row.kategori || "").toLowerCase());
              return (
                <Fragment key={row.productId}>
                  {showKategori ? (
                    <div
                      role="button"
                      tabIndex={0}
                      title="Tampilkan hanya kategori ini"
                      onClick={() => row.kategori && (setLimit(40), setKategori([row.kategori]))}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && row.kategori) {
                          event.preventDefault();
                          setLimit(40);
                          setKategori([row.kategori]);
                        }
                      }}
                      className="sticky top-0 z-10 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold tracking-wide text-blue-900"
                    >
                      <span>{(row.kategori || "TANPA KATEGORI").toUpperCase()}</span>
                      {row.kategori ? <span className="shrink-0 text-[10px] font-bold text-blue-700">Hanya kategori ini</span> : null}
                    </div>
                  ) : null}
                  <PickRow row={row} q={q} onPick={() => pick(row)} />
                </Fragment>
              );
            })}
            {results.length >= limit ? (
              <button type="button" onClick={() => setLimit((current) => current + 40)} className="h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700">
                Tampilkan lebih banyak
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onClose} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 sm:h-11 sm:w-auto">
              Batal
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <ItemIdentity item={picked} />
            <StokPair item={picked} />
            {!item ? (
              <button type="button" className="mt-2 text-xs font-bold text-accent" onClick={() => { setPicked(null); setQty(""); setError(""); }}>
                Ganti barang
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            <QtyField label={picked.sudahDiGudang ? "Jumlah ditambah" : "Stok awal di gudang"} qty={qty} unit={unit} units={picked} onQty={setQty} onUnit={setUnit} />
            {!picked.sudahDiGudang ? <p className="text-xs text-slate-600">Boleh dikosongkan atau 0 untuk hanya mendaftarkan barang ke daftar gudang.</p> : null}
            <Field label="Catatan (opsional)">
              <input className={inputClass} maxLength={300} placeholder="Contoh: kiriman dari pemasok" value={catatan} onChange={(event) => setCatatan(event.target.value)} />
            </Field>
          </div>
          <ErrorLine text={error} />
          <Actions onClose={onClose} busy={busy} label="Simpan" />
        </form>
      )}
    </Modal>
  );
}

/** Ambil dari gudang: stok gudang berkurang, stok toko bertambah. */
export function AmbilDialog({ item, onClose, onDone, initialQty }: { item: GudangItem; onClose: () => void; onDone: () => void; /** Saran jumlah dalam satuan dasar (mis. dari daftar Perlu Diambil). */ initialQty?: number }) {
  const [qty, setQty] = useState(initialQty && initialQty > 0 ? String(initialQty) : "");
  const [unit, setUnit] = useState<Unit>(initialQty && initialQty > 0 ? "base" : defaultUnit(item));
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = baseOf(qty, unit, item);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (base == null || base <= 0) return setError("Isi jumlah yang diambil (lebih dari 0).");
    if (base > item.stokGudang) return setError(`Stok gudang tidak cukup. Sisa ${fmt(item.stokGudang, item)}.`);
    setBusy(true);
    setError("");
    try {
      const res = await gudangPindah({ data: { productId: item.productId, qty: Number(qty), unit, catatan } });
      toast.success("Barang dipindahkan ke toko", { description: `${item.nama}: gudang ${fmt(res.stokGudang, item)}, toko ${fmt(res.stokToko, item)}` });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memindahkan barang.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Ambil dari gudang" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <ItemIdentity item={item} />
          <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-100 p-2">
              <p className="text-slate-600">Stok gudang</p>
              <p className="text-sm font-extrabold text-slate-900">{fmt(item.stokGudang, item)}</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-2">
              <p className="text-slate-600">Stok toko</p>
              <p className="text-sm font-extrabold text-slate-900">{fmt(item.stokToko, item)}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <QtyField label="Jumlah diambil" qty={qty} unit={unit} units={item} onQty={setQty} onUnit={setUnit} />
          {base != null && base > 0 && base <= item.stokGudang ? (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Setelah dipindahkan: gudang <b>{fmt(item.stokGudang - base, item)}</b>, toko <b>{fmt(item.stokToko + base, item)}</b>.
            </p>
          ) : null}
          <Field label="Catatan (opsional)">
            <input className={inputClass} maxLength={300} value={catatan} onChange={(event) => setCatatan(event.target.value)} />
          </Field>
        </div>
        <ErrorLine text={error} />
        <Actions onClose={onClose} busy={busy} label="Pindahkan ke toko" />
      </form>
    </Modal>
  );
}

/** Admin: set stok gudang ke angka yang benar; alasan wajib dan tercatat di riwayat. */
export function SesuaikanDialog({ item, onClose, onDone }: { item: GudangItem; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<Unit>(defaultUnit(item));
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = baseOf(qty, unit, item);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (base == null) return setError("Isi stok gudang yang benar (0 atau lebih).");
    if (base === item.stokGudang) return setError("Stok gudang sudah sama dengan angka itu.");
    if (!catatan.trim()) return setError("Alasan penyesuaian wajib diisi.");
    setBusy(true);
    setError("");
    try {
      const res = await gudangSesuaikan({ data: { productId: item.productId, qty: Number(qty), unit, catatan } });
      toast.success("Stok gudang disesuaikan", { description: `${item.nama}: ${fmt(res.stokGudang, item)}` });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyesuaikan stok.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Sesuaikan stok gudang" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <ItemIdentity item={item} />
          <p className="mt-2 text-xs text-slate-600">
            Stok gudang sekarang <b className="text-slate-900">{fmt(item.stokGudang, item)}</b>
          </p>
        </div>
        <div className="mt-3 space-y-2">
          <QtyField label="Stok gudang yang benar" qty={qty} unit={unit} units={item} onQty={setQty} onUnit={setUnit} />
          <Field label="Alasan (wajib)">
            <input className={inputClass} maxLength={300} placeholder="Contoh: selisih saat hitung ulang" value={catatan} onChange={(event) => setCatatan(event.target.value)} />
          </Field>
        </div>
        <ErrorLine text={error} />
        <Actions onClose={onClose} busy={busy} label="Sesuaikan" />
      </form>
    </Modal>
  );
}

/** Admin: ubah jumlah/catatan entri riwayat. Selisihnya otomatis dikoreksi ke stok. */
export function EditLogDialog({ log, onClose, onDone }: { log: GudangLog; onClose: () => void; onDone: () => void }) {
  const koreksi = log.tipe !== "MASUK" && log.tipe !== "PINDAH";
  const alt = hasAltUnit(log.satuanAlt, log.isiSatuanAlt);
  const [qty, setQty] = useState(String(log.qtyInput));
  const [unit, setUnit] = useState<Unit>(log.satuanInput === "alt" && alt ? "alt" : "base");
  const [catatan, setCatatan] = useState(log.catatan);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = baseOf(qty, unit, log);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!koreksi && (base == null || base <= 0)) return setError("Jumlah harus lebih dari 0.");
    setBusy(true);
    setError("");
    try {
      await gudangEdit({ data: { logId: log.id, qty: Number(qty), unit, catatan } });
      toast.success("Catatan diperbarui", { description: log.nama });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit catatan gudang" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[15px] font-extrabold text-slate-900">{log.nama}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {log.tipe === "MASUK" ? "Tambah stok gudang" : log.tipe === "PINDAH" ? "Ambil dari gudang ke toko" : log.tipe === "OPNAME" ? "Stok opname, selisih" : "Koreksi stok"}: {fmt(log.jumlah, log)}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {koreksi ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Jumlah koreksi/opname tidak bisa diubah. Hapus catatan ini lalu buat yang baru (Sesuaikan stok atau Opname).</p>
          ) : (
            <>
              <QtyField label="Jumlah" qty={qty} unit={unit} units={log} onQty={setQty} onUnit={setUnit} />
              <p className="text-xs text-slate-600">Selisih jumlah otomatis dikoreksi ke stok gudang{log.tipe === "PINDAH" ? " dan stok toko" : ""}.</p>
            </>
          )}
          <Field label="Catatan">
            <input className={inputClass} maxLength={300} value={catatan} onChange={(event) => setCatatan(event.target.value)} />
          </Field>
        </div>
        <ErrorLine text={error} />
        <Actions onClose={onClose} busy={busy} label="Simpan perubahan" />
      </form>
    </Modal>
  );
}
