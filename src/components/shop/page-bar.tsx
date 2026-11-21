import { useEffect, useState } from "react";

/** True kalau layar selebar tablet/laptop. Dipakai untuk memilih tampilan tabel (lebar) atau kartu (HP). */
export function useIsWide(query = "(min-width: 768px)") {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return wide;
}

/** Pager seragam: "Menampilkan 1–20 dari 1.090 faktur" + Sebelumnya · Hal 1 / 55 · Berikutnya. */
export function PageBar({ page, total, perPage, unit, onPage }: { page: number; total: number; perPage: number; unit: string; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const go = (next: number) => {
    onPage(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const btn = "h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-40";
  return (
    <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-slate-600">Menampilkan {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} {unit}</span>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button type="button" aria-label="Halaman sebelumnya" className={btn} disabled={page <= 1} onClick={() => go(page - 1)}>Sebelumnya</button>
        <span className="grid min-w-20 place-items-center px-1 font-semibold text-slate-800">Hal {page} / {pages}</span>
        <button type="button" aria-label="Halaman berikutnya" className={btn} disabled={page >= pages} onClick={() => go(page + 1)}>Berikutnya</button>
      </div>
    </div>
  );
}
