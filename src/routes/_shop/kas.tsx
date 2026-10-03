import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PeriodPicker } from "@/components/shop/period";
import { inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { addCashMove, closeShift, deleteCashMove, deleteClosedShift, listShifts, openShift, shiftLedger } from "@/lib/shop/api";
import { digits, grouped, rupiah, todayInput, when } from "@/lib/shop/format";
import { printShiftReport } from "@/lib/shop/print";
import type { Shift, Staff } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/kas")({ component: KasPage });

function KasPage() {
  const me = Route.useRouteContext().me;
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [drawers, setDrawers] = useState<Record<string, number>>({});
  const [staff, setStaff] = useState<Staff[]>([]);
  const [arsip, setArsip] = useState<Shift | null>(null);
  const [selected, setSelected] = useState("");
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof shiftLedger>> | null>(null);
  const [kasAwal, setKasAwal] = useState("");
  const [cashier, setCashier] = useState("");
  const [target, setTarget] = useState("Kasir Pagi");
  const [counted, setCounted] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [keluarJumlah, setKeluarJumlah] = useState("");
  const [keluarKet, setKeluarKet] = useState("");
  const [ket, setKet] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function refresh() {
    void listShifts().then((res) => {
      setShifts(res.shifts);
      setDrawers(res.drawers);
      setStaff(res.staff.filter((item) => item.role === "Kasir" && item.status === "Aktif"));
      const active = res.shifts.find((s) => s.status === "AKTIF" && (me.role !== "Kasir" || s.username === me.username));
      setSelected((prev) => {
        const current = res.shifts.find((s) => s.id === prev);
        if (current?.status === "AKTIF") return prev;
        return active?.id || "";
      });
    });
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!selected) {
      setLedger(null);
      return;
    }
    void shiftLedger({ data: { shiftId: selected } }).then(setLedger);
  }, [selected]);

  const invoices = (ledger?.invoices ?? []) as Array<Record<string, unknown>>;
  const moves = (ledger?.moves ?? []) as Array<Record<string, unknown>>;
  const returs = (ledger?.returs ?? []) as Array<Record<string, unknown>>;
  const drawer = selected ? Number(drawers[selected] ?? ledger?.drawer ?? 0) : 0;
  const awal = Number(ledger?.shift?.kasAwal ?? 0);
  const tunai = invoices.filter((i) => i.status_bayar === "Lunas" && (i.metode_bayar === "Tunai" || i.metode_bayar === "Split")).reduce((s, i) => s + Number(i.bayar_tunai) - Number(i.kembalian), 0);
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

  function pantau(id: string) {
    setSelected(id);
    setArsip(null);
  }

  function lihat(id: string) {
    const shift = shifts.find((item) => item.id === id) ?? null;
    if (!shift || shift.status !== "SELESAI") {
      toast.error("Arsip shift tidak ditemukan.");
      return;
    }
    setSelected(id);
    setArsip(shift);
  }

  function hapusArsip(shift: Shift) {
    if (!confirm(`Hapus arsip ${shift.shift} milik ${shift.cashierName}? Nota, kas, retur, dan laporan harian tidak ikut dihapus.`)) return;
    void deleteClosedShift({ data: { id: shift.id } })
      .then(() => {
        toast.success("Arsip shift dihapus");
        if (selected === shift.id) setSelected("");
        if (arsip?.id === shift.id) setArsip(null);
        refresh();
      })
      .catch((err: Error) => toast.error(err.message));
  }

  async function cetakShift(id: string) {
    const data = await shiftLedger({ data: { shiftId: id } });
    const live = (data?.shift as Shift | undefined) ?? shifts.find((item) => item.id === id);
    if (!live) return toast.error("Shift tidak ditemukan.");
    const list = (data?.invoices ?? []) as Array<Record<string, unknown>>;
    const moveList = (data?.moves ?? []) as Array<Record<string, unknown>>;
    const returList = (data?.returs ?? []) as Array<Record<string, unknown>>;
    const tunaiNota = list.filter((i) => i.status_bayar === "Lunas" && (i.metode_bayar === "Tunai" || i.metode_bayar === "Split")).reduce((s, i) => s + Number(i.bayar_tunai) - Number(i.kembalian), 0);
    const transferNota = list.reduce((s, i) => {
      if (i.status_bayar !== "Lunas") return s;
      if (i.metode_bayar === "Transfer") return s + Number(i.total);
      if (i.metode_bayar === "Split") return s + Number(i.transfer_amount);
      return s;
    }, 0);
    const bonNota = list.filter((i) => i.status_bayar === "Bon").reduce((s, i) => s + Number(i.total), 0);
    const masuk = moveList.filter((m) => m.jenis === "MASUK").reduce((s, m) => s + Number(m.jumlah), 0);
    const keluar = moveList.filter((m) => m.jenis === "KELUAR").reduce((s, m) => s + Number(m.jumlah), 0);
    const returKeluar = returList.filter((r) => r.payment_direction === "REFUND" && r.metode_bayar !== "Transfer").reduce((s, r) => s + Number(r.cash_amount), 0);
    const returMasuk = returList.filter((r) => r.payment_direction === "ADDITIONAL_PAYMENT" && r.metode_bayar !== "Transfer").reduce((s, r) => s + Number(r.cash_amount), 0);
    printShiftReport({
      shift: live.shift,
      kasir: live.cashierName,
      status: live.status,
      mulai: when(live.start),
      selesai: when(live.end),
      kasAwal: Number(data?.shift?.kasAwal ?? live.kasAwal ?? 0),
      penjualanTunai: tunaiNota,
      uangMasuk: tunaiNota + masuk + returMasuk,
      uangKeluar: keluar + returKeluar,
      transfer: transferNota,
      bon: bonNota,
      kasAkhir: Number(data?.drawer ?? live.kasAkhir ?? 0),
      closedBy: live.closedBy || live.cashierName,
      invoices: list,
      moves: moveList,
      returs: returList,
    });
  }

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
          {shifts.some((shift) => shift.status === "AKTIF") ? (
            <select className="h-10 rounded-lg border border-line px-3 text-xs font-semibold" value={shifts.some((shift) => shift.id === selected && shift.status === "AKTIF") ? selected : ""} onChange={(e) => { setArsip(null); setSelected(e.target.value); }}>
              {shifts.filter((shift) => shift.status === "AKTIF").map((shift) => <option key={shift.id} value={shift.id}>{shift.shift} · {shift.cashierName} · AKTIF</option>)}
            </select>
          ) : null}
        </div>
      </div>

      {me.role !== "Kasir" ? (
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
              <div className="relative z-10 mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button type="button" className="bg-blue-600 text-white" onClick={() => {
                  if (!card.active) {
                    setSelected("");
                    setArsip(null);
                    setLedger(null);
                    toast.success(`${card.name} belum aktif. Transaksi berjalan 0. Angka lama ada di arsip.`);
                    return;
                  }
                  pantau(card.active.id);
                  document.getElementById("arus-kas")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>Pantau Shift</button>
                <button type="button" className="bg-emerald-600 text-white" onClick={() => {
                  setTarget(card.name);
                  document.getElementById("buka-shift")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}>Buka / Ganti</button>
                <button type="button" className="bg-red-600 text-white disabled:cursor-not-allowed" disabled={!card.active} onClick={() => {
                  if (!card.active) return;
                  setSelected(card.active.id);
                  document.getElementById("tutup-shift")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  toast.success("Isi uang fisik, lalu klik Tutup dan arsip.");
                }}>Tutup Shift</button>
              </div>
              <p className="mt-3 text-xs text-muted">{card.active ? "Shift ini masih berjalan. Angka di bawah adalah transaksi shift aktif." : "Sudah ditutup. Transaksi berjalan 0 sampai shift baru dibuka."}</p>
            </Panel>
          ))}
        </div>
      ) : null}

      {me.role !== "Kasir" ? (
        <Panel>
          <div className="grid gap-3 md:grid-cols-2">
            <form id="buka-shift" className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              void openShift({ data: { shift: target, username: cashier, kasAwal: digits(kasAwal) } })
                .then((res) => {
                  const modal = digits(kasAwal);
                  const nama = target.replace(/^Kasir\s+/i, "");
                  toast.success(`Shift ${nama} dibuka. Transaksi mulai dari ${rupiah(modal)} uang kas masuk.`);
                  setKasAwal("");
                  if (res?.id) setSelected(res.id);
                  refresh();
                })
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
            <form id="tutup-shift" className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              const aktif = shifts.find((item) => item.id === selected && item.status === "AKTIF");
              if (!aktif) return toast.error("Tidak ada shift aktif untuk ditutup.");
              if (!confirm(`Tutup ${aktif.shift} milik ${aktif.cashierName} dan arsipkan?`)) return;
              void closeShift({ data: { id: aktif.id, countedCash: counted === "" ? null : digits(counted) } })
                .then(async () => {
                  toast.success("Shift ditutup dan diarsip. Transaksi berjalan kembali ke 0.");
                  setCounted("");
                  setSelected("");
                  setArsip(null);
                  setLedger(null);
                  try { await cetakShift(aktif.id); } catch (error) { toast.error(error instanceof Error ? error.message : "Laporan tidak terbuka. Izinkan popup."); }
                  refresh();
                })
                .catch((err: Error) => toast.error(err.message));
            }}>
              <h3 className="text-sm font-extrabold">Tutup Shift</h3>
              <input className={`${inputClass} num`} placeholder="Kas fisik yang dihitung" value={counted} onChange={(e) => setCounted(grouped(digits(e.target.value)))} />
              <PrimaryButton type="submit" className="w-full bg-red-600 hover:bg-red-700">Tutup dan arsip</PrimaryButton>
            </form>
          </div>
        </Panel>
      ) : null}

      {me.role !== "Kasir" ? (
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-extrabold">Arsip Shift Selesai</h3>
              <p className="mt-1 text-xs text-muted">Riwayat shift yang sudah ditutup. Gunakan filter tanggal untuk mencari arsip.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{archives.length} arsip</span>
          </div>
          <div className="mt-3">
            <PeriodPicker start={from} end={to} onChange={(nextStart, nextEnd) => { setFrom(nextStart); setTo(nextEnd); }} />
            <button className="mt-2 h-11 rounded-lg border border-line px-3 text-xs" onClick={() => { setFrom(""); setTo(""); }}>Semua Tanggal</button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] tracking-wide text-muted uppercase"><tr><th className="py-2">Shift</th><th>Kasir</th><th>Mulai</th><th>Selesai</th><th className="text-right">Kas Akhir</th><th></th></tr></thead>
              <tbody>
                {archives.length === 0 ? <tr><td colSpan={6} className="py-4 text-center text-muted">Tidak ada arsip shift pada filter tanggal tersebut.</td></tr> : null}
                {archives.map((shift) => (
                  <tr key={shift.id} className={selected === shift.id ? "bg-blue-50" : ""}>
                    <td className="py-2">{shift.shift}</td>
                    <td>{shift.cashierName}</td>
                    <td className="text-xs">{when(shift.start)}</td>
                    <td className="text-xs">{when(shift.end)}</td>
                    <td className="num text-right">{rupiah(drawers[shift.id] ?? shift.kasAkhir ?? 0)}</td>
                    <td className="text-right">
                      <button className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700" onClick={() => lihat(shift.id)}>Lihat</button>
                      <button className="ml-2 rounded-md bg-slate-800 px-2 py-1 text-xs font-bold text-white" onClick={() => void cetakShift(shift.id).catch((err: Error) => toast.error(err.message))}>Cetak</button>
                      <button className="ml-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-danger" onClick={() => hapusArsip(shift)}>Hapus</button>
                    </td>
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
        <Kpi title="Kas Awal" hint={ledger?.shift ? `Modal saat shift ${ledger.shift.shift} dibuka` : "Belum ada shift"} value={rupiah(awal)} />
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

      <Panel id="arus-kas" className="overflow-x-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold">Arus Kas Shift</h3>
            <p className="text-xs text-muted">{ledger?.shift ? `${ledger.shift.shift} · ${ledger.shift.cashierName} · ${ledger.shift.status}` : "Belum ada shift yang dipilih."} {ledger?.shift?.status === "SELESAI" ? "Ini arsip. Kas awal yang diisi saat buka shift tetap dihitung. Transaksi baru mulai dari 0 setelah shift baru dibuka." : ledger?.shift ? "Kas awal + uang masuk − uang keluar = kas seharusnya." : "Buka shift dan isi kas awal. Selama belum ada penjualan, kas di laci sama dengan kas awal itu."}</p>
          </div>
          {selected ? <button className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white" onClick={() => void cetakShift(selected).catch((err: Error) => toast.error(err.message))}>Cetak PDF Shift</button> : null}
        </div>
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
                <td>{me.role !== "Kasir" ? <button className="btn-tight border border-red-200 bg-red-50 text-danger" onClick={() => { if (!confirm(`Hapus transaksi kas ${move.keterangan || "ini"}? Laporan kas akan ikut menyesuaikan.`)) return; void deleteCashMove({ data: { id: Number(move.id) } }).then(() => { refresh(); reloadLedger(); }).catch((error: Error) => toast.error(error.message)); }}>Hapus</button> : null}</td>
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
              if (!ket.trim() || digits(jumlah) <= 0) return toast.error("Isi jumlah dan keterangan, contoh: tambahan dari owner.");
              void addCashMove({ data: { jenis: "MASUK", jumlah: digits(jumlah), keterangan: ket.trim(), shiftId: selected } })
                .then(() => { toast.success("Kas masuk"); setJumlah(""); setKet(""); refresh(); reloadLedger(); })
                .catch((err: Error) => toast.error(err.message));
            }}>
              <input className={`${inputClass} num`} placeholder="Jumlah, contoh 100.000" value={jumlah} onChange={(e) => setJumlah(grouped(digits(e.target.value)))} />
              <input className={inputClass} placeholder="Keterangan, contoh: tambahan dari owner" value={ket} onChange={(e) => setKet(e.target.value)} />
              <PrimaryButton type="submit">+ Tambah</PrimaryButton>
            </form>
          </Panel>
          <Panel>
            <h3 className="font-extrabold">Pengeluaran Kas</h3>
            <p className="text-xs text-muted">Uang yang diambil dari laci.</p>
            <form className="mt-3 space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (digits(keluarJumlah) <= 0 || !keluarKet.trim()) return toast.error("Isi jumlah dan keterangan, contoh: beli makan.");
              void addCashMove({ data: { jenis: "KELUAR", jumlah: digits(keluarJumlah), keterangan: keluarKet.trim(), shiftId: selected } })
                .then(() => { toast.success("Pengeluaran tersimpan"); setKeluarJumlah(""); setKeluarKet(""); refresh(); reloadLedger(); })
                .catch((err: Error) => toast.error(err.message));
            }}>
              <input className={`${inputClass} num`} placeholder="Jumlah, contoh 10.000" value={keluarJumlah} onChange={(e) => setKeluarJumlah(grouped(digits(e.target.value)))} />
              <input className={inputClass} placeholder="Keterangan, contoh: beli makan" value={keluarKet} onChange={(e) => setKeluarKet(e.target.value)} />
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
      {arsip ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-panel p-4">
            <h3 className="font-extrabold">Detail Arsip Shift</h3>
            <p className="mt-1 text-sm">{arsip.shift} · {arsip.cashierName}</p>
            <p className="text-xs text-muted">Mulai {when(arsip.start)} · Selesai {when(arsip.end)} · {arsip.status}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">Kasir<b className="mt-1 block">{arsip.cashierName}</b></div>
              <div className="rounded-lg bg-slate-50 p-3">Status<b className="mt-1 block">{arsip.status}</b></div>
              <div className="rounded-lg bg-slate-50 p-3">Mulai<b className="mt-1 block text-xs">{when(arsip.start)}</b></div>
              <div className="rounded-lg bg-slate-50 p-3">Selesai<b className="mt-1 block text-xs">{when(arsip.end)}</b></div>
              <div className="rounded-lg bg-blue-50 p-3">Kas awal<b className="mt-1 block">{rupiah(arsip.kasAwal)}</b></div>
              <div className="rounded-lg bg-emerald-50 p-3">Kas akhir<b className="mt-1 block">{rupiah(ledger?.shift?.id === arsip.id ? drawer : arsip.kasAkhir ?? 0)}</b></div>
            </div>
            <div className="mt-3 rounded-xl border border-line p-3 text-sm">
              <p className="font-bold">Ringkasan Keuangan Shift</p>
              {ledger?.shift?.id === arsip.id ? (
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <p className="flex justify-between gap-3"><span className="text-muted">Uang masuk</span><b>{rupiah(uangMasuk)}</b></p>
                  <p className="flex justify-between gap-3"><span className="text-muted">Uang keluar</span><b>{rupiah(uangKeluar)}</b></p>
                  <p className="flex justify-between gap-3"><span className="text-muted">Penjualan tunai</span><b>{rupiah(tunai)}</b></p>
                  <p className="flex justify-between gap-3"><span className="text-muted">Refund tunai</span><b>{rupiah(returKeluar)}</b></p>
                </div>
              ) : <p className="mt-2 text-xs text-muted">Memuat rincian...</p>}
              <p className="mt-2 text-[11px] text-muted">{invoices.length} nota · {moves.length} arus kas · {returs.length} retur</p>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => setArsip(null)}>Tutup</button>
              <button className="h-11 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-danger" onClick={() => hapusArsip(arsip)}>Hapus</button>
              <button className="h-11 rounded-lg bg-slate-800 px-3 text-sm font-bold text-white" onClick={() => void cetakShift(arsip.id).catch((err: Error) => toast.error(err.message))}>Cetak Shift</button>
            </div>
          </div>
        </div>
      ) : null}
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
