export type Hasil = "cocok" | "kurang" | "lebih" | "habis";

const STYLE: Record<Hasil, string> = {
  cocok: "bg-emerald-100 text-emerald-800",
  kurang: "bg-amber-100 text-amber-800",
  lebih: "bg-blue-100 text-blue-800",
  habis: "bg-red-100 text-red-700",
};

/** Label hasil cek. `selisih` = stok fisik dikurangi stok sistem (negatif = kurang). */
export function hasilLabel(hasil: string, selisih?: number) {
  if (hasil === "cocok") return "Cocok";
  if (hasil === "habis") return "Habis";
  const n = selisih === undefined ? "" : ` ${Math.abs(selisih)}`;
  if (hasil === "kurang") return `Kurang${n}`;
  if (hasil === "lebih") return `Lebih${n}`;
  return "";
}

export function HasilBadge({ hasil, selisih }: { hasil: string; selisih?: number }) {
  const key = (["cocok", "kurang", "lebih", "habis"] as const).find((k) => k === hasil);
  if (!key) return null;
  return (
    <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${STYLE[key]}`}>
      {hasilLabel(key, selisih)}
    </span>
  );
}

export function BatalBadge() {
  return <span className="inline-block whitespace-nowrap rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">Dibatalkan</span>;
}

/** Kotak angka ringkasan (Belum dicek, Cocok, dst). */
export function Metric({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`num text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

/** Data barang yang dibutuhkan untuk menampilkan satuan. */
export interface UnitInfo {
  satuan: string;
  satuanAlt: string;
  isiSatuanAlt: number;
}

/** Barang punya satuan kedua (mis. Dus) yang valid kalau namanya ada dan isinya lebih dari 0. */
export const hasAlt = (u: UnitInfo) => Boolean(u.satuanAlt.trim()) && u.isiSatuanAlt > 0;

const fmt = (n: number) => n.toLocaleString("id-ID");

/**
 * Stok (selalu tersimpan dalam satuan dasar) ditulis dalam satuan dasar dan, kalau ada, satuan kedua.
 * Contoh: stok 26, 1 Dus = 12 Pcs → { utama: "26 Pcs", alt: "2 Dus + 2 Pcs" }.
 */
export function stokText(stok: number, u: UnitInfo) {
  const utama = `${fmt(stok)} ${u.satuan}`;
  if (!hasAlt(u) || stok <= 0) return { utama, alt: "" };
  const dus = Math.floor(stok / u.isiSatuanAlt);
  const sisa = stok % u.isiSatuanAlt;
  if (dus === 0) return { utama, alt: "" };
  return { utama, alt: `${fmt(dus)} ${u.satuanAlt}${sisa ? ` + ${fmt(sisa)} ${u.satuan}` : ""}` };
}

/** Kotak kecil berisi satu keterangan barang (merek, kode pajak, dst). */
function Chip({ children, tone = "bg-slate-100 text-slate-700" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-block max-w-full break-words rounded px-1.5 py-px text-[11px] font-bold ${tone}`}>{children}</span>;
}

export interface ItemIdentity {
  nama: string;
  kategori?: string;
  merek: string;
  kode: string;
  partNumber: string;
  partNumbersAlt: string;
  kodePajak: string;
  pajakStatus: string;
}

/**
 * Identitas barang dalam satu blok: nama, merek, kode, part number, part number alt, dan kode pajak,
 * supaya tidak salah mengambil barang yang namanya mirip.
 */
export function ItemIdentityBlock({ item, showKategori = false }: { item: ItemIdentity; showKategori?: boolean }) {
  const pajak = item.kodePajak.trim() ? `Pajak ${item.kodePajak.trim()}` : item.pajakStatus === "Pajak" ? "Pajak" : "";
  return (
    <div className="min-w-0">
      <div className="break-words text-[15px] font-bold leading-snug text-slate-900">{item.nama}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {item.merek ? <Chip tone="bg-blue-100 text-blue-800">{item.merek}</Chip> : null}
        {pajak ? <Chip tone="bg-amber-100 text-amber-800">{pajak}</Chip> : null}
        {showKategori && item.kategori ? <Chip>{item.kategori}</Chip> : null}
      </div>
      <dl className="mt-1 space-y-px text-xs text-slate-600">
        <div className="flex gap-1.5">
          <dt className="w-10 shrink-0 text-slate-400">Kode</dt>
          <dd className="min-w-0 break-all font-mono text-slate-800">{item.kode || "-"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="w-10 shrink-0 text-slate-400">PN</dt>
          <dd className="min-w-0 break-all font-mono text-slate-800">{item.partNumber || "-"}</dd>
        </div>
        {item.partNumbersAlt ? (
          <div className="flex gap-1.5">
            <dt className="w-10 shrink-0 text-slate-400">PN alt</dt>
            <dd className="min-w-0 break-all font-mono text-slate-800">{item.partNumbersAlt}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
