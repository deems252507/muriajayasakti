import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  ScrollText,
  Settings,
  ShoppingCart,
  Undo2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/lib/shop/api";
import type { Staff } from "@/lib/shop/types";

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

export function Shell({ me, children }: { me: Staff; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const groups = me.role === "Kasir" ? KASIR : ADMIN;
  const current = groups.flatMap((group) => [...group.items]).find((item) => path === item.to)?.label ?? "Muria Jaya Sakti";

  return (
    <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[248px_1fr]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-navy text-white transition-transform duration-200 md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-4 py-4">
          <img src="/brand/logo.png" alt="" className="h-10 w-10 rounded-xl bg-white/10 object-contain p-1" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-wide">MURIA JAYA SAKTI</p>
            <p className="text-[11px] text-white/50">Sistem Manajemen Stok</p>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.label} className="mt-4">
              <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">{group.label}</p>
              <div className="mt-1 flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = path === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm ${active ? "bg-accent font-medium text-white" : "text-white/75 hover:bg-white/8"}`}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      {open ? <button className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={() => setOpen(false)} aria-label="Tutup" /> : null}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="grid size-11 place-items-center rounded-lg border border-line md:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="size-5" />
            </button>
            <h1 className="text-lg font-semibold">{current}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="grid size-10 place-items-center rounded-full border border-line text-muted" onClick={() => window.location.reload()} aria-label="Muat ulang">
              <RefreshCw className="size-4" />
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold tracking-wide text-ink uppercase">{me.name}</p>
              <p className="text-[11px] text-muted">{me.role}</p>
            </div>
            <button
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-danger"
              onClick={() => {
                void logout().then(() => {
                  window.location.href = "/";
                });
              }}
            >
              <LogOut className="size-4" />
              Keluar
            </button>
          </div>
        </header>
        <main className="px-3 py-4 md:px-5">{children}</main>
      </div>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-panel p-4 shadow-sm ${className}`}>{children}</section>;
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
  "h-11 w-full rounded-lg border border-slate-300 bg-panel px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100";

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
