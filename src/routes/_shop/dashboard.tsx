import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getDashboard } from "@/lib/shop/api";
import { rupiah, when } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/dashboard")({ component: DashboardPage });

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function DashboardPage() {
  const me = Route.useRouteContext().me;
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const notice = sessionStorage.getItem("mjs-notice");
    if (notice) {
      sessionStorage.removeItem("mjs-notice");
      toast.success(notice);
    }
    const timer = window.setTimeout(() => {
      if (!cancelled) setError((prev) => prev || "Ringkasan terlalu lama dimuat. Periksa koneksi, lalu muat ulang.");
    }, 20000);
    void getDashboard()
      .then((res) => {
        if (cancelled) return;
        setError("");
        setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error && e.message ? e.message : "Gagal memuat ringkasan.");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tick]);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-5">
        <p className="text-danger">{error}</p>
        <button className="mt-3" onClick={() => { setError(""); setData(null); setTick((n) => n + 1); }}>Muat ulang</button>
      </div>
    );
  }
  if (!data) return <p className="text-muted">Memuat ringkasan...</p>;

  return me.role === "Kasir" ? <KasirDash data={data} name={me.name} /> : <AdminDash data={data} readOnly={me.role === "Owner"} />;
}

function dayLabel(dateText: string) {
  const date = new Date(`${dateText}T12:00:00`);
  return `${HARI[date.getDay()]}, ${date.getDate()} ${date.toLocaleDateString("id-ID", { month: "short" })}`;
}

