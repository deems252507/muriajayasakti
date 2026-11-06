import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { getMe, login, publicShop } from "@/lib/shop/api";

// Versi tampil di bawah form login. Naikkan angka ini setiap ada pembaruan besar.
const APP_VERSION = "1.0";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const me = await getMe();
    if (me) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<"idle" | "busy" | "ok">("idle");
  const [leaving, setLeaving] = useState(false);
  const [seen, setSeen] = useState(false);
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [caps, setCaps] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgot, setForgot] = useState(false);
  const busy = phase !== "idle";
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const [brand, setBrand] = useState({ nama: "MURIA JAYA SAKTI", tagline: "Integrated Business System", logo: "/brand/logo.png" });
  // Ingat username (password tidak pernah disimpan).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mjs-login-user");
      if (saved) {
        setUsername(saved);
        setRemember(true);
      }
    } catch {
      /* abaikan */
    }
  }, []);
  // Layar pembuka hanya tampil sekali per sesi browser.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("mjs-login-intro")) setSeen(true);
    } catch {
      /* abaikan */
    }
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem("mjs-login-intro", "1");
      } catch {
        /* abaikan */
      }
    }, 3600);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    void publicShop().then((shop) => {
      if (!shop?.nama) return;
      setBrand({ nama: shop.nama, tagline: shop.tagline || "Integrated Business System", logo: shop.logo || "/brand/logo.png" });
      document.title = shop.nama;
    }).catch(() => undefined);
  }, []);

  return (
    <main className="lg-root relative grid min-h-screen place-items-center overflow-hidden p-3 sm:p-6" data-seen={seen} data-leaving={leaving}>
      <div className="lg-splash" aria-hidden="true">
        <div className="lg-splash-glow" />
        <div className="lg-splash-mark">
          <svg className="lg-splash-ring" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="lgGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f5d98b" />
                <stop offset="0.5" stopColor="#d4af37" />
                <stop offset="1" stopColor="#8a6a12" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="none" stroke="url(#lgGold)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <img src={brand.logo} alt="" />
        </div>
        <p className="lg-splash-name">
          {(() => {
            let n = 0;
            return brand.nama.split(" ").map((word, wi) => (
              <span key={wi} className="lg-word">
                {Array.from(word).map((ch, ci) => (
                  <span key={ci} className="lg-ch" style={{ "--i": n++ } as CSSProperties}>{ch}</span>
                ))}
              </span>
            ));
          })()}
        </p>
        <span className="lg-splash-line" />
        <p className="lg-splash-tag">{brand.tagline}</p>
      </div>
      <img src="/brand/login.jpg" alt="" className="lg-bg absolute inset-0 h-full w-full scale-105 object-cover" />
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/80 to-blue-950/70" />
      <div className="lg-card relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between p-10 text-white lg:flex">
          <div>
            <div className="lg-item flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10">
                <img src={brand.logo} alt="" className="h-8 w-8 object-contain" />
              </div>
              <div>
                <p className="flex flex-wrap gap-x-[0.4em] text-xl font-extrabold tracking-wide" aria-label={brand.nama}><BrandName name={brand.nama} /></p>
                <p className="mt-1 text-[11px] text-white/45">2026</p>
                <p className="lg-btag mt-1 text-xs tracking-[0.22em] text-white/60 uppercase">{brand.tagline}</p>
              </div>
            </div>
            <div className="mt-14 max-w-xl">
              <p className="lg-item inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80" style={{ "--d": "0.1s" } as CSSProperties}>
                <span className="size-2 rounded-full bg-emerald-400" />
                Sistem siap digunakan
              </p>
              <h1 style={{ "--d": "0.2s" } as CSSProperties} className="lg-item mt-6 text-5xl leading-[1.05] font-black tracking-tight">
                Kelola bisnis.
                <br />
                <span className="text-blue-300">Lebih cepat.</span>
                <br />
                Lebih terkontrol.
              </h1>
              <p style={{ "--d": "0.3s" } as CSSProperties} className="lg-item mt-5 max-w-lg text-sm leading-7 text-white/65">
                Satu pusat kendali untuk transaksi, stok, kasir, keuangan, laporan, dan operasional bisnis Anda.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["POS", "Transaksi cepat"],
              ["Stok", "Kontrol persediaan"],
              ["Laporan", "Data terintegrasi"],
            ].map(([title, sub], i) => (
              <div key={title} style={{ "--d": `${0.4 + i * 0.1}s` } as CSSProperties} className="lg-item rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-bold">{title}</p>
                <p className="mt-1 text-[11px] text-white/45">{sub}</p>
              </div>
            ))}
          </div>
        </section>
        <form
          className="flex items-center bg-white p-6 sm:p-10"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (!username.trim() || !password) {
              setError("Username dan password wajib diisi.");
              setShake(true);
              setTimeout(() => setShake(false), 500);
              return;
            }
            setError("");
            setPhase("busy");
            // Minimal 0,9 detik supaya animasi loading sempat terlihat walau server cepat.
            void Promise.all([login({ data: { username, password } }), sleep(900)])
              .then(async ([me]) => {
                const role = me?.role === "Owner" ? "Owner" : me?.role === "Kasir" ? "Kasir" : "Admin";
                sessionStorage.setItem("mjs-notice", `${role} masuk${me?.name ? ` · ${me.name}` : ""}`);
                try {
                  if (remember) localStorage.setItem("mjs-login-user", username.trim());
                  else localStorage.removeItem("mjs-login-user");
                } catch {
                  /* abaikan */
                }
                setPhase("ok");
                await sleep(750);
                setLeaving(true);
                await sleep(420);
                await navigate({ to: "/dashboard" });
              })
              .catch((err: Error) => {
                setPhase("idle");
                setShake(true);
                setTimeout(() => setShake(false), 500);
                setError(err.message || "Login gagal. Periksa username dan password Anda.");
              });
          }}
        >
          <div className="w-full">
            <div className="lg-item mb-6 h-1 w-12 rounded-full bg-accent lg:hidden" />
            <p className="mb-2 flex flex-wrap gap-x-[0.4em] text-lg font-extrabold tracking-wide lg:hidden" aria-label={brand.nama}><BrandName name={brand.nama} /></p>
            <h2 className="lg-item text-3xl font-bold tracking-tight">Masuk ke Sistem</h2>
            <p style={{ "--d": "0.08s" } as CSSProperties} className="lg-item mt-2 text-sm text-muted">Gunakan akun Anda untuk mengakses sistem manajemen operasional {brand.nama}.</p>
            <p style={{ "--d": "0.16s" } as CSSProperties} className="lg-item mt-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-accent">
              <span className="size-1.5 rounded-full bg-accent" />
              Akses terverifikasi · Owner, Admin & Kasir
            </p>
            <label style={{ "--d": "0.24s" } as CSSProperties} className="lg-item lg-field mt-6 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <span className="lg-lbl">Username</span>
              <input className="lg-input mt-1 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} aria-invalid={error ? true : undefined} autoComplete="username" placeholder="Masukkan username" />
            </label>
            <label style={{ "--d": "0.32s" } as CSSProperties} className="lg-item lg-field mt-4 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <span className="lg-lbl">Password</span>
              <span className="relative mt-1 block">
                <PasswordInput className="lg-input h-12 w-full rounded-xl border border-slate-200 px-3 pr-12 text-sm font-normal normal-case" show={show} value={password} onChange={(v) => { setPassword(v); setError(""); }} onCaps={setCaps} invalid={!!error} placeholder="Masukkan password" />
                <button type="button" className="btn-inline lg-eye absolute top-1/2 right-2 -translate-y-1/2" data-show={show} aria-label={show ? "Sembunyikan password" : "Lihat password"} onClick={() => setShow((v) => !v)}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    <path className="lg-eye-slash" d="M4 4l16 16" />
                  </svg>
                </button>
              </span>
            </label>
            {error && <p role="alert" className="lg-note mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600"><span aria-hidden="true">✕</span>{error}</p>}
            {caps && !error && <p className="lg-note mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600"><span aria-hidden="true">⚠</span>Caps Lock aktif</p>}
            <div style={{ "--d": "0.4s" } as CSSProperties} className="lg-item mt-4 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 select-none" style={{ cursor: "pointer" }}>
                <input type="checkbox" className="size-4" style={{ accentColor: "#1d4ed8" }} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Ingat username saya
              </label>
              <button type="button" className="btn-inline text-xs font-semibold text-accent" aria-expanded={forgot} onClick={() => setForgot((v) => !v)}>Lupa password?</button>
            </div>
            <div className="lg-collapse" data-open={forgot}>
              <div>
                <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-slate-600">Hubungi <b>Owner</b> toko untuk mereset password Anda. Setelah direset, Anda bisa langsung masuk dengan password baru.</p>
              </div>
            </div>
            <div style={{ "--d": "0.48s" } as CSSProperties} className={`lg-item ${shake ? "lg-shake" : ""}`}>
              <button className="btn-tight lg-btn text-white shadow-sm" data-state={phase} disabled={busy} aria-live="polite">
                <span className="lg-btn-label">Masuk ke Sistem</span>
                <span className="lg-btn-spin" aria-hidden="true" />
                <svg className="lg-btn-check" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </button>
            </div>
            <div style={{ "--d": "0.56s" } as CSSProperties} className="lg-item mt-8 text-center text-[11px] text-slate-400">
              <p>Developed & Maintained by Rizky Dwi Maulana</p>
              <p className="mt-1 text-slate-300">Versi {APP_VERSION} · © 2026</p>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Kolom password gaya HP: huruf yang baru diketik tampil sebentar (0,8 detik), lalu menjadi titik. */
