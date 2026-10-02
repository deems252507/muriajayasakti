import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { changeOwnPassword, listMasters, listStaff, saveBank, savePajak, saveStaff } from "@/lib/shop/api";
import type { Bank, Pajak, Staff } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/pengaturan")({ component: SettingsPage });

function SettingsPage() {
  const me = Route.useRouteContext().me;
  const [pajak, setPajak] = useState<Pajak[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [bank, setBank] = useState({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" });
  const [account, setAccount] = useState({ username: "", name: "", role: "Kasir", shift: "", password: "", status: "Aktif" });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function load() {
    void listMasters().then((res) => { setPajak(res.pajak); setBanks(res.banks); });
    if (me.role === "Admin") void listStaff().then(setStaff);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel>
        <h2 className="text-lg font-extrabold">Pengaturan Sistem & Data</h2>
      </Panel>
      <Panel>
        <h2 className="font-extrabold">Master Persentase Pajak Internal</h2>
        <div className="mt-3 space-y-2">
          {pajak.map((item) => (
            <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{item.jenis}</span>
              <input className="num h-11 w-24 rounded-lg border border-line px-2 text-right" value={item.persentase} onChange={(e) => setPajak((prev) => prev.map((row) => row.id === item.id ? { ...row, persentase: Number(e.target.value) } : row))} />
            </label>
          ))}
        </div>
        {me.role === "Admin" ? <PrimaryButton className="mt-3" onClick={() => void savePajak({ data: { items: pajak.map((item) => ({ id: item.id, persentase: Number(item.persentase) })) } }).then(() => toast.success("Pajak disimpan"))}>Simpan Master Pajak</PrimaryButton> : null}
      </Panel>
      <Panel>
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Master Bank / Rekening</h2>
          {me.role === "Admin" ? <button className="text-xs font-bold text-accent" onClick={() => setBank({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" })}>+ Tambah</button> : null}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Bank / Metode</th><th>Rekening</th><th>Atas Nama</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {banks.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="py-2">{item.nama}</td>
                  <td>{item.rekening || "-"}</td>
                  <td>{item.atasNama || "-"}</td>
                  <td>{item.aktif ? "Aktif" : "Nonaktif"}</td>
                  <td>{me.role === "Admin" ? <button className="text-xs font-bold text-accent" onClick={() => setBank(item)}>Edit</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {me.role === "Admin" ? (
          <form className="mt-3 grid gap-2 md:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            void saveBank({ data: bank }).then(() => { toast.success("Bank disimpan"); setBank({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" }); load(); }).catch((err: Error) => toast.error(err.message));
          }}>
            <input className={inputClass} placeholder="Nama bank" value={bank.nama} onChange={(e) => setBank({ ...bank, nama: e.target.value })} />
            <input className={inputClass} placeholder="Rekening" value={bank.rekening} onChange={(e) => setBank({ ...bank, rekening: e.target.value })} />
            <input className={inputClass} placeholder="Atas nama" value={bank.atasNama} onChange={(e) => setBank({ ...bank, atasNama: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bank.aktif} onChange={(e) => setBank({ ...bank, aktif: e.target.checked })} /> Aktif</label>
            <PrimaryButton type="submit">{bank.id ? "Simpan Perubahan" : "Tambah"}</PrimaryButton>
          </form>
        ) : null}
      </Panel>
      {me.role === "Admin" ? (
        <Panel>
          <h2 className="font-extrabold">Manajemen Semua Akun (Khusus Admin)</h2>
          <p className="text-xs text-muted">Kelola nama, username, role, shift, status, dan password akun.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Nama</th><th>Username</th><th>Role</th><th>Shift</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {staff.map((item) => (
                  <tr key={item.username} className="border-t border-line">
                    <td className="py-2">{item.name}</td>
                    <td>{item.username}</td>
                    <td>{item.role}</td>
                    <td>{item.shift || "-"}</td>
                    <td>{item.status}</td>
                    <td><button className="text-xs font-bold text-accent" onClick={() => setAccount({ username: item.username, name: item.name, role: item.role, shift: item.shift, password: "", status: item.status })}>Edit Akun</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="mt-4 space-y-2" onSubmit={(e) => {
            e.preventDefault();
            void saveStaff({ data: account }).then(() => { toast.success("Akun disimpan"); load(); }).catch((err: Error) => toast.error(err.message));
          }}>
            <p className="text-sm font-semibold">Perbarui data akun tanpa mengubah data transaksi.</p>
            <Field label="Nama Lengkap"><input className={inputClass} value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} /></Field>
            <Field label="Username"><input className={inputClass} value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} /></Field>
            <Field label="Role">
              <select className={inputClass} value={account.role} onChange={(e) => setAccount({ ...account, role: e.target.value })}>
                <option>Admin</option><option>Owner</option><option>Kasir</option>
              </select>
            </Field>
            <Field label="Shift">
              <select className={inputClass} value={account.shift} onChange={(e) => setAccount({ ...account, shift: e.target.value })}>
                <option value="">Tidak ada shift</option>
                <option>Kasir Pagi</option>
                <option>Kasir Siang</option>
              </select>
            </Field>
            <Field label="Status Akun">
              <select className={inputClass} value={account.status} onChange={(e) => setAccount({ ...account, status: e.target.value })}>
                <option>Aktif</option><option>Nonaktif</option>
              </select>
            </Field>
            <Field label="Password Baru (opsional)"><input className={inputClass} type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></Field>
            <PrimaryButton type="submit">Simpan Perubahan</PrimaryButton>
          </form>
        </Panel>
      ) : null}
      <Panel>
        <h2 className="font-extrabold">Akun Saya (Ubah Password)</h2>
        <p className="text-xs text-muted">Ubah password akun Anda yang sedang login saat ini ({me.username}).</p>
        <form className="mt-3 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (next !== confirm) {
            toast.error("Konfirmasi password tidak sama.");
            return;
          }
          void changeOwnPassword({ data: { current, next } }).then(() => { toast.success("Password diganti"); setCurrent(""); setNext(""); setConfirm(""); }).catch((err: Error) => toast.error(err.message));
        }}>
          <Field label="Password Saat Ini"><input className={inputClass} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="Password Baru"><input className={inputClass} type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Konfirmasi Password"><input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <PrimaryButton type="submit">Ubah Password Saya</PrimaryButton>
        </form>
      </Panel>
    </div>
  );
}
