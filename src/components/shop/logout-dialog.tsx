import { LogOut } from "lucide-react";
import { useEffect, useRef } from "react";

/** Kotak konfirmasi keluar: pengganti dialog bawaan browser. Fokus awal di "Batal", Esc / klik di luar menutup. */
export function LogoutDialog({
  name,
  role,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  role: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
        return;
      }
      // Tab hanya berputar di antara dua tombol
      if (e.key === "Tab") {
        const first = cancelRef.current;
        const last = confirmRef.current;
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/45 p-4" onClick={() => { if (!busy) onCancel(); }}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-desc"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid size-11 place-items-center rounded-full bg-red-50 text-danger">
          <LogOut className="size-5" />
        </div>
        <h2 id="logout-title" className="mt-4 text-lg font-bold text-ink">Keluar dari aplikasi?</h2>
        <p id="logout-desc" className="mt-1.5 text-sm leading-6 text-muted">
          Anda akan keluar dari akun <b className="text-ink">{name}</b> ({role}). Untuk masuk lagi, Anda perlu login kembali.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            className="h-10 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={onCancel}
          >
            Batal
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-progress disabled:opacity-90"
            onClick={onConfirm}
          >
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : null}
            {busy ? "Keluar…" : "Keluar"}
          </button>
        </div>
      </div>
    </div>
  );
}
