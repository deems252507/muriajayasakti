import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Komponen asli dari 21st.dev (tombol "Visit"), disimpan apa adanya sebagai contoh. */
export const Component = () => {
  return (
    <>
      <button className="group relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r dark:from-[#070e41] dark:to-[#263381] from-[#c0c7ff] to-[#4c64ff]  font-medium text-neutral-200 border-2 border-[#656fe2] transition-all duration-300 hover:w-32">
        <div className="inline-flex whitespace-nowrap opacity-0 transition-all duration-200 group-hover:-translate-x-3 group-hover:opacity-100">
          Visit
        </div>
        <div className="absolute right-3.5">
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5">
            <path
              d="M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"></path>
          </svg>
        </div>
      </button>
    </>
  );
};

type Variant = "primary" | "neutral" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-[#c0c7ff] to-[#4c64ff] border-[#656fe2] text-white",
  neutral: "bg-white border-slate-300 text-slate-700",
  danger: "bg-white border-red-300 text-red-600",
};

const SIZE: Record<Size, { box: string; h: string; text: string; icon: string }> = {
  sm: { box: "h-8 w-8", h: "h-8", text: "text-xs", icon: "[&_svg]:h-4 [&_svg]:w-4" },
  md: { box: "h-11 w-11", h: "h-11", text: "text-sm", icon: "[&_svg]:h-5 [&_svg]:w-5" },
};

export interface ExpandButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Ikon (mis. dari lucide-react). */
  icon: ReactNode;
  /** Teks tombol. Dipakai sebagai aria-label, tooltip, dan teks tombol bila `showLabel`. */
  label: string;
  variant?: Variant;
  size?: Size;
  /**
   * true (default) = ikon + teks selalu tampil.
   * false = hanya ikon, teks muncul sebagai tooltip.
   */
  showLabel?: boolean;
}

/**
 * Tombol dengan ukuran tetap. TIDAK PERNAH melebar saat hover, jadi tidak menimpa kolom,
 * kartu, atau elemen lain. Mode ikon-saja menampilkan label lewat tooltip yang diposisikan
 * di dalam layar (position: fixed, tidak ikut layout, tidak terpotong tabel).
 */
export const ExpandButton = forwardRef<HTMLButtonElement, ExpandButtonProps>(function ExpandButton(
  { icon, label, variant = "neutral", size = "sm", showLabel, className = "", type = "button", onPointerEnter, onPointerLeave, onFocus, onBlur, ...props },
  ref,
) {
  const s = SIZE[size];
  const inline = showLabel ?? true;
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const innerRef = useRef<HTMLButtonElement | null>(null);

  const setRefs = (node: HTMLButtonElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
  };

  const show = () => {
    const el = innerRef.current;
    if (inline || !el) return;
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setTip(null);

  useEffect(() => {
    if (!tip) return;
    const off = () => setTip(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [tip]);

  const shape = inline ? `${s.h} max-w-full gap-1.5 px-3` : `${s.box} p-0`;

  return (
    <>
      <button
        ref={setRefs}
        type={type}
        aria-label={label}
        title={label}
        {...props}
        onPointerEnter={(e) => { onPointerEnter?.(e); if (e.pointerType === "mouse") show(); }}
        onPointerLeave={(e) => { onPointerLeave?.(e); hide(); }}
        onFocus={(e) => { onFocus?.(e); if (e.currentTarget.matches(":focus-visible")) show(); }}
        onBlur={(e) => { onBlur?.(e); hide(); }}
        className={`xbtn inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-semibold shadow-sm disabled:opacity-40 ${shape} ${s.text} ${s.icon} ${VARIANT[variant]} ${className}`}
      >
        <span className="grid shrink-0 place-items-center">{icon}</span>
        {inline ? <span className="xlabel min-w-0 truncate whitespace-nowrap">{label}</span> : null}
      </button>
      {tip
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[100] rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-lg"
              style={{
                left: Math.min(Math.max(tip.x, 8 + label.length * 3.6), window.innerWidth - 8 - label.length * 3.6),
                top: Math.max(tip.y - 6, 28),
                transform: "translate(-50%, -100%)",
              }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
});

/**
 * Pembungkus beberapa tombol. Lebar tidak pernah melebihi wadahnya (max-w-full) dan tombol
 * turun ke baris berikutnya bila tidak muat (flex-wrap), sehingga tidak keluar dari kolom/kartu.
 * `align` mengatur perataan di dalam wadah.
 */
export function ExpandGroup({
  children,
  align = "end",
  grid = false,
  className = "",
}: {
  children: ReactNode;
  align?: "start" | "end";
  /** true = susunan 2 kolom sejajar (untuk 3+ tombol di sel tabel); lebar kolom mengikuti tombol terpanjang. */
  grid?: boolean;
  className?: string;
}) {
  const layout = grid
    ? "xgrid inline-grid grid-cols-[repeat(2,max-content)] justify-center [&>.xbtn]:w-full [&>:not(.xbtn)]:col-span-2 [&>:not(.xbtn)]:justify-self-end"
    : `inline-flex flex-wrap items-center ${align === "end" ? "justify-end" : "justify-start"}`;
  return (
    <div className={`xgroup max-w-full gap-1 align-middle ${layout} ${className}`}>
      {children}
    </div>
  );
}
