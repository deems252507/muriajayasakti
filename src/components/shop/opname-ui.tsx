import { MarkWords } from "@/components/shop/shell";
import type { OpnameHasil, OpnameItem, OpnameStatus, Product } from "@/lib/shop/types";

/** Warna sesuai permintaan: abu = belum dicek, hijau = sesuai, oranye = selisih, merah = fisik habis, biru = stok sistem 0, kuning = perlu cek ulang. */
export type OpnameTone = "gray" | "green" | "orange" | "red" | "blue" | "yellow";

export const TONE: Record<OpnameTone, { badge: string; edge: string; panel: string; dot: string }> = {
  gray: { badge: "bg-slate-100 text-slate-700 ring-slate-200", edge: "border-l-slate-400", panel: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  green: { badge: "bg-emerald-100 text-emerald-800 ring-emerald-200", edge: "border-l-emerald-500", panel: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  orange: { badge: "bg-orange-100 text-orange-800 ring-orange-200", edge: "border-l-orange-500", panel: "border-orange-200 bg-orange-50 text-orange-800", dot: "bg-orange-500" },
  red: { badge: "bg-red-100 text-red-700 ring-red-200", edge: "border-l-red-500", panel: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
  blue: { badge: "bg-sky-100 text-sky-800 ring-sky-200", edge: "border-l-sky-500", panel: "border-sky-200 bg-sky-50 text-sky-800", dot: "bg-sky-500" },
  yellow: { badge: "bg-yellow-100 text-yellow-800 ring-yellow-300", edge: "border-l-yellow-500", panel: "border-yellow-300 bg-yellow-50 text-yellow-800", dot: "bg-yellow-500" },
};

export const STATUS_LABEL: Record<OpnameStatus, string> = {
  BELUM_DICEK: "Belum Dicek",
  SUDAH_DICEK: "Sudah Dicek",
  PERLU_CEK_ULANG: "Perlu Cek Ulang",
};

export const HASIL_LABEL: Record<OpnameHasil, string> = {
  SESUAI: "Sesuai",
  SELISIH: "Ada Selisih",
  FISIK_HABIS: "Fisik Habis",
  STOK_SISTEM_0: "Stok Sistem 0",
};

export function hasilTone(hasil: OpnameHasil | null | undefined): OpnameTone {
  switch (hasil) {
    case "SESUAI": return "green";
    case "FISIK_HABIS": return "red";
    case "STOK_SISTEM_0": return "blue";
    case "SELISIH": return "orange";
    default: return "gray";
  }
}

export function statusTone(status: OpnameStatus): OpnameTone {
  if (status === "BELUM_DICEK") return "gray";
  if (status === "PERLU_CEK_ULANG") return "yellow";
  return "green";
}

/** Warna kartu/baris: mengikuti hasil bila sudah dicek dan masih berlaku. */
export function itemTone(item: Pick<OpnameItem, "statusCek" | "hasil">): OpnameTone {
  if (item.statusCek === "BELUM_DICEK") return "gray";
  if (item.statusCek === "PERLU_CEK_ULANG") return "yellow";
  return hasilTone(item.hasil);
}

/** Hasil pemeriksaan dari angka (sama persis dengan aturan di fungsi SQL shop_opname_save). */
export function hitungHasil(stokSistem: number, fisik: number): OpnameHasil {
  const selisih = fisik - stokSistem;
  if (selisih === 0) return "SESUAI";
  if (fisik === 0) return "FISIK_HABIS";
  if (stokSistem <= 0) return "STOK_SISTEM_0";
  return "SELISIH";
}

const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 ring-1 ring-inset";

export function StatusBadge({ status }: { status: OpnameStatus }) {
  const tone = TONE[statusTone(status)];
  return (
    <span className={`${pill} ${tone.badge}`}>
      <span className={`size-1.5 rounded-full ${tone.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function HasilBadge({ hasil, stale }: { hasil: OpnameHasil | null; stale?: boolean }) {
  if (!hasil) return <span className="text-xs text-slate-400">-</span>;
  const tone = TONE[hasilTone(hasil)];
  return <span className={`${pill} ${tone.badge} ${stale ? "opacity-60" : ""}`}>{HASIL_LABEL[hasil]}</span>;
}

export function selisihText(value: number | null | undefined) {
  if (value == null) return "-";
  return value > 0 ? `+${value.toLocaleString("id-ID")}` : value.toLocaleString("id-ID");
}

export function selisihClass(value: number | null | undefined) {
  if (value == null || value === 0) return "text-slate-700";
  return value > 0 ? "text-sky-700" : "text-red-700";
}

/** Waktu pemeriksaan: tanggal dan jam (WITA, sama seperti cetakan lain di aplikasi). */
export function waktuText(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const tanggal = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", year: "numeric" }).format(d);
  const jam = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(".", ":");
  return `${tanggal}, ${jam}`;
}

/** Pecahan dus seperti di Daftar Sparepart: "2 Dus + 3 Pcs". Kosong jika barang tidak punya satuan dus. */
export function dusText(item: Pick<Product, "satuan" | "satuanAlt" | "isiSatuanAlt">, stok: number) {
  if (!item.satuanAlt || item.isiSatuanAlt <= 0 || stok <= 0) return "";
  const dus = Math.floor(stok / item.isiSatuanAlt);
  const sisa = stok % item.isiSatuanAlt;
  return `${dus} ${item.satuanAlt}${sisa ? ` + ${sisa} ${item.satuan}` : ""}`;
}

/** Nama barang persis seperti di Daftar Sparepart: nama, (kode pajak), dan merek. */
export function ItemTitle({ item, q = "", className = "" }: { item: Pick<Product, "nama" | "kodePajak" | "merek">; q?: string; className?: string }) {
  return (
    <>
      <div className={`font-semibold leading-snug text-slate-900 ${className}`}>
        <MarkWords text={item.nama} q={q} />
        {item.kodePajak ? <> (<MarkWords text={item.kodePajak} q={q} />)</> : null}
      </div>
      {item.merek ? (
        <div className="mt-0.5">
          <span className="inline-block rounded bg-blue-100 px-1.5 py-px text-[11px] font-bold text-blue-800">
            <MarkWords text={item.merek} q={q} />
          </span>
        </div>
      ) : null}
    </>
  );
}

/** Baris kecil "label: nilai" untuk part number, alt, dan kode pajak. */
export function MetaLine({ label, value, q = "", mono }: { label: string; value: string; q?: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 gap-1.5 text-xs leading-5">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`min-w-0 break-words font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>
        <MarkWords text={value || "-"} q={q} />
      </span>
    </div>
  );
}

/** Token unik untuk satu percobaan simpan (mencegah penyesuaian stok ganda). */
export function newToken() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* lanjut ke cadangan */
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export type OpnameFilterKey = "semua" | "belum" | "sudah" | "selisih" | "ulang" | "habis" | "sistem0";

export const FILTER_OPTIONS: Array<{ key: OpnameFilterKey; label: string }> = [
  { key: "semua", label: "Semua Barang" },
  { key: "belum", label: "Belum Dicek" },
  { key: "sudah", label: "Sudah Dicek" },
  { key: "selisih", label: "Ada Selisih" },
  { key: "ulang", label: "Perlu Cek Ulang" },
  { key: "habis", label: "Fisik Habis" },
  { key: "sistem0", label: "Stok Sistem 0" },
];

export function filterLabel(key: string) {
  return FILTER_OPTIONS.find((f) => f.key === key)?.label ?? "Semua Barang";
}

/** Penomoran halaman: Sebelumnya / Halaman X dari Y / Berikutnya. */
export function Pager({ page, total, perPage, onPage }: { page: number; total: number; perPage: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <button type="button" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-40">
        Sebelumnya
      </button>
      <span className="text-xs font-semibold text-slate-600">Halaman {page} dari {pages}</span>
      <button type="button" aria-label="Halaman berikutnya" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-40">
        Berikutnya
      </button>
    </div>
  );
}
