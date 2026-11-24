import { Link } from "@tanstack/react-router";
import { PackageMinus, PackagePlus } from "lucide-react";

/**
 * Tab "Pembelian": Faktur Pembelian (barang masuk) dan Retur Pembelian berada di satu tempat,
 * seperti grup menu Pembelian di Accurate. Dipasang di atas halaman /pemasok dan /retur-pemasok.
 */
export function PembelianTabs({ active, returCount }: { active: "faktur" | "retur"; returCount?: number }) {
  const base = "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition sm:flex-none sm:px-5";
  const on = "bg-accent text-white shadow-sm";
  const off = "text-slate-600 hover:bg-slate-100";
  return (
    <nav aria-label="Pembelian" className="no-print flex gap-1 rounded-2xl border border-white/80 bg-panel p-1.5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:inline-flex">
      <Link to="/pemasok" aria-current={active === "faktur" ? "page" : undefined} className={`${base} ${active === "faktur" ? on : off}`}>
        <PackagePlus className="size-4 shrink-0" />
        <span>Faktur Pembelian</span>
      </Link>
      <Link to="/retur-pemasok" search={{}} aria-current={active === "retur" ? "page" : undefined} className={`${base} ${active === "retur" ? on : off}`}>
        <PackageMinus className="size-4 shrink-0" />
        <span>Retur Pembelian</span>
        {returCount ? <span className={`rounded-full px-1.5 text-[11px] font-bold ${active === "retur" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-700"}`}>{returCount}</span> : null}
      </Link>
    </nav>
  );
}
