import { CheckCircle2, Trash2 } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

export interface ConfirmOptions {
  /** Judul kotak. Bawaan: "Konfirmasi penghapusan" (hapus) atau "Konfirmasi". */
  title?: string;
  /** Teks tombol utama. Bawaan: "Hapus" (hapus) atau "Ya, lanjutkan". */
  confirmText?: string;
  cancelText?: string;
  /** Tombol merah untuk aksi yang menghapus. Bawaan: otomatis jika pesan diawali "Hapus" / "Kosongkan". */
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  id: number;
  message: string;
  resolve: (ok: boolean) => void;
}

let seq = 0;
let queue: ConfirmRequest[] = [];
let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function showNext() {
  current = queue.shift() ?? null;
  emit();
}

function settle(ok: boolean) {
  const request = current;
  if (!request) return;
  request.resolve(ok);
  showNext();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pengganti `confirm()` bawaan browser. Pemakaian: `if (!(await confirmDialog("Hapus data ini?"))) return;`
 * Kotaknya dipasang oleh <ConfirmHost /> di layout utama.
 */
export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    queue.push({ id: ++seq, message, ...options, resolve });
    if (!current) showNext();
  });
}

function ConfirmView({ request }: { request: ConfirmRequest }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = request.danger ?? /^(hapus|kosongkan)/i.test(request.message);
  const title = request.title ?? (danger ? "Konfirmasi penghapusan" : "Konfirmasi");
  const confirmText = request.confirmText ?? (danger ? "Hapus" : "Ya, lanjutkan");
  const cancelText = request.cancelText ?? "Batal";

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
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
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/45 p-4" onClick={() => settle(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`grid size-11 place-items-center rounded-full ${danger ? "bg-red-50 text-danger" : "bg-blue-50 text-accent"}`}>
          {danger ? <Trash2 className="size-5" /> : <CheckCircle2 className="size-5" />}
        </div>
        <h2 id="confirm-title" className="mt-4 text-lg font-bold text-ink">{title}</h2>
        <p id="confirm-desc" className="mt-1.5 whitespace-pre-line text-sm leading-6 text-muted">{request.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="h-10 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => settle(false)}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`inline-flex h-10 min-w-24 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white ${danger ? "bg-danger hover:bg-red-700" : "bg-accent hover:bg-blue-800"}`}
            onClick={() => settle(true)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pasang sekali di layout utama. */
export function ConfirmHost() {
  const request = useSyncExternalStore(subscribe, () => current, () => null);
  return request ? <ConfirmView key={request.id} request={request} /> : null;
}
