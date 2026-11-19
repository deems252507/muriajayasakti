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

/** Kotak angka ringkasan (Belum dicek, Cocok, dst). */
export function Metric({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`num text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}
