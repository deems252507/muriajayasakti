import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getMe, login } from "@/lib/shop/api";

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
  const [busy, setBusy] = useState(false);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-3 sm:p-6">
      <img src="/brand/login.jpg" alt="" className="absolute inset-0 h-full w-full scale-105 object-cover" />
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/80 to-blue-950/70" />
      <div className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between p-10 text-white lg:flex">
          <div>
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10">
                <img src="/brand/logo.png" alt="" className="h-8 w-8 object-contain" />
              </div>
              <div>
                <p className="text-xl font-extrabold tracking-wide">MURIA JAYA SAKTI</p>
                <p className="mt-1 text-[11px] text-white/45">2026</p>
                <p className="mt-1 text-xs tracking-[0.22em] text-white/60 uppercase">Integrated Business System</p>
              </div>
            </div>
            <div className="mt-14 max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80">
                <span className="size-2 rounded-full bg-emerald-400" />
                Sistem siap digunakan
              </p>
              <h1 className="mt-6 text-5xl leading-[1.05] font-black tracking-tight">
                Kelola bisnis.
                <br />
                <span className="text-blue-300">Lebih cepat.</span>
                <br />
                Lebih terkontrol.
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/65">
                Satu pusat kendali untuk transaksi, stok, kasir, keuangan, laporan, dan operasional bisnis Anda.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["POS", "Transaksi cepat"],
              ["Stok", "Kontrol persediaan"],
              ["Laporan", "Data terintegrasi"],
            ].map(([title, sub]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
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
            setBusy(true);
            void login({ data: { username, password } })
              .then(() => navigate({ to: "/dashboard" }))
              .catch((error: Error) => toast.error(error.message))
              .finally(() => setBusy(false));
          }}
        >
          <div className="w-full">
            <div className="mb-6 h-1 w-12 rounded-full bg-accent lg:hidden" />
            <p className="mb-2 text-lg font-extrabold tracking-wide lg:hidden">MURIA JAYA SAKTI</p>
            <h2 className="text-3xl font-bold tracking-tight">Masuk ke Sistem</h2>
            <p className="mt-2 text-sm text-muted">Gunakan akun Anda untuk mengakses sistem manajemen operasional Muria Jaya Sakti.</p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-accent">
              <span className="size-1.5 rounded-full bg-accent" />
              Akses terverifikasi · Owner, Admin & Kasir
            </p>
            <label className="mt-6 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Username
              <input className="mt-1 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Masukkan username" />
            </label>
            <label className="mt-4 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Password
              <span className="relative mt-1 block">
                <input className="h-12 w-full rounded-xl border border-slate-200 px-3 pr-16 text-sm font-normal normal-case" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Masukkan password" />
                <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted" onClick={() => setShow((v) => !v)}>{show ? "Sembunyi" : "Lihat"}</button>
              </span>
            </label>
            <button className="mt-6 h-12 w-full rounded-xl bg-accent text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50" disabled={busy}>
              {busy ? "Memeriksa..." : "Masuk ke Sistem"}
            </button>
            <p className="mt-8 text-center text-[11px] text-slate-400">Developed & Maintained by Rizky Dwi Maulana</p>
          </div>
        </form>
      </div>
    </main>
  );
}
