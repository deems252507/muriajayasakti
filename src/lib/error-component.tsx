import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

/** Terjadi setelah deploy baru: tab lama masih memanggil file hasil build lama yang sudah dihapus. */
function isStaleChunkError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const stale = isStaleChunkError(error);
  useEffect(() => {
    if (!stale) return;
    // Muat ulang otomatis satu kali (penjaga supaya tidak berputar terus kalau penyebabnya lain).
    try {
      const last = Number(sessionStorage.getItem("mjs-chunk-reload") || 0);
      if (Date.now() - last > 15000) {
        sessionStorage.setItem("mjs-chunk-reload", String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* abaikan */
    }
  }, [stale]);
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {stale ? "Aplikasi baru saja diperbarui. Memuat ulang halaman..." : errorMessage(error)}
      </p>
      <button
        type="button"
        className="mt-1 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
        onClick={() => window.location.reload()}
      >
        Muat Ulang
      </button>
    </main>
  );
}
