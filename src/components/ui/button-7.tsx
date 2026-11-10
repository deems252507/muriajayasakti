import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
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

// ikon per ukuran; bentuk, warna, dan tinggi diatur di styles.css (button.xbtn)
const SIZE: Record<Size, { icon: string }> = {
  sm: { icon: "[&_svg]:h-4 [&_svg]:w-4" },
  md: { icon: "[&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem]" },
};

interface TipState {
  cx: number;
  top: number;
  bottom: number;
}

/** Keterangan kecil di atas (atau di bawah) tombol. Dipasang di <body> supaya tidak terpotong tabel / kartu. */
function Tip({ label, cx, top, bottom }: { label: string; cx: number; top: number; bottom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(margin, cx - w / 2), Math.max(margin, window.innerWidth - w - margin));
    const above = top - h - 6;
    setPos({ left, top: above >= margin ? above : bottom + 6 });
  }, [label, cx, top, bottom]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="xbtn-tip"
      style={{ left: pos ? pos.left : 0, top: pos ? pos.top : 0, visibility: pos ? "visible" : "hidden" }}
    >
      {label}
    </div>,
    document.body,
  );
}

export interface ExpandButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Ikon (mis. dari lucide-react). */
  icon: ReactNode;
  /** Nama tombol. Tampil sebagai keterangan saat kursor diarahkan / difokus keyboard, dan dipakai sebagai aria-label. */
  label: string;
  variant?: Variant;
  size?: Size;
}

/**
 * Tombol dengan ukuran tetap (tidak pernah melebar atau menimpa elemen lain).
 * - Di toolbar / form (layar >= 640px): ikon + teks, tampil jelas tanpa perlu disorot.
 * - Di dalam tabel dan di layar kecil: kotak ikon rapi; nama tombol muncul sebagai keterangan kecil
 *   saat mouse diarahkan atau difokus keyboard. Di layar sentuh langsung menjalankan aksi.
 */
export const ExpandButton = forwardRef<HTMLButtonElement, ExpandButtonProps>(function ExpandButton(
  {
    icon,
    label,
    variant = "neutral",
    size = "sm",
    className = "",
    style,
    type = "button",
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onFocus,
    onBlur,
    onClick,
    ...props
  },
  ref,
) {
  const { icon: iconCls } = SIZE[size];
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const showTip = (el: HTMLElement, delay: number) => {
    clearTimer();
    timer.current = setTimeout(() => {
      // Teks sudah terlihat di tombol? Tidak perlu keterangan lagi.
      const text = el.querySelector<HTMLElement>(".xbtn-label");
      if (text && text.offsetParent !== null) return;
      const r = el.getBoundingClientRect();
      setTip({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
    }, delay);
  };

  const hideTip = () => {
    clearTimer();
    setTip(null);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Sembunyikan keterangan saat halaman digulir / ukuran jendela berubah.
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [tip]);

  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      {...props}
      onPointerEnter={(e) => {
        onPointerEnter?.(e);
        if (e.pointerType === "mouse") showTip(e.currentTarget, 350);
      }}
      onPointerLeave={(e) => {
        onPointerLeave?.(e);
        hideTip();
      }}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        hideTip();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        if (e.currentTarget.matches(":focus-visible")) showTip(e.currentTarget, 0);
      }}
      onBlur={(e) => {
        onBlur?.(e);
        hideTip();
      }}
      onClick={(e) => {
        hideTip();
        onClick?.(e);
      }}
      style={style}
      data-variant={variant}
      className={`xbtn xbtn-${size} group relative inline-flex shrink-0 items-center justify-center shadow-sm disabled:opacity-40 ${iconCls} ${className}`}
    >
      <span className="grid shrink-0 place-items-center">{icon}</span>
      <span className="xbtn-label">{label}</span>
      {tip ? <Tip label={label} cx={tip.cx} top={tip.top} bottom={tip.bottom} /> : null}
    </button>
  );
});

/**
 * Pembungkus beberapa ExpandButton: tombol berjajar rapi dengan jarak tetap dan tidak
 * mendorong atau menimpa elemen lain. Properti `align` dipertahankan agar pemakaian lama tetap valid.
 */
export function ExpandGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return <div className={`inline-flex shrink-0 items-center gap-1 align-middle ${className}`}>{children}</div>;
}
