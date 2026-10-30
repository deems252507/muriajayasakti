import { Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, roleStyle } from "@/components/shop/chat-group";
import { presenceBeat } from "@/lib/shop/api";

/** Dianggap online bila terakhir aktif kurang dari 60 detik lalu (jam server). */
export const ONLINE_SEC = 60;

export const isOnline = (seenAgo: number | null | undefined) => seenAgo != null && seenAgo < ONLINE_SEC;

/** "Aktif" / "Aktif 15 menit lalu" / "Aktif 2 jam lalu" / "Aktif kemarin" / "Belum pernah aktif". */
export function seenText(seenAgo: number | null | undefined) {
  if (seenAgo == null) return "Belum pernah aktif";
  if (seenAgo < ONLINE_SEC) return "Aktif";
  const minutes = Math.floor(seenAgo / 60);
  if (minutes < 60) return `Aktif ${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Aktif ${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Aktif kemarin" : `Aktif ${days} hari lalu`;
}

/** Titik status: hijau = aktif, abu-abu = tidak aktif. */
export function PresenceDot({ seenAgo, className = "" }: { seenAgo: number | null | undefined; className?: string }) {
  const on = isOnline(seenAgo);
  return <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"} ${className}`} />;
}

/** Teks status berwarna: hijau saat aktif, abu-abu saat tidak. */
export function SeenLabel({ seenAgo, className = "text-[11px]" }: { seenAgo: number | null | undefined; className?: string }) {
  return <span className={`${className} ${isOnline(seenAgo) ? "font-semibold text-emerald-600" : "text-muted"}`}>{seenText(seenAgo)}</span>;
}

/** Foto staff dengan titik status di pojok kanan bawah. */
export function PresenceAvatar({ c, size = "size-10" }: { c: { name: string; photo: string; seenAgo: number | null }; size?: string }) {
  return (
    <span className="relative shrink-0">
      <Avatar c={c} size={size} />
      <PresenceDot seenAgo={c.seenAgo} className="absolute -bottom-0.5 -right-0.5 size-3 ring-2 ring-white" />
    </span>
  );
}

type Person = Awaited<ReturnType<typeof presenceBeat>>[number];

/** Tombol di header: jumlah staff yang sedang aktif; klik untuk melihat siapa saja dan kapan terakhir aktif. Juga mengirim "denyut" agar status saya tampil aktif bagi yang lain. */
export function PresenceButton({ meUsername }: { meUsername: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const beat = useCallback(() => {
    if (document.hidden) return;
    void presenceBeat().then(setPeople).catch(() => undefined);
  }, []);

  useEffect(() => {
    beat();
    const timer = window.setInterval(beat, 20000);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("focus", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("focus", beat);
    };
  }, [beat]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const onlineCount = (people ?? []).filter((p) => isOnline(p.seenAgo)).length;

  return (
    <div ref={box} className="sm:relative">
      <button
        type="button"
        title="Staff online"
        aria-label={`Staff online: ${onlineCount} orang aktif`}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-xl border border-line bg-white text-slate-600"
        onClick={() => { setOpen((v) => !v); beat(); }}
      >
        <Users className="size-5" />
        <span className={`absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold leading-5 text-white ring-2 ring-white ${onlineCount > 0 ? "bg-emerald-500" : "bg-slate-400"}`}>{onlineCount}</span>
      </button>
      {open ? (
        <div className="absolute inset-x-3 top-full z-40 mt-1 overflow-hidden rounded-2xl border border-line bg-white shadow-xl sm:inset-x-auto sm:right-0 sm:top-12 sm:mt-0 sm:w-80">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-extrabold">Staff online</p>
            <span className="text-xs font-semibold text-emerald-600">{onlineCount} aktif</span>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {people === null ? <li className="p-4 text-center text-sm text-muted">Memuat...</li> : null}
            {(people ?? []).map((p) => (
              <li key={p.username} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <PresenceAvatar c={p} size="size-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold">{p.name}{p.username === meUsername ? " (Anda)" : ""}</p>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${roleStyle[p.role] ?? "bg-slate-100 text-slate-700"}`}>{p.role}</span>
                  </div>
                  <SeenLabel seenAgo={p.username === meUsername ? 0 : p.seenAgo} className="text-xs" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
