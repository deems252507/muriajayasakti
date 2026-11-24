export function rupiah(value: number | string | null | undefined) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function digits(value: string) {
  return Number(String(value).replace(/\D/g, "")) || 0;
}

export function grouped(value: number | string) {
  const n = Number(value) || 0;
  return n.toLocaleString("id-ID");
}

export function packFromName(nama: string) {
  const matches = [...String(nama).matchAll(/(?:^|[\s(])(\d{1,3})\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(ML|LTR|L)\b/gi)];
  const found = matches.at(-1);
  if (!found) return null;
  const pcs = Number(found[1]);
  if (!pcs || pcs > 100) return null;
  return { pcs, ukuran: `${found[2].replace(",", ".")}${found[3].toUpperCase() === "LTR" ? "L" : found[3].toUpperCase()}` };
}

export function monthSpan(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export function periodRange(kind: "today" | "week" | "month" | "year") {
  const today = todayInput();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (kind === "today") return { start: today, end: today };
  if (kind === "month") return monthSpan(year, month);
  if (kind === "year") return { start: `${year}-01-01`, end: `${year}-12-31` };
  const date = new Date(`${today}T00:00:00Z`);
  const dow = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return { start: date.toISOString().slice(0, 10), end: today };
}

export function todayInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function when(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Satuan besar hanya berlaku bila namanya ada dan isinya lebih dari 1. */
export function hasAltUnit(satuanAlt: string, isi: number) {
  return Boolean(String(satuanAlt ?? "").trim()) && Number(isi) > 1;
}

/** Ubah jumlah + satuan pilihan (dasar/besar) menjadi satuan dasar. */
export function toBaseQty(qty: number, unit: "base" | "alt", isi: number) {
  return unit === "alt" ? qty * Math.max(1, Number(isi) || 1) : qty;
}

/** Tampilkan jumlah satuan dasar sebagai mis. "10 Dus 4 Pcs", "10 Dus", atau "48 Pcs". */
export function formatQtyPack(base: number, satuan: string, satuanAlt: string, isi: number) {
  const n = Math.trunc(Number(base) || 0);
  const dasar = String(satuan ?? "").trim() || "Pcs";
  if (!hasAltUnit(satuanAlt, isi)) return `${n.toLocaleString("id-ID")} ${dasar}`;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const besar = Math.floor(abs / Number(isi));
  const sisa = abs % Number(isi);
  if (besar === 0) return `${sign}${sisa.toLocaleString("id-ID")} ${dasar}`;
  if (sisa === 0) return `${sign}${besar.toLocaleString("id-ID")} ${satuanAlt}`;
  return `${sign}${besar.toLocaleString("id-ID")} ${satuanAlt} ${sisa.toLocaleString("id-ID")} ${dasar}`;
}

/** Jumlah dalam satuan dasar ditulis dengan satuan faktur bila lebih besar: 60 Pcs -> "60 Pcs (5 Dus)". */
export function packQtyText(base: number, satuanFaktur: string, factor: number, satuanDasar: string) {
  const unit = satuanDasar || satuanFaktur;
  if (factor <= 1 || satuanFaktur === unit) return `${grouped(base)} ${satuanFaktur}`;
  const big = Math.floor(base / factor);
  const rest = base % factor;
  const pack = big > 0 ? ` (${grouped(big)} ${satuanFaktur}${rest ? ` + ${grouped(rest)} ${unit}` : ""})` : "";
  return `${grouped(base)} ${unit}${pack}`;
}

/** Baris faktur pembelian setelah dikurangi retur ke pemasok: jumlah retur, sisa bersih, dan nilai bersihnya. */
export function fakturLineNet(item: { qty: number; satuan: string; qtyDasar: number; hargaBeli: number; satuanDasar?: string; returQtyDasar?: number; returNilai?: number }) {
  const factor = Math.max(1, Math.round(Number(item.qtyDasar || 0) / Math.max(1, Number(item.qty || 1))));
  const retur = Math.max(0, Number(item.returQtyDasar ?? 0));
  const netDasar = Math.max(0, Number(item.qtyDasar || 0) - retur);
  const dasar = item.satuanDasar || item.satuan;
  return {
    factor,
    retur,
    netDasar,
    returText: retur > 0 ? packQtyText(retur, item.satuan, factor, dasar) : "",
    netText: packQtyText(netDasar, item.satuan, factor, dasar),
    gross: Number(item.hargaBeli || 0) * Number(item.qty || 0),
    returNilai: Number(item.returNilai ?? 0),
    net: Number(item.hargaBeli || 0) * Number(item.qty || 0) - Number(item.returNilai ?? 0),
  };
}
