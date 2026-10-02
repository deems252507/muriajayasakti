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

export function periodRange(kind: "today" | "week" | "month") {
  const today = todayInput();
  if (kind === "today") return { start: today, end: today };
  if (kind === "month") return { start: `${today.slice(0, 8)}01`, end: today };
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
