import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, pushActive, pushSupported } from "@/lib/shop/push";

/** Tombol aktif/nonaktif notifikasi chat di luar aplikasi (saat tab/aplikasi ditutup atau HP terkunci). */
export function PushToggle() {
  const [state, setState] = useState<"loading" | "on" | "off" | "denied" | "unsupported">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    void pushActive().then((on) => setState(on ? "on" : "off")).catch(() => setState("off"));
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const res = await enablePush();
      if (res === "ok") { setState("on"); toast.success("Notifikasi diaktifkan. Pesan baru akan muncul walau aplikasi ditutup."); }
      else if (res === "denied") { setState("denied"); toast.error("Izin notifikasi ditolak."); }
      else setState("unsupported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengaktifkan notifikasi");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disablePush();
      setState("off");
      toast.success("Notifikasi di luar aplikasi dimatikan.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;
  if (state === "unsupported") {
    return <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-muted">Notifikasi di luar aplikasi belum didukung di browser ini. Di iPhone, tambahkan aplikasi ke Layar Utama dulu (Bagikan, lalu Tambah ke Layar Utama), lalu buka dari ikonnya.</p>;
  }
  if (state === "denied") {
    return <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Notifikasi diblokir. Buka pengaturan situs di browser (ikon gembok di alamat), ubah Notifikasi jadi Izinkan, lalu muat ulang halaman.</p>;
  }
  return state === "on" ? (
    <button type="button" disabled={busy} className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 disabled:opacity-50" onClick={() => void turnOff()}>
      <Bell className="size-4" />Notifikasi luar aplikasi: Aktif
    </button>
  ) : (
    <button type="button" disabled={busy} className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50" onClick={() => void turnOn()}>
      <BellOff className="size-4" />Aktifkan notifikasi luar aplikasi
    </button>
  );
}
