import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Pintasan keyboard global untuk area toko.
//  Ctrl+S (⌘S)  : tekan tombol Simpan yang sedang aktif (di dialog paling atas, atau di halaman bila hanya ada satu)
//  Ctrl+D       : buka daftar sparepart cepat (popup cari, bisa dari halaman mana saja)
//  Alt+N        : Transaksi Penjualan baru (Kasir)
//  Alt+M        : Barang Masuk (Transaksi Manual)
//  Alt+B        : daftar Barang (sparepart), kursor langsung di kolom Cari  |  Alt+S : Laporan Stok
//  / atau Ctrl+K: fokus ke kolom Cari
//  ?            : tampilkan daftar pintasan
// Bisa juga menandai tombol sendiri dengan atribut data-save agar jadi sasaran Ctrl+S.

const isVisible = (el: HTMLElement) => el.offsetParent !== null || getComputedStyle(el).position === "fixed";
const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((t as HTMLInputElement).type));
};

function topModal(): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[role=dialog],[aria-modal=true],.fixed.inset-0"))
    .filter((n) => isVisible(n) && n.getAttribute("role") !== "alertdialog" && n.querySelector("button"));
  return nodes.length ? nodes[nodes.length - 1] : null;
}

function findSaveButton(): HTMLButtonElement | null {
  const modal = topModal();
  const scope: ParentNode = modal ?? document.querySelector("main") ?? document;
  const tagged = Array.from(scope.querySelectorAll<HTMLButtonElement>("button[data-save]")).filter((b) => !b.disabled && isVisible(b));
  if (tagged.length) return tagged[tagged.length - 1];
  let list = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => !b.disabled && isVisible(b) && /simpan/i.test(`${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""}`),
  );
  if (modal) {
    const sub = list.filter((b) => b.type === "submit");
    return (sub.length ? sub : list).pop() ?? null;
  }
  // Di halaman biasa: hindari tombol aksi per-baris / draf; hanya jalan bila tepat satu kandidat.
  list = list.filter((b) => !/sementara|ke gudang/i.test(b.textContent ?? ""));
  return list.length === 1 ? list[0] : null;
}

function focusSearch(): boolean {
  const scope: ParentNode = topModal() ?? document.querySelector("main") ?? document;
  const el = Array.from(scope.querySelectorAll<HTMLInputElement>("input")).find(
    (i) => !i.disabled && isVisible(i) && (i.type === "search" || /^cari/i.test(i.placeholder) || /^cari/i.test(i.getAttribute("aria-label") ?? "")),
  );
  if (!el) return false;
  el.focus();
  el.select();
  return true;
}

export function useQuickKeys(go: (to: string) => void, allowed: string[], onList?: () => void) {
  const listRef = useRef(onList);
  listRef.current = onList;
  const goRef = useRef(go);
  goRef.current = go;
  const allowRef = useRef(allowed);
  allowRef.current = allowed;
  useEffect(() => {
    const nav = (to: string) => { if (allowRef.current.includes(to)) goRef.current(to); };
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && key === "s") {
        e.preventDefault(); // cegah dialog "Save page" bawaan browser
        const btn = findSaveButton();
        if (btn) btn.click();
        else toast.message("Tidak ada yang bisa disimpan di sini");
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && key === "d") {
        e.preventDefault(); // cegah "tambah bookmark" bawaan browser
        listRef.current?.();
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && key === "k") {
        e.preventDefault();
        if (!focusSearch()) toast.message("Tidak ada kolom cari di halaman ini");
        return;
      }
      if (e.altKey && !mod && !e.shiftKey) {
        const map: Record<string, string> = { n: "/kasir", m: "/manual", b: "/barang", s: "/stok" };
        if (map[key]) {
          e.preventDefault();
          nav(map[key]);
          // Daftar sparepart (Barang/Stok): langsung fokus ke kolom Cari setelah halaman terbuka.
          if (key === "b" || key === "s") window.setTimeout(() => { focusSearch(); }, 400);
        }
        return;
      }
      if (mod || e.altKey || typing(e.target)) return;
      if (key === "/") { if (focusSearch()) e.preventDefault(); return; }
      if (e.key === "?") {
        toast.message("Pintasan keyboard", {
          description: "Ctrl+S Simpan · Ctrl+D Daftar sparepart · Ctrl+K atau / Cari · Alt+N Penjualan baru · Alt+M Barang masuk · Alt+B Barang · Alt+S Stok",
          duration: 9000,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// Dropdown berbentuk <details> (Kategori, Urutan, Jenis pajak, dll.): tutup otomatis saat klik/sentuh di luar
// dropdown atau menekan Esc. Hanya <details> yang isinya melayang (class "absolute"); akordeon biasa tidak disentuh.
export function useCloseDropdownsOutside() {
  useEffect(() => {
    const floating = () =>
      Array.from(document.querySelectorAll<HTMLDetailsElement>("details[open]")).filter((d) =>
        Array.from(d.children).some((c) => c.tagName !== "SUMMARY" && c.classList.contains("absolute")),
      );
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      for (const d of floating()) if (target && !d.contains(target)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of floating()) d.open = false;
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
