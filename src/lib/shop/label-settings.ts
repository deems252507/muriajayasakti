/** Isi label barcode yang dicetak dari Daftar Sparepart. Disimpan di database (berlaku untuk semua akun). */
export type LabelOptions = {
  nama: boolean;
  merek: boolean;
  partNumber: boolean;
  kodePajak: boolean;
  barcode: boolean;
  kodeBarcode: boolean;
  harga: boolean;
};

export const LABEL_FIELDS: Array<{ key: keyof LabelOptions; label: string; hint?: string }> = [
  { key: "nama", label: "Nama barang" },
  { key: "merek", label: "Merek" },
  { key: "partNumber", label: "Part number" },
  { key: "kodePajak", label: "Kode pajak" },
  { key: "barcode", label: "Gambar barcode" },
  { key: "kodeBarcode", label: "Angka di bawah barcode", hint: "Ikut hilang kalau gambar barcode disembunyikan" },
  { key: "harga", label: "Harga jual" },
];

export const LABEL_DEFAULTS: LabelOptions = { nama: true, merek: true, partNumber: true, kodePajak: true, barcode: true, kodeBarcode: true, harga: true };

/** Isian yang tidak ada atau rusak dianggap tampil (sama seperti sebelum ada pengaturan ini). */
export function cleanLabelOptions(raw: unknown): LabelOptions {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...LABEL_DEFAULTS };
  for (const f of LABEL_FIELDS) if (typeof src[f.key] === "boolean") out[f.key] = src[f.key] as boolean;
  return out;
}
