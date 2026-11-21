import { X } from "lucide-react";
import { inputClass } from "@/components/shop/shell";

export type FilterPemasok = { id: number; nama: string };

type Props = {
  kategoriList?: string[];
  kategori: string;
  onKategori: (value: string) => void;
  pemasokList?: FilterPemasok[];
  pemasokId: number;
  onPemasok: (value: number) => void;
  dari: string;
  sampai: string;
  onDari: (value: string) => void;
  onSampai: (value: string) => void;
  /** Dipanggil saat tombol Reset ditekan; dibiarkan kosong kalau tidak ada filter yang aktif. */
  onReset: () => void;
};

const labelClass = "block text-[11px] font-semibold text-slate-600";

/** Baris filter ringkas untuk daftar Alokasi Faktur dan Stok Gudang: kategori, pemasok, dan rentang tanggal. */
export function FilterBaris({ kategoriList, kategori, onKategori, pemasokList, pemasokId, onPemasok, dari, sampai, onDari, onSampai, onReset }: Props) {
  const aktif = Boolean(kategori || pemasokId || dari || sampai);
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kategoriList ? (
          <label className={labelClass}>
            Kategori
            <select className={`${inputClass} mt-1`} value={kategori} onChange={(e) => onKategori(e.target.value)}>
              <option value="">Semua kategori</option>
              {kategoriList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {pemasokList ? (
          <label className={labelClass}>
            Pemasok
            <select className={`${inputClass} mt-1`} value={pemasokId || ""} onChange={(e) => onPemasok(Number(e.target.value) || 0)}>
              <option value="">Semua pemasok</option>
              {pemasokList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={labelClass}>
          Dari tanggal
          <input className={`${inputClass} mt-1`} type="date" value={dari} max={sampai || undefined} onChange={(e) => onDari(e.target.value)} />
        </label>
        <label className={labelClass}>
          Sampai tanggal
          <input className={`${inputClass} mt-1`} type="date" value={sampai} min={dari || undefined} onChange={(e) => onSampai(e.target.value)} />
        </label>
      </div>
      {aktif ? (
        <button type="button" onClick={onReset} className="mt-2 flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800">
          <X className="size-3.5" /> Reset filter
        </button>
      ) : null}
    </div>
  );
}
