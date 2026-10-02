import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { addCashMove, closeShift, deleteCashMove, listShifts, openShift, shiftLedger } from "@/lib/shop/api";
import { digits, grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import type { Shift, Staff } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/kas")({ component: KasPage });

function KasPage() {
  const me = Route.useRouteContext().me;
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [drawers, setDrawers] = useState<Record<string, number>>({});
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selected, setSelected] = useState("");
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof shiftLedger>> | null>(null);
  const [kasAwal, setKasAwal] = useState("");
  const [cashier, setCashier] = useState("");
  const [target, setTarget] = useState("Kasir Pagi");
  const [counted, setCounted] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [ket, setKet] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function refresh() {
    void listShifts().then((res) => {
      setShifts(res.shifts);
      setDrawers(res.drawers);
      setStaff(res.staff.filter((item) => item.role === "Kasir" && item.status === "Aktif"));
      const active = res.shifts.find((s) => s.status === "AKTIF" && (me.role !== "Kasir" || s.username === me.username));
      setSelected((prev) => prev || active?.id || res.shifts[0]?.id || "");
    });
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!selected) return;
    void shiftLedger({ data: { shiftId: selected } }).then(setLedger);
  }, [selected]);

  const invoices = (ledger?.invoices ?? []) as Array<Record<string, unknown>>;
  const moves = (ledger?.moves ?? []) as Array<Record<string, unknown>>;
  const returs = (ledger?.returs ?? []) as Array<Record<string, unknown>>;
  const drawer = selected ? Number(drawers[selected] ?? ledger?.drawer ?? 0) : 0;
  const awal = Number(ledger?.shift?.kasAwal ?? 0);
  const tunai = invoices.filter((i) => i.status_bayar === "Lunas" && i.metode_bayar === "Tunai").reduce((s, i) => s + Number(i.bayar_tunai) - Number(i.kembalian), 0);
  const transfer = invoices.reduce((s, i) => {
    if (i.status_bayar !== "Lunas") return s;
    if (i.metode_bayar === "Transfer") return s + Number(i.total);
    if (i.metode_bayar === "Split") return s + Number(i.transfer_amount);
    return s;
  }, 0);
  const bon = invoices.filter((i) => i.status_bayar === "Bon").reduce((s, i) => s + Number(i.total), 0);
  const masukKas = moves.filter((m) => m.jenis === "MASUK").reduce((s, m) => s + Number(m.jumlah), 0);
  const keluarKas = moves.filter((m) => m.jenis === "KELUAR").reduce((s, m) => s + Number(m.jumlah), 0);
  const returKeluar = returs.filter((r) => r.payment_direction === "REFUND" && r.metode_bayar !== "Transfer").reduce((s, r) => s + Number(r.cash_amount), 0);
  const returMasuk = returs.filter((r) => r.payment_direction === "ADDITIONAL_PAYMENT" && r.metode_bayar !== "Transfer").reduce((s, r) => s + Number(r.cash_amount), 0);
  const uangMasuk = tunai + masukKas + returMasuk;
  const uangKeluar = keluarKas + returKeluar;
  const selisih = counted === "" ? null : digits(counted) - drawer;
  const archives = useMemo(() => shifts.filter((s) => s.status !== "AKTIF").filter((s) => {
    const day = (s.end || s.start).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }), [shifts, from, to]);
  const cards = ["Kasir Pagi", "Kasir Siang"].map((name) => {
    const mine = shifts.filter((s) => s.shift === name);
    const active = mine.find((s) => s.status === "AKTIF") ?? null;
    return { name, active, latest: active || mine[0] || null };
  });

  function reloadLedger() {
    if (selected) void shiftLedger({ data: { shiftId: selected } }).then(setLedger);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800">Manajemen Kas Kasir</h2>
          <p className="text-xs text-muted">Pantau uang kas berdasarkan shift tanpa menghitung transaksi secara manual.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="h-10 rounded-lg border border-line px-3 text-xs font-semibold" onClick={() => { refresh(); reloadLedger(); }}>Perbarui</button>
          {shifts.length > 1 ? (
            <select className="h-10 rounded-lg border border-line px-3 text-xs font-semibold" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.shift} · {shift.cashierName} · {shift.status}</option>)}
            </select>
          ) : null}
        </div>
      </div>

      {me.role === "Admin" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Panel key={card.name}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${card.active ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />
                    <h4 className="font-extrabold">{card.name}</h4>
                  </div>
                  <p className={`mt-2 text-xs font-bold ${card.active ? "text-emerald-700" : "text-slate-500"}`}>{card.active ? `AKTIF • ${card.active.cashierName}` : "BELUM AKTIF"}</p>
                  {card.latest ? <p className="mt-1 text-[11px] text-muted">Mulai: {when(card.latest.start)}</p> : null}
                </div>
                {card.active ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">ONLINE</span> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50" disabled={!card.latest} onClick={() => card.latest && setSelected(card.latest.id)}>Pantau Shift</button>
                <button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white" onClick={() => setTarget(card.name)}>Buka / Ganti</button>
                {card.active ? <button className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700" onClick={() => setSelected(card.active!.id)}>Tutup Shift</button> : null}
              </div>
            </Panel>
          ))}
        </div>
      ) : null}

      {me.role === "Admin" ? (
        <Panel>
          <div className="grid gap-3 md:grid-cols-2">
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              void openShift({ data: { shift: target, username: cashier, kasAwal: digits(kasAwal) } })
                .then(() => { toast.success("Shift dibuka"); setKasAwal(""); refresh(); })
                .catch((err: Error) => toast.error(err.message));
            }}>
              <h3 className="text-sm font-extrabold">Buka / Ganti Shift</h3>
              <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option>Kasir Pagi</option>
                <option>Kasir Siang</option>
              </select>
              <select className={inputClass} value={cashier} onChange={(e) => setCashier(e.target.value)}>
                <option value="">Pilih kasir</option>
                {staff.map((item) => <option key={item.username} value={item.username}>{item.name}</option>)}
              </select>
              <input className={`${inputClass} num`} placeholder="Kas awal" value={kasAwal} onChange={(e) => setKasAwal(grouped(digits(e.target.value)))} />
              <PrimaryButton type="submit">Buka Shift</PrimaryButton>
            </form>
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (!selected || !confirm("Tutup shift ini?")) return;
              void closeShift({ data: { id: selected, countedCash: counted === "" ? null : digits(counted) } })
                .then((res) => { toast.success(`Ditutup. Kas akhir ${rupiah(res.kasAkhir)}`); setCounted(""); refresh(); })
                .catch((err: Error) => toast.error(err.message));
            }}>
              <h3 className="text-sm font-extrabold">Tutup Shift</h3>
              <input className={`${inputClass} num`} placeholder="Kas fisik yang dihitung" value={counted} onChange={(e) => setCounted(grouped(digits(e.target.value)))} />
              <PrimaryButton type="submit" className="bg-red-600 hover:bg-red-700">Tutup dan arsip</PrimaryButton>
            </form>
          </div>
        </Panel>
      ) : null}

      {me.role === "Admin" ? (
        <Panel>
          <h3 className="font-extrabold">Arsip Shift Selesai</h3>
          <p className="mt-1 text-xs text-muted">Riwayat shift yang sudah ditutup. Gunakan filter tanggal untuk mencari arsip.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="text-xs text-muted">Dari Tanggal<input className={`${inputClass} mt-1`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs text-muted">Sampai Tanggal<input className={`${inputClass} mt-1`} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button className="mt-5 h-11 rounded-lg border border-line px-3 text-xs" onClick={() => { setFrom(""); setTo(""); }}>Semua Tanggal</button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] tracking-wide text-muted uppercase"><tr><th className="py-2">Shift</th><th>Kasir</th><th>Mulai</th><th>Selesai</th><th className="text-right">Kas Akhir</th><th></th></tr></thead>
              <tbody>
                {archives.length === 0 ? <tr><td colSpan={6} className="py-4 text-center text-muted">Tidak ada arsip shift pada filter tanggal tersebut.</td></tr> : null}
                {archives.map((shift) => (
                  <tr key={shift.id} className="border-t border-line">
                    <td className="py-2">{shift.shift}</td>
                    <td>{shift.cashierName}</td>
                    <td className="text-xs">{when(shift.start)}</td>
                    <td className="text-xs">{when(shift.end)}</td>
                    <td className="num text-right">{rupiah(shift.kasAkhir ?? 0)}</td>
                    <td className="text-right"><button className="text-xs font-bold text-accent" onClick={() => setSelected(shift.id)}>Lihat</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {me.role === "Kasir" && !shifts.some((s) => s.status === "AKTIF" && s.username === me.username) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Shift Anda belum aktif. Silakan hubungi Admin untuk membuka shift.</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Kas Awal" hint="Modal awal shift" value={rupiah(awal)} />
        <Kpi title="Uang Masuk Laci" hint="Tunai + tambahan kas" value={rupiah(uangMasuk)} tone="ok" />
        <Kpi title="Uang Keluar Laci" hint="Retur tunai + pengeluaran" value={rupiah(uangKeluar)} tone="danger" />
        <Kpi title="Kas Seharusnya" hint="Kas awal + pergerakan laci" value={rupiah(drawer)} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Tag title="Penjualan Tunai" hint="Menambah uang fisik" badge="CASH" value={rupiah(tunai)} />
        <Tag title="Transfer / QRIS" hint="Tidak masuk laci fisik" badge="BANK" value={rupiah(transfer)} />
        <Tag title="Bon / Piutang" hint="Belum menjadi uang kas" badge="BON" value={rupiah(bon)} />
      </div>
      <Panel>
        <h3 className="font-extrabold">Cara membaca kas</h3>
        <p className="mt-2 text-sm">Kas Awal + Uang Masuk − Uang Keluar = <b>Kas Seharusnya di Laci</b>. Transfer/QRIS dan Bon ditampilkan terpisah karena bukan uang fisik di laci.</p>
        <p className="mt-1 text-xs text-muted">Angka laci memakai rumus shift yang sama dengan transaksi: tunai bersih, tambahan kas, pengeluaran, dan selisih retur tunai.</p>
      </Panel>

      <Panel className="overflow-x-auto">
        <h3 className="font-extrabold">Arus Kas Shift</h3>
        <p className="text-xs text-muted">Semua pergerakan uang fisik yang memengaruhi laci kasir.</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[11px] tracking-wide text-muted uppercase"><tr><th className="py-2">Waktu / Ref</th><th>Jenis</th><th>Metode</th><th className="text-right">Masuk</th><th className="text-right">Keluar</th></tr></thead>
          <tbody>
            {invoices.map((inv) => {
              const cash = inv.status_bayar === "Lunas" && (inv.metode_bayar === "Tunai" || inv.metode_bayar === "Split") ? Number(inv.bayar_tunai) - Number(inv.kembalian) : 0;
              return (
                <tr key={String(inv.nomor)} className="border-t border-line">
                  <td className="py-2">{when(String(inv.tanggal))}<div className="text-xs text-muted">{String(inv.nomor)}</div></td>
                  <td>Penjualan</td>
                  <td>{String(inv.metode_bayar)}{inv.bank_transfer ? <span className="block text-indigo-600">{String(inv.bank_transfer)}</span> : null}</td>
                  <td className="num text-right text-emerald-700">{cash > 0 ? `+ ${rupiah(cash)}` : "-"}</td>
                  <td className="num text-right">-</td>
                </tr>
              );
            })}
            {moves.map((move) => (
              <tr key={String(move.id)} className="border-t border-line">
                <td className="py-2">{when(String(move.tanggal))}<div className="text-xs text-muted">{String(move.keterangan)}</div></td>
                <td>{String(move.jenis) === "MASUK" ? "Tambahan Kas" : "Pengeluaran"}</td>
                <td>Tunai</td>
                <td className="num text-right text-emerald-700">{String(move.jenis) === "MASUK" ? `+ ${rupiah(Number(move.jumlah))}` : "-"}</td>
                <td className="num text-right text-rose-600">{String(move.jenis) === "KELUAR" ? `- ${rupiah(Number(move.jumlah))}` : "-"}</td>
                {me.role === "Admin" ? <td><button className="text-xs text-danger" onClick={() => void deleteCashMove({ data: { id: Number(move.id) } }).then(() => { refresh(); reloadLedger(); })}>Hapus</button></td> : null}
              </tr>
            ))}
            {returs.map((retur) => {
              const keluar = retur.payment_direction === "REFUND" && retur.metode_bayar !== "Transfer" ? Number(retur.cash_amount) : 0;
              const masuk = retur.payment_direction === "ADDITIONAL_PAYMENT" && retur.metode_bayar !== "Transfer" ? Number(retur.cash_amount) : 0;
              return (
                <tr key={String(retur.id)} className="border-t border-line">
                  <td className="py-2">{when(String(retur.tanggal))}<div className="text-xs text-muted">{String(retur.id)} · {String(retur.parent_invoice)}</div></td>
                  <td>Retur</td>
                  <td>{String(retur.metode_bayar)}</td>
                  <td className="num text-right text-emerald-700">{masuk ? `+ ${rupiah(masuk)}` : "-"}</td>
                  <td className="num text-right text-rose-600">{keluar ? `- ${rupiah(keluar)}` : "-"}</td>
                </tr>
              );
            })}
            {invoices.length + moves.length + returs.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-muted">Belum ada arus kas pada shift ini.</td></tr> : null}
          </tbody>
        </table>
      </Panel>

      {me.role !== "Kasir" && selected ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <h3 className="font-extrabold">Tambah Kas</h3>
            <p className="text-xs text-muted">Masukkan uang tambahan ke laci.</p>
            <form className="mt-3 space-y-2" onSubmit={(e) => {
              e.preventDefault();
              void addCashMove({ data: { jenis: "MASUK", jumlah: digits(jumlah), keterangan: ket || "Tambahan kas", shiftId: selected } })
                .then(() => { toast.success("Kas masuk"); setJumlah(""); setKet(""); refresh(); reloadLedger(); })
                .catch((err: Error) => toast.error(err.message));
            }}>
              <input className={`${inputClass} num`} placeholder="Jumlah" value={jumlah} onChange={(e) => setJumlah(grouped(digits(e.target.value)))} />
              <input className={inputClass} placeholder="Keterangan" value={ket} onChange={(e) => setKet(e.target.value)} />
              <PrimaryButton type="submit">+ Tambah</PrimaryButton>
            </form>
          </Panel>
          <Panel>
            <h3 className="font-extrabold">Pengeluaran Kas</h3>
            <p className="text-xs text-muted">Uang yang diambil dari laci.</p>
            <form className="mt-3 space-y-2" onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const nilai = digits((form.elements.namedItem("nilai") as HTMLInputElement).value);
              const note = (form.elements.namedItem("note") as HTMLInputElement).value;
              void addCashMove({ data: { jenis: "KELUAR", jumlah: nilai, keterangan: note || "Pengeluaran", shiftId: selected } })
                .then(() => { toast.success("Pengeluaran tersimpan"); form.reset(); refresh(); reloadLedger(); })
                .catch((err: Error) => toast.error(err.message));
            }}>
              <input name="nilai" className={`${inputClass} num`} placeholder="Jumlah" />
              <input name="note" className={inputClass} placeholder="Keterangan" />
              <PrimaryButton type="submit" className="bg-red-600 hover:bg-red-700">+ Pengeluaran</PrimaryButton>
            </form>
          </Panel>
        </div>
      ) : null}

      <Panel>
        <h3 className="font-extrabold">Rekonsiliasi Shift</h3>
        <p className="text-xs text-muted">Gunakan angka ini saat menghitung uang fisik sebelum ganti shift.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-muted">Kas Seharusnya</p><p className="num text-lg font-black">{rupiah(drawer)}</p></div>
          <label className="text-xs text-muted">Kas Fisik (opsional)
            <input className={`${inputClass} num mt-1`} value={counted} onChange={(e) => setCounted(grouped(digits(e.target.value)))} placeholder="0" />
          </label>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] text-muted">Selisih</p>
            <p className={`num text-lg font-black ${selisih == null ? "" : selisih >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{selisih == null ? "-" : `${selisih > 0 ? "LEBIH " : selisih < 0 ? "KURANG " : ""}${rupiah(Math.abs(selisih))}`}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">Tanggal acuan {todayInput()} WITA.</p>
      </Panel>
    </div>
  );
}

function Kpi({ title, hint, value, tone }: { title: string; hint: string; value: string; tone?: "ok" | "danger" }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{title}</p>
      <p className={`num mt-2 text-xl font-black ${tone === "ok" ? "text-emerald-600" : tone === "danger" ? "text-rose-600" : ""}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </section>
  );
}

function Tag({ title, hint, badge, value }: { title: string; hint: string; badge: string; value: string }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold">{title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{badge}</span>
      </div>
      <p className="num mt-2 text-lg font-black">{value}</p>
      <p className="text-[11px] text-muted">{hint}</p>
    </section>
  );
}