function PasswordInput({ value, onChange, show, className, placeholder, onCaps, invalid }: { value: string; onChange: (v: string) => void; show: boolean; className?: string; placeholder?: string; onCaps?: (on: boolean) => void; invalid?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [reveal, setReveal] = useState(-1);
  const display = show ? value : Array.from(value, (c, i) => (i === reveal ? c : "\u2022")).join("");
  useEffect(() => () => clearTimeout(timer.current), []);
  useIsoLayoutEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    let p = 0;
    const max = Math.min(display.length, next.length);
    while (p < max && display[p] === next[p]) p++;
    let q = 0;
    while (q < display.length - p && q < next.length - p && display[display.length - 1 - q] === next[next.length - 1 - q]) q++;
    const inserted = next.slice(p, next.length - q);
    onChange(value.slice(0, p) + inserted + value.slice(value.length - q));
    caret.current = p + inserted.length;
    clearTimeout(timer.current);
    if (!show && inserted.length === 1) {
      setReveal(p);
      timer.current = setTimeout(() => setReveal(-1), 800);
    } else setReveal(-1);
  };
  return (
    <input
      ref={ref}
      className={className}
      type="text"
      name="password"
      value={display}
      onChange={handle}
      onKeyDown={(e) => onCaps?.(e.getModifierState("CapsLock"))}
      onKeyUp={(e) => onCaps?.(e.getModifierState("CapsLock"))}
      onBlur={() => onCaps?.(false)}
      aria-invalid={invalid ? true : undefined}
      autoComplete="current-password"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
    />
  );
}

/** Nama toko dipecah per huruf supaya bisa dianimasikan satu per satu. */
function BrandName({ name }: { name: string }) {
  let n = 0;
  return (
    <>
      {name.split(" ").map((word, wi) => (
        <span key={wi} className="lg-word" aria-hidden="true">
          {Array.from(word).map((ch, ci) => (
            <span key={ci} className="lg-bch" style={{ "--i": n++ } as CSSProperties}>{ch}</span>
          ))}
        </span>
      ))}
    </>
  );
}
