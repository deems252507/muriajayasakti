/** Isi label barcode yang dicetak dari Daftar Sparepart. Disimpan di browser/perangkat yang dipakai mencetak. */
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

const KEY = "mjs:label-barcode";

export function loadLabelOptions(): LabelOptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...LABEL_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LabelOptions>;
    const out = { ...LABEL_DEFAULTS };
    for (const f of LABEL_FIELDS) if (typeof parsed[f.key] === "boolean") out[f.key] = parsed[f.key] as boolean;
    return out;
  } catch {
    return { ...LABEL_DEFAULTS };
  }
}

export function saveLabelOptions(options: LabelOptions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    /* storage diblokir: pengaturan tidak tersimpan */
  }
}
