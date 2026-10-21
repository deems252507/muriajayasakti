import { useEffect, useState } from "react";

const PREFIX = "mjs:";

/**
 * Seperti useState, tapi nilainya diingat selama tab browser masih terbuka.
 * Dipakai untuk kolom cari, filter, dan draf nota supaya tidak hilang saat pindah halaman.
 * Dibaca setelah halaman tampil (bukan saat render pertama) agar aman dengan SSR.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* data rusak atau storage diblokir: pakai nilai awal */
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage penuh/diblokir: abaikan */
    }
  }, [key, value, ready]);

  return [value, setValue] as const;
}

/** Hapus semua ingatan pencarian/draf (dipanggil saat keluar akun). */
export function clearPersistedState() {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}
