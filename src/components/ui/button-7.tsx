import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

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
  // gaya persis seperti di video (gradasi biru-ungu + garis #656fe2)
  primary: "bg-gradient-to-r from-[#c0c7ff] to-[#4c64ff] border-[#656fe2] text-white",
  neutral: "bg-white border-slate-300 text-slate-700",
  danger: "bg-white border-red-300 text-red-600",
};

// lebar tombol saat ringkas (px) dan tinggi
const SIZE: Record<Size, { box: number; cls: string; icon: string }> = {
  sm: { box: 32, cls: "h-8 text-xs", icon: "[&_svg]:h-4 [&_svg]:w-4" },
  md: { box: 44, cls: "h-11 text-sm", icon: "[&_svg]:h-5 [&_svg]:w-5" },
};

export interface ExpandButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Ikon (mis. dari lucide-react). */
  icon: ReactNode;
  /** Teks yang muncul saat tombol disorot / disentuh. Juga dipakai sebagai aria-label. */
  label: string;
  variant?: Variant;
  size?: Size;
}

/**
 * Tombol bulat ringkas (hanya ikon). Saat kursor diarahkan, difokus keyboard, atau
 * ditekan/disentuh di layar sentuh, tombol melebar dan menampilkan teks `label`.
 * Diadaptasi dari button-7.
 */
export const ExpandButton = forwardRef<HTMLButtonElement, ExpandButtonProps>(function ExpandButton(
  { icon, label, variant = "neutral", size = "sm", className = "", style, type = "button", ...props },
  ref,
) {
  const { box, cls, icon: iconCls } = SIZE[size];
  const labelRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(box);

  // Ukur lebar teks supaya lebar tombol saat melebar pas, berapa pun panjang labelnya.
  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const measure = () => setExpanded(box + el.offsetWidth + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box, label]);

  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      {...props}
      style={{ "--xbtn-w": `${box}px`, "--xbtn-xw": `${expanded}px`, ...style } as CSSProperties}
      className={`xbtn group relative inline-flex shrink-0 items-center justify-end overflow-hidden rounded-full border-2 font-semibold shadow-sm disabled:opacity-40 ${cls} ${iconCls} ${VARIANT[variant]} ${className}`}
    >
      <span
        ref={labelRef}
        className="whitespace-nowrap pl-3 opacity-0 transition-all duration-200 translate-x-2 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 group-active:translate-x-0 group-active:opacity-100"
      >
        {label}
      </span>
      <span className="grid shrink-0 place-items-center" style={{ width: box - 4 }}>
        {icon}
      </span>
    </button>
  );
});

/**
 * Pembungkus beberapa ExpandButton. Lebar & tinggi grup dikunci sebesar kondisi ringkas,
 * jadi saat satu tombol melebar, tombol lain hanya bergeser DI DALAM grup (tidak mendorong
 * tabel, kolom, atau baris lain). Bagian yang melebar menimpa ruang kosong di sekitarnya.
 * `align="end"` melebar ke kiri (untuk kolom Aksi di tepi kanan), `"start"` ke kanan.
 */
export function ExpandGroup({
  children,
  align = "end",
  className = "",
}: {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      // jangan ukur ulang saat ada tombol yang sedang melebar
      if (el.matches(":hover, :focus-within, :active")) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setDim((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <div
      className={`relative inline-block shrink-0 align-middle ${className}`}
      style={dim ? { width: dim.w, height: dim.h } : undefined}
    >
      <div
        ref={innerRef}
        className={`flex w-max items-center gap-1 hover:z-20 focus-within:z-20 ${
          dim ? `absolute inset-y-0 ${align === "end" ? "right-0 justify-end" : "left-0 justify-start"}` : "relative"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