function KasirDash({ data, name }: { data: NonNullable<Awaited<ReturnType<typeof getDashboard>>>; name: string }) {
  const max = Math.max(1, ...data.week.map((day) => day.total));
  const aktif = Boolean(data.shift);
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-5 text-white md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase">Dashboard Kasir</span>
              <span className={`size-2 rounded-full ${aktif ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="text-[10px] font-semibold text-white/70">{aktif ? "SHIFT AKTIF" : "SHIFT BELUM AKTIF"}</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Ringkasan Operasional, {name}</h2>
            <p className="mt-2 text-sm text-blue-100/80">Pantau penjualan dan kas shift Anda secara ringkas.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="min-w-[190px] rounded-2xl border border-white/10 bg-white/10 px-5 py-3">
              <p className="text-[10px] font-bold tracking-wider text-white/60 uppercase">Kas Laci Saat Ini</p>
              <p className="num mt-1 text-xl font-black">{rupiah(data.drawer ?? 0)}</p>
            </div>
            <Link to="/kasir" className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-blue-700">Buka Kasir</Link>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Penjualan Hari Ini" value={rupiah(data.today.sales)} hint={`${data.today.trx} transaksi`} />
        <Stat label="Tunai" value={rupiah(data.today.tunai)} hint="Nilai penjualan tunai" tone="ok" />
        <Stat label="Bon / Piutang" value={rupiah(data.today.bon)} hint="Belum lunas" tone="danger" />
        <Stat label="Barang Terjual" value={`${data.today.trx} trx`} hint="Setelah retur" tone="info" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Chart data={data} max={max} title="Penjualan 7 Hari Terakhir" hint="Ringkasan omzet berdasarkan transaksi kasir" className="lg:col-span-2" />
        <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-800">Status Shift</h3>
              <p className="mt-1 text-[11px] text-muted">Kondisi kasir saat ini</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${aktif ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{aktif ? "AKTIF" : "BELUM AKTIF"}</span>
          </div>
          <div className="space-y-3 text-xs">
            <Mini label="Kas Awal" value={rupiah(data.shift?.kasAwal ?? 0)} />
            <Mini label="Kas Laci" value={rupiah(data.drawer ?? 0)} />
            <Mini label="Transaksi" value={`${data.today.trx} Trx`} />
          </div>
        </section>
      </div>
      <TopProducts items={data.top} />
    </div>
  );
}

function AdminDash({ data, readOnly = false }: { data: NonNullable<Awaited<ReturnType<typeof getDashboard>>>; readOnly?: boolean }) {
  const max = Math.max(1, ...data.week.map((day) => day.total));
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-extrabold tracking-[0.18em] text-blue-200 uppercase">Executive Dashboard</p>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Ringkasan Bisnis</h2>
            <p className="mt-2 text-sm text-blue-100/70">Pantau penjualan, stok, barang masuk, dan kondisi operasional dari satu halaman.</p>
          </div>
          {readOnly ? <p className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-blue-100">Mode Owner: lihat laporan saja, tanpa tambah, simpan, atau hapus.</p> : (
          <div className="flex flex-wrap gap-2">
            <Link to="/kasir" className="rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-blue-700">+ Transaksi Penjualan</Link>
            <Link to="/manual" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-extrabold text-white">Barang Masuk</Link>
          </div>
          )}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Stat label="Penjualan Hari Ini" value={rupiah(data.today.sales)} hint={`${data.today.trx} trx`} tone="ok" />
        <Stat label="Penjualan Bulan" value={rupiah(data.month)} hint={`${data.monthTrx} trx`} tone="info" />
        <Stat label="Tunai Hari Ini" value={rupiah(data.today.tunai)} hint="Penjualan cash" tone="ok" />
        <Stat label="Transfer Hari Ini" value={rupiah(data.today.transfer)} hint="Transfer / Split" />
        <Stat label="Bon / Piutang" value={rupiah(data.today.bon)} hint="Hari ini" tone="danger" />
        <div className="rounded-xl border border-line bg-panel p-4 text-left shadow-sm">
          <p className="text-[9px] font-bold tracking-wider text-muted uppercase">Barang Masuk</p>
          <p className="num mt-2 text-xl font-black text-amber-600">{data.monthIn.qty} item</p>
          <p className="mt-1 text-[9px] text-muted">Bulan berjalan{readOnly ? "" : " · lihat di Transaksi Manual"}</p>
        </div>
        <Stat label="Stok Kritis" value={String(data.kritis)} hint="Perlu perhatian" tone="warn" />
        <Stat label="Stok Habis" value={String(data.habis)} hint="Segera restock" tone="danger" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Chart data={data} max={max} title="Tren Penjualan" hint="Performa penjualan 7 hari terakhir" className="xl:col-span-2" />
        <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
          <h3 className="font-extrabold">Ringkasan Stok</h3>
          <p className="mt-1 text-[11px] text-muted">Kondisi persediaan saat ini</p>
          <div className="mt-4 space-y-2.5">
            <Mini label="Total Barang" value={data.products.toLocaleString("id-ID")} />
            <Mini label="Total Stok" value={data.stockPcs.toLocaleString("id-ID")} />
            <Mini label="Nilai Modal Stok" value={rupiah(data.stockValue)} />
            <Mini label="Stok Habis" value={String(data.habis)} danger />
          </div>
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TopProducts items={data.top.slice(0, 5)} compact />
        <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold">Barang Masuk</h3>
              <p className="mt-1 text-[11px] text-muted">Mengikuti transaksi manual jenis MASUK pada periode berjalan</p>
            </div>
            {readOnly ? null : <Link to="/manual" className="text-xs font-bold text-accent">Buka Transaksi</Link>}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] text-muted">Jumlah Barang Masuk</p>
              <p className="mt-1 text-lg font-black text-amber-600">{data.monthIn.qty}</p>
              <p className="mt-1 text-[9px] text-muted">{data.monthIn.nota} transaksi</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] text-muted">Estimasi Nilai Modal</p>
              <p className="num mt-1 text-sm font-black">{rupiah(data.monthIn.nilai)}</p>
              <p className="mt-1 text-[9px] text-muted">Berdasarkan harga beli master barang</p>
            </div>
          </div>
          {data.recentIn.length === 0 ? <p className="py-5 text-center text-xs text-muted">Belum ada transaksi manual barang masuk pada bulan berjalan.</p> : (
            <ul>
              {data.recentIn.map((item, index) => (
                <li key={`${item.nama}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{item.nama}</p>
                    <p className="truncate text-[10px] text-muted">{item.tujuan} · Manual</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-emerald-600">+{item.qty} {item.satuan}</p>
                    <p className="text-[9px] text-muted">{when(item.tanggal)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
          <h3 className="font-extrabold">Arus Kas Hari Ini</h3>
          <p className="mt-1 text-[11px] text-muted">Ringkasan nominal operasional</p>
          <div className="mt-4 space-y-2.5">
            <Mini label="Penjualan Tunai" value={rupiah(data.today.tunai)} />
            <Mini label="Transfer" value={rupiah(data.today.transfer)} />
            <Mini label="Pengeluaran Kas" value={rupiah(data.today.cashOut)} danger />
            <Mini label="Tambahan Modal" value={rupiah(data.today.cashIn)} />
          </div>
        </section>
        <section className="rounded-xl border border-line bg-panel p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold">Stok Menipis & Perlu Perhatian</h3>
              <p className="mt-1 text-[11px] text-muted">Barang yang sebaiknya segera diperiksa / dibeli</p>
            </div>
            <Link to="/barang" className="text-xs font-bold text-accent">Lihat Stok</Link>
          </div>
          {data.low.length === 0 ? <p className="py-6 text-center text-xs font-semibold text-emerald-600">Semua stok dalam kondisi aman.</p> : (
            <div className="grid gap-2 md:grid-cols-2">
              {data.low.map((item) => {
                const habis = item.stok <= 0;
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{item.nama}</p>
                      <p className="truncate font-mono text-[10px] text-muted">{item.partNumber || "-"}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black ${habis ? "text-danger" : "text-orange-500"}`}>{item.stok} {item.satuan}</p>
                      <span className={`text-[10px] font-bold ${habis ? "text-danger" : "text-warn"}`}>{habis ? "HABIS" : "KRITIS"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Chart({ data, max, title, hint, className = "" }: { data: NonNullable<Awaited<ReturnType<typeof getDashboard>>>; max: number; title: string; hint: string; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel p-5 shadow-sm ${className}`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-extrabold">{title}</h3>
          <p className="mt-1 text-[11px] text-muted">{hint}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-muted uppercase">Total 7 Hari</p>
          <p className="num text-lg font-black text-blue-600">{rupiah(data.week.reduce((sum, day) => sum + day.total, 0))}</p>
        </div>
      </div>
      <ul className="space-y-4">
        {data.week.map((day) => (
          <li key={day.date} className="grid grid-cols-[4.2rem_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500">{dayLabel(day.date)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (day.total / max) * 100)}%` }} />
            </span>
            <span className="num text-right text-[11px] font-bold">{rupiah(day.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopProducts({ items, compact = false }: { items: Array<{ nama: string; satuan: string; qty: number; total: number }>; compact?: boolean }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-extrabold">Barang Terlaris</h3>
          <p className="mt-1 text-[11px] text-muted">{compact ? "30 hari terakhir" : "Produk dengan penjualan tertinggi dalam 30 hari terakhir"}</p>
        </div>
        {compact ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-600">TOP 5</span> : <Link to="/riwayat" className="text-xs font-bold text-accent">Lihat Riwayat</Link>}
      </div>
      {items.length === 0 ? <p className="py-8 text-center text-xs text-muted">Belum ada data penjualan.</p> : (
        <div className={compact ? "space-y-2" : "grid gap-2 md:grid-cols-2"}>
          {items.map((item, index) => (
            <div key={`${item.nama}-${index}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="grid size-7 place-items-center rounded-full bg-blue-600 text-xs font-black text-white">{index + 1}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{item.nama}</p>
                <p className="mt-0.5 text-[10px] text-muted">{item.qty} {item.satuan} · <span className="font-bold text-emerald-600">{rupiah(item.total)}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "ok" | "danger" | "warn" | "info" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "danger" ? "text-rose-600" : tone === "warn" ? "text-orange-500" : tone === "info" ? "text-blue-600" : "text-ink";
  return (
    <section className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <p className="text-[9px] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className={`num mt-2 text-sm leading-tight font-black break-words sm:text-lg ${color}`}>{value}</p>
      <p className="mt-1 text-[9px] text-muted">{hint}</p>
    </section>
  );
}

function Mini({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <b className={danger ? "text-rose-600" : "text-slate-800"}>{value}</b>
    </div>
  );
}
