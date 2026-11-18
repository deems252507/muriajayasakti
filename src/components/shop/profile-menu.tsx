import { Link } from "@tanstack/react-router";
import { ChevronDown, CircleUser, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, roleStyle } from "@/components/shop/chat-group";
import { ProfileDialog } from "@/components/shop/profile-dialog";

/** Menu akun di header: sentuh foto/nama, muncul kartu akun dengan Pengaturan dan Keluar (Keluar tetap memakai kotak konfirmasi yang sama). */
export function ProfileMenu({
  me,
  canProfile,
  canSettings,
  onLogout,
}: {
  me: { name: string; role: string; photo: string };
  /** Boleh membuka halaman Pengaturan (ubah nama dan foto akun sendiri). */
  canProfile: boolean;
  /** Admin 1: pengaturan sistem lengkap. */
  canSettings: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const itemClass = "flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm font-medium hover:bg-slate-50";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`Menu akun ${me.name}`}
        aria-expanded={open}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white pr-2 pl-1 hover:bg-slate-50 sm:gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar c={me} size="size-8" />
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-semibold leading-tight text-ink">{me.name}</span>
          <span className="block text-[11px] leading-tight text-muted">{me.role}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute top-12 right-0 z-40 w-[min(280px,calc(100vw-24px))] rounded-2xl border border-line bg-slate-50 p-1 shadow-xl">
          <section className="rounded-xl border border-line bg-white p-1 shadow-sm">
            <div className="flex items-center gap-2 p-2">
              <Avatar c={me} size="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{me.name}</p>
                <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${roleStyle[me.role] ?? "bg-slate-100 text-slate-700"}`}>{me.role}</span>
              </div>
              <span className="rounded-md border-[0.5px] border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">Aktif</span>
            </div>
            {canProfile ? (
              <>
                <div className="-mx-1 my-1 h-px bg-line" />
                <button type="button" aria-label="Profil Saya" className={itemClass} onClick={() => { setOpen(false); setEditing(true); }}>
                  <CircleUser className="size-5 text-slate-500" />
                  Profil Saya
                </button>
                {canSettings ? (
                  <Link to="/pengaturan" className={itemClass} onClick={() => setOpen(false)}>
                    <Settings className="size-5 text-slate-500" />
                    Pengaturan
                  </Link>
                ) : null}
              </>
            ) : null}
          </section>
          <div className="mt-1 p-1">
            <button type="button" aria-label="Keluar" className={`${itemClass} text-danger hover:bg-red-50`} onClick={() => { setOpen(false); onLogout(); }}>
              <LogOut className="size-5" />
              Keluar
            </button>
          </div>
        </div>
      ) : null}
      {editing ? <ProfileDialog me={me} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
