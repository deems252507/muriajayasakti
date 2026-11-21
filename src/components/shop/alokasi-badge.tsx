import type { AlokasiStatus } from "@/lib/shop/types";

const STATUS: Record<AlokasiStatus, { label: string; cls: string }> = {
  perlu_alokasi: { label: "Perlu alokasi", cls: "bg-red-100 text-red-800" },
  menunggu_cek: { label: "Menunggu cek Admin", cls: "bg-amber-100 text-amber-800" },
  dikembalikan: { label: "Dikembalikan", cls: "bg-orange-100 text-orange-800" },
  selesai: { label: "Selesai", cls: "bg-emerald-100 text-emerald-800" },
};

export function StatusBadge({ status }: { status: AlokasiStatus }) {
  const s = STATUS[status] ?? STATUS.selesai;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${s.cls}`}>{s.label}</span>;
}
