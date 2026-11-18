import { BellRing, MessageCircle, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, roleStyle } from "@/components/shop/chat-group";
import { pokeStaff, presenceBeat } from "@/lib/shop/api";

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

/** Staf tidak aktif yang ditampilkan awalnya; sisanya lewat tombol "Lihat semua". */
const OFFLINE_LIMIT = 5;

/** Buka Chat Staff dengan percakapan staf itu (sama seperti saat notifikasi chat diketuk). */
function openChatWith(username: string) {
  if (window.location.pathname === "/chat") {
    window.dispatchEvent(new CustomEvent("mjs-open-chat", { detail: username }));
  } else {
    try { sessionStorage.setItem("mjs-chat-with", username); } catch { /* abaikan */ }
    window.location.href = "/chat";
  }
}

function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-y border-line bg-slate-50 px-4 py-1.5 text-[10px] font-bold tracking-wide text-muted uppercase first:border-t-0">
      <span>{title}</span>
      <span>{count}</span>
    </div>
  );
}

/** Bagian kiri baris: tombol (aria-label supaya lepas dari gaya tombol global) atau, untuk baris sendiri, blok biasa. */
function Main({ me, label, onClick, children }: { me: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  const cls = "flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left";
  if (me) return <div className={cls}>{children}</div>;
  return <button type="button" aria-label={label} className={`${cls} font-normal`} onClick={onClick}>{children}</button>;
}

function StaffRow({ p, me, online, canPoke, onOpenChat }: { p: Person; me: boolean; online: boolean; canPoke: boolean; onOpenChat: (username: string) => void }) {
  const [poking, setPoking] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const showBell = canPoke && !online && !me && p.hasPush;

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      const res = await pokeStaff({ data: { username: p.username, message: text } });
      toast.success(`Notifikasi dikirim ke ${res.name}`);
      setPoking(false);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notifikasi gagal dikirim.");
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-1 pr-3">
        <Main me={me} label={`Chat dengan ${p.name}`} onClick={() => onOpenChat(p.username)}>
          <PresenceAvatar c={p} size="size-9" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-bold">{p.name}{me ? " (Anda)" : ""}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${roleStyle[p.role] ?? "bg-slate-100 text-slate-700"}`}>{p.role}</span>
            </span>
            <SeenLabel seenAgo={me ? 0 : p.seenAgo} className="text-xs" />
          </span>
        </Main>
        {!me ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" title="Chat di aplikasi" aria-label={`Chat dengan ${p.name}`} className="grid size-9 place-items-center rounded-lg border border-line bg-white text-slate-600" onClick={() => onOpenChat(p.username)}>
              <MessageCircle className="size-4" />
            </button>
            {showBell ? (
              <button type="button" title="Panggil lewat notifikasi" aria-label={`Panggil ${p.name} lewat notifikasi`} aria-expanded={poking} className={`grid size-9 place-items-center rounded-lg border bg-white ${poking ? "border-slate-500 text-slate-900" : "border-line text-slate-600"}`} onClick={() => setPoking((v) => !v)}>
                <BellRing className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {poking ? (
        <div className="flex items-center gap-2 px-4 pb-3">
          <input
            autoFocus
            value={text}
            maxLength={120}
            placeholder="Tulis pesan (boleh kosong)"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-slate-400"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void send(); }}
          />
          <button type="button" aria-label="Kirim notifikasi" disabled={sending} className="h-9 shrink-0 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-60" onClick={() => void send()}>{sending ? "Mengirim..." : "Kirim"}</button>
        </div>
      ) : null}
    </li>
  );
}

/** Tombol di header: jumlah staff yang sedang aktif; klik untuk melihat siapa saja dan kapan terakhir aktif. Juga mengirim "denyut" agar status saya tampil aktif bagi yang lain. */
export function PresenceButton({ meUsername, meRole }: { meUsername: string; meRole?: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const canPoke = meRole === "Admin" || meRole === "Owner";

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

  const all = people ?? [];
  const isOn = (p: Person) => p.username === meUsername || isOnline(p.seenAgo);
  const onlineCount = all.filter(isOn).length;

  const q = query.trim().toLowerCase();
  const matched = q ? all.filter((p) => `${p.name} ${p.role}`.toLowerCase().includes(q)) : all;
  const online = matched.filter(isOn);
  // Urutan dari server: yang paling baru aktif lebih dulu, "Belum pernah aktif" paling bawah.
  const offline = matched.filter((p) => !isOn(p));
  const expand = showAll || q !== "";
  const offlineShown = expand ? offline : offline.slice(0, OFFLINE_LIMIT);

  function openChat(username: string) {
    setOpen(false);
    openChatWith(username);
  }

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
        <div className="absolute inset-x-3 top-full z-40 mt-1 overflow-hidden overflow-hidden rounded-2xl border border-line bg-white shadow-xl sm:inset-x-auto sm:right-0 sm:top-12 sm:mt-0 sm:w-96">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-sm font-extrabold">Staff online</p>
            <span className="text-xs font-semibold text-emerald-600">{onlineCount} aktif</span>
          </div>
          <div className="px-4 pb-3">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3">
              <Search className="size-4 shrink-0 text-muted" />
              <input
                value={query}
                placeholder="Cari nama staf"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setShowAll(false); }}
              />
            </label>
          </div>
          <ul className="max-h-[55vh] overflow-y-auto border-t border-line">
            {people === null ? <li className="p-4 text-center text-sm text-muted">Memuat...</li> : null}
            {people !== null && matched.length === 0 ? <li className="p-4 text-center text-sm text-muted">Tidak ada staf bernama itu.</li> : null}
            {online.length > 0 ? <li><SectionHead title="Aktif sekarang" count={online.length} /></li> : null}
            {online.map((p) => <StaffRow key={p.username} p={p} me={p.username === meUsername} online canPoke={canPoke} onOpenChat={openChat} />)}
            {offline.length > 0 ? <li><SectionHead title="Tidak aktif" count={offline.length} /></li> : null}
            {offlineShown.map((p) => <StaffRow key={p.username} p={p} me={false} online={false} canPoke={canPoke} onOpenChat={openChat} />)}
            {!expand && offline.length > OFFLINE_LIMIT ? (
              <li className="border-t border-line">
                <button type="button" aria-label="Lihat semua staf" className="w-full px-4 py-2.5 text-center text-xs font-semibold text-slate-600" onClick={() => setShowAll(true)}>Lihat semua ({offline.length})</button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
