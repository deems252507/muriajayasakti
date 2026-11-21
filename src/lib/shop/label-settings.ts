/** Isi label barcode yang dicetak dari Daftar Sparepart. Disimpan di database (berlaku untuk semua akun). */
export type LabelFields = {
  /** Cetak label satuan ini sama sekali? */
  aktif: boolean;
  nama: boolean;
  merek: boolean;
  partNumber: boolean;
  kodePajak: boolean;
  barcode: boolean;
  kodeBarcode: boolean;
  harga: boolean;
};

/** Label satuan kecil (Pcs) dan satuan besar (Dus) diatur sendiri-sendiri. */
export type LabelOptions = { pcs: LabelFields; dus: LabelFields; ukuran: LabelSize };

/** susunan: "kertas" = banyak label berjajar dalam satu kertas (printer biasa/A4); "halaman" = tiap label satu halaman (printer label). */
/** Ukuran kertas label. Tinggi 0 = otomatis mengikuti isi. Skala teks dalam persen. */
export type LabelSize = { lebar: number; tinggi: number; skala: number; kotak: boolean; jumlah: number; susunan: "kertas" | "halaman" };
export const SIZE_DEFAULTS: LabelSize = { lebar: 70, tinggi: 0, skala: 100, kotak: true, jumlah: 1, susunan: "kertas" };
export const SIZE_LIMITS = { lebar: [20, 210], tinggi: [0, 297], skala: [20, 250], jumlah: [1, 200] } as const;

const clampInt = (v: unknown, [min, max]: readonly [number, number], fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function cleanLabelSize(raw: unknown): LabelSize {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let tinggi = clampInt(src.tinggi, SIZE_LIMITS.tinggi, SIZE_DEFAULTS.tinggi);
  if (tinggi > 0 && tinggi < 15) tinggi = 15;
  return {
    lebar: clampInt(src.lebar, SIZE_LIMITS.lebar, SIZE_DEFAULTS.lebar),
    tinggi,
    skala: clampInt(src.skala, SIZE_LIMITS.skala, SIZE_DEFAULTS.skala),
    kotak: typeof src.kotak === "boolean" ? src.kotak : SIZE_DEFAULTS.kotak,
    jumlah: clampInt(src.jumlah, SIZE_LIMITS.jumlah, SIZE_DEFAULTS.jumlah),
    susunan: src.susunan === "halaman" ? "halaman" : "kertas",
  };
}
export type LabelUnit = keyof LabelOptions;

export const LABEL_FIELDS: Array<{ key: Exclude<keyof LabelFields, "aktif">; label: string; hint?: string }> = [
  { key: "nama", label: "Nama barang" },
  { key: "merek", label: "Merek" },
  { key: "partNumber", label: "Part number" },
  { key: "kodePajak", label: "Kode pajak" },
  { key: "barcode", label: "Gambar barcode" },
  { key: "kodeBarcode", label: "Angka di bawah barcode", hint: "Ikut hilang kalau gambar barcode disembunyikan" },
  { key: "harga", label: "Harga jual" },
];

const FIELD_KEYS = ["aktif", ...LABEL_FIELDS.map((f) => f.key)] as Array<keyof LabelFields>;

export const FIELDS_DEFAULTS: LabelFields = { aktif: true, nama: true, merek: true, partNumber: true, kodePajak: true, barcode: true, kodeBarcode: true, harga: true };
export const LABEL_DEFAULTS: LabelOptions = { pcs: { ...FIELDS_DEFAULTS }, dus: { ...FIELDS_DEFAULTS }, ukuran: { ...SIZE_DEFAULTS } };

/** Hanya nama + harga. */
export const FIELDS_NAMA_HARGA: LabelFields = { aktif: true, nama: true, merek: false, partNumber: false, kodePajak: false, barcode: false, kodeBarcode: false, harga: true };

function cleanFields(raw: unknown): LabelFields {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...FIELDS_DEFAULTS };
  for (const k of FIELD_KEYS) if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
  return out;
}

/**
 * Isian yang tidak ada atau rusak dianggap tampil. Format lama (satu set isian + hargaAlt) dibaca juga:
 * isiannya dipakai untuk Pcs dan Dus, dengan harga Dus dari hargaAlt.
 */
export function cleanLabelOptions(raw: unknown): LabelOptions {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (src.pcs || src.dus) return { pcs: cleanFields(src.pcs), dus: cleanFields(src.dus), ukuran: cleanLabelSize(src.ukuran) };
  const pcs = cleanFields(src);
  const dus = { ...pcs, harga: typeof src.hargaAlt === "boolean" ? src.hargaAlt : pcs.harga };
  return { pcs, dus, ukuran: cleanLabelSize(src.ukuran) };
}

/** Apakah label ini punya isi untuk dicetak? */
export function labelAdaIsi(f: LabelFields) {
  return f.aktif && (f.nama || f.merek || f.partNumber || f.kodePajak || f.barcode || f.harga);
}
