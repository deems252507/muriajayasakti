import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EMOJI_CATEGORIES, loadRecentEmoji, rememberEmoji } from "./emoji-data";

/** Pemilih emoji ala WhatsApp: tab kategori, daftar "Terbaru", dan ribuan emoji. */
export function EmojiPicker({ onPick, onClose, keepOpen = true }: { onPick: (emoji: string) => void; onClose: () => void; keepOpen?: boolean }) {
  const [recent, setRecent] = useState<string[]>(() => loadRecentEmoji());
  const tabs = useMemo(() => [
    ...(recent.length ? [{ key: "recent", icon: "🕘", label: "Terbaru", emojis: recent }] : []),
    ...EMOJI_CATEGORIES,
  ], [recent]);
  const [tab, setTab] = useState(() => (loadRecentEmoji().length ? "recent" : "smile"));
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pick(emoji: string) {
    setRecent(rememberEmoji(emoji));
    onPick(emoji);
    if (!keepOpen) onClose();
  }

  return (
    <div className="flex h-80 max-h-[60vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-0.5 border-b border-line px-1.5 py-1">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.key} type="button" title={t.label} aria-label={t.label} onClick={() => setTab(t.key)} className={`grid size-9 shrink-0 place-items-center rounded-lg text-lg ${t.key === current.key ? "bg-blue-100" : "hover:bg-slate-100"}`}>{t.icon}</button>
          ))}
        </div>
        <button type="button" aria-label="Tutup emoji" className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-slate-100" onClick={onClose}><X className="size-4" /></button>
      </div>
      <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{current.label}</p>
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] content-start gap-0.5 overflow-y-auto px-2 pb-2 pt-1">
        {current.emojis.map((e, i) => (
          <button key={`${e}-${i}`} type="button" className="grid size-10 place-items-center rounded-lg text-2xl hover:bg-slate-100" onClick={() => pick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
