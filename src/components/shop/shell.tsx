import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackagePlus,
  Percent,
  Receipt,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Undo2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { logout, listMasters, searchProducts } from "@/lib/shop/api";
import { setShopProfile } from "@/lib/shop/print";
import type { Product, Staff } from "@/lib/shop/types";

const ADMIN = [
  {
    label: "Utama",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Penjualan & Kasir",
    items: [
      { to: "/kasir", label: "Kasir (POS)", icon: ShoppingCart },
      { to: "/retur", label: "Retur & Tukar", icon: Undo2 },
      { to: "/kas", label: "Kas Kasir", icon: Wallet },
    ],
  },
  {
    label: "Transaksi & Persediaan",
    items: [
      { to: "/manual", label: "Transaksi Manual", icon: ArrowLeftRight },
      { to: "/riwayat", label: "Riwayat Transaksi", icon: History },
      { to: "/barang", label: "Daftar Sparepart", icon: Package },
      { to: "/pemasok", label: "Barang Masuk Pemasok", icon: PackagePlus },
    ],
  },
  {
    label: "Keuangan & Laporan",
    items: [
      { to: "/laporan-kas", label: "Laporan Kas Harian", icon: ClipboardList },
      { to: "/bon", label: "Bon / Piutang", icon: Receipt },
      { to: "/stok", label: "Laporan Stok", icon: ClipboardList },
      { to: "/pajak", label: "Data Pajak Internal", icon: Percent },
    ],
  },
  {
    label: "Master Data",
    items: [{ to: "/mitra", label: "Pelanggan & Supplier", icon: Users }],
  },
  {
    label: "Sistem",
    items: [
      { to: "/jejak", label: "Riwayat Aktivitas", icon: ScrollText },
      { to: "/pengaturan", label: "Pengaturan", icon: Settings },
    ],
  },
] as const;

const KASIR = [
  { label: "Utama", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Operasional Kasir",
    items: [
      { to: "/kasir", label: "Kasir (POS)", icon: ShoppingCart },
      { to: "/retur", label: "Retur & Tukar", icon: Undo2 },
      { to: "/kas", label: "Kas Kasir", icon: Wallet },
    ],
  },
  {
    label: "Transaksi & Piutang",
    items: [
      { to: "/riwayat", label: "Riwayat Transaksi", icon: History },
      { to: "/bon", label: "Bon / Piutang", icon: Receipt },
    ],
  },
] as const;

export function Mark({ text, q }: { text: string; q: string }) {
  const query = q.trim();
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  let key = 0;
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key} className="rounded bg-yellow-300 px-0.5 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    key += 1;
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

