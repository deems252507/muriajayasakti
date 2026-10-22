const TZ = "Asia/Makassar";
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(".", ":");
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
export function dayLabel(iso: string) {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return "Hari ini";
  if (key === dayKey(new Date(Date.now() - 86400000).toISOString())) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function listTime(iso: string) {
  if (!iso) return "";
  return dayKey(iso) === dayKey(new Date().toISOString())
    ? hhmm(iso)
    : new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "short" });
}
export const dateTime = (iso: string) => `${new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" })} ${hhmm(iso)}`;
