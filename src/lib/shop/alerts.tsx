import { toast } from "sonner";

/** Notifikasi stok: kartu merah yang jelas, bukan toast biasa. */
export function stockAlert(message: string) {
  const text = message.trim();
  toast.custom(
    (id) => (
      <div role="alert" className="flex w-[min(92vw,380px)] items-start gap-3 rounded-xl border border-red-300 bg-white p-3 shadow-xl ring-1 ring-red-100">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-600 text-white">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-700">Stok Tidak Mencukupi</p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-800">{text}</p>
        </div>
        <button type="button" aria-label="Tutup" className="text-lg leading-none text-slate-400 hover:text-slate-700" onClick={() => toast.dismiss(id)}>×</button>
      </div>
    ),
    { id: "stok-alert", duration: 6000 },
  );
}

let installed = false;
/**
 * Semua pesan error yang berawalan "Stok ..." (dari kasir, transaksi manual, maupun server)
 * otomatis tampil sebagai kartu merah stok. Dipasang sekali dari Shell.
 */
export function installStockAlerts() {
  if (installed) return;
  installed = true;
  const original = toast.error.bind(toast);
  toast.error = ((message: unknown, options?: unknown) => {
    if (typeof message === "string" && /^stok\b/i.test(message.trim())) {
      stockAlert(message);
      return "stok-alert";
    }
    return original(message as never, options as never);
  }) as typeof toast.error;
}