export function Shell({ me, children }: { me: Staff; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState("MURIA JAYA SAKTI");
  const [logo, setLogo] = useState("/brand/logo.png");
  const path = useRouterState({ select: (s) => s.location.pathname });
  const groups = me.role === "Kasir" ? KASIR : ADMIN;
  const current = groups.flatMap((group) => [...group.items]).find((item) => path === item.to)?.label ?? brand;
  const printable = ["/laporan-kas", "/stok", "/pajak", "/riwayat", "/bon", "/kas"].includes(path);
  useEffect(() => {
    function apply(profile: { nama?: string; alamat?: string; telepon?: string; tagline?: string; logo?: string }) {
      if (!profile?.nama) return;
      setBrand(profile.nama);
      setLogo(profile.logo || "/brand/logo.png");
      setShopProfile(profile);
    }
    void listMasters().then((res) => apply(res.profile)).catch(() => undefined);
    const onShop = (event: Event) => apply((event as CustomEvent).detail);
    window.addEventListener("mjs-shop", onShop);
    return () => window.removeEventListener("mjs-shop", onShop);
  }, []);

  return (
    <div className="app-shell min-h-screen bg-paper text-ink md:grid md:grid-cols-[260px_1fr]">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-gradient-to-b from-[#121a2b] to-[#0b1220] text-white shadow-2xl transition-transform duration-200 md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
          <img src={logo} alt="" className="h-11 w-11 rounded-2xl bg-white/10 object-contain p-1.5 ring-1 ring-white/15" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-wide">{brand}</p>
            <p className="text-[11px] text-white/45">Sistem Manajemen Stok</p>
          </div>
          <button className="ml-auto rounded-lg p-2 hover:bg-white/10 md:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mt-3">
              <p className="px-3 text-[10px] font-semibold tracking-[0.18em] text-white/35 uppercase">{group.label}</p>
              <div className="mt-1 flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = path === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition ${active ? "bg-white text-ink shadow-sm font-semibold" : "text-white/75 hover:bg-white/8 hover:text-white"}`}
                    >
                      <Icon className={`size-4 shrink-0 ${active ? "text-accent" : ""}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-4 py-3">
          <p className="text-[11px] leading-5 text-white/70">Developed by Rizky Dwi Maulana</p>
        </div>
      </aside>
      {open ? <button className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={() => setOpen(false)} aria-label="Tutup" /> : null}
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-20 border-b border-white/60 bg-white/80 px-3 py-3 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3">
            <button className="grid size-11 place-items-center rounded-xl border border-line bg-white md:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{me.role}</p>
              <h1 className="truncate text-base font-bold sm:text-lg">{current}</h1>
            </div>
            <div className="order-last w-full lg:order-none lg:w-auto lg:max-w-md lg:flex-1">
              <GlobalSearch />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {printable ? (
                <button className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-3 text-xs font-semibold" onClick={() => window.print()}>
                  Cetak PDF
                </button>
              ) : null}
              <button className="grid size-10 place-items-center rounded-xl border border-line bg-white text-muted" onClick={() => window.location.reload()} aria-label="Muat ulang">
                <RefreshCw className="size-4" />
              </button>
              <div className="hidden items-center gap-2 text-right sm:flex">
                <div>
                  <p className="text-xs font-semibold text-ink">{me.name}</p>
                  <p className="text-[11px] text-muted">{me.role}</p>
                </div>
                {me.photo ? (
                  <img src={me.photo} alt="" className="size-9 rounded-full object-cover ring-1 ring-line" />
                ) : (
                  <span className="grid size-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-accent">{me.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <button
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-danger"
                onClick={() => {
                  if (!confirm("Yakin keluar dari aplikasi?")) return;
                  void logout().then(() => {
                    window.location.href = "/";
                  });
                }}
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          </div>
        </header>
        <main className="px-3 py-4 md:px-6 md:py-5">{children}</main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchProducts({ data: { q, limit: 8 } }).then((res) => setItems(res.items));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [q]);

  function pick(item: Product) {
    sessionStorage.setItem("mjs-find", item.partNumber || item.nama);
    setOpen(false);
    setQ("");
    void navigate({ to: "/barang" });
  }

  return (
    <div className="relative min-w-0 w-full">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input
        className="h-11 w-full rounded-xl border border-line bg-white pr-3 pl-10 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100"
        placeholder="Cari barang, part number, atau kategori"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && q.trim().length >= 2 ? (
        <div className="absolute top-12 z-30 max-h-80 w-full overflow-y-auto rounded-2xl border border-line bg-white p-1 shadow-xl">
          {items.length === 0 ? <p className="px-3 py-3 text-sm text-muted">Barang tidak ditemukan.</p> : null}
          {items.map((item) => (
            <button key={item.id} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-blue-50" onClick={() => pick(item)}>
              <p className="text-sm font-semibold">
                <Mark text={item.nama} q={q} />
                {item.kodePajak ? <> (<Mark text={item.kodePajak} q={q} />)</> : null}
              </p>
              <p className="text-[11px] text-muted">
                PN: <Mark text={item.partNumber || "-"} q={q} />
                {item.partNumbersAlt ? <> · Alt: <Mark text={item.partNumbersAlt} q={q} /></> : null}
                {" · "}
                <Mark text={item.kategori || "-"} q={q} />
                {item.merek ? <> · <Mark text={item.merek} q={q} /></> : null}
                {" · stok "}{item.stok}
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Panel({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-2xl border border-white/80 bg-panel p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)] ${className}`}>{children}</section>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100";

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-40 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
