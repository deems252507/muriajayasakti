import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { changeOwnPassword, listMasters, listStaff, saveBank, savePajak, saveShopProfile, saveStaff, updateOwnProfile } from "@/lib/shop/api";
import { setShopProfile } from "@/lib/shop/print";
import type { Bank, Pajak, Staff } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/pengaturan")({ component: SettingsPage });

const emptyAccount = { username: "", name: "", role: "Kasir", shift: "", password: "", status: "Aktif", photo: "", existing: false };

function SettingsPage() {
  const me = Route.useRouteContext().me;
  const [pajak, setPajak] = useState<Pajak[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shop, setShop] = useState({ nama: "MURIA JAYA SAKTI", alamat: "Jl. Raja Alam RT.13 No.22", telepon: "0852-4717-7445", tagline: "INTEGRATED BUSINESS SYSTEM", logo: "" });
  const [bank, setBank] = useState({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" });
  const [account, setAccount] = useState(emptyAccount);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ownName, setOwnName] = useState(me.name);
  const [ownPhoto, setOwnPhoto] = useState(me.photo || "");

  function load() {
    void listMasters().then((res) => {
      setPajak(res.pajak);
      setBanks(res.banks);
      if (res.profile) {
        setShop(res.profile);
        setShopProfile(res.profile);
      }
    });
    if (me.role === "Admin") void listStaff().then(setStaff);
  }
  useEffect(() => { load(); }, []);

  if (me.role === "Owner") return <Panel><p>Halaman ini untuk operasional Admin/Kasir. Akun Owner hanya melihat laporan.</p></Panel>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel>
        <h2 className="text-lg font-extrabold">Pengaturan Sistem & Data</h2>
      </Panel>
      {me.role !== "Kasir" ? (
        <Panel>
          <h2 className="font-extrabold">Identitas Toko</h2>
          <p className="mt-1 text-xs text-muted">Nama, alamat, nomor, dan logo ini dipakai di menu, halaman masuk, dan struk.</p>
          <form className="mt-3 space-y-2" onSubmit={(e) => {
            e.preventDefault();
            void saveShopProfile({ data: shop }).then(() => {
              setShopProfile(shop);
              toast.success("Identitas toko disimpan. Menu dan halaman masuk memakai data ini.");
            }).catch((err: Error) => toast.error(err.message));
          }}>
            <div className="flex items-center gap-3">
              <img src={shop.logo || "/brand/logo.png"} alt="" className="h-16 w-16 rounded-2xl bg-slate-100 object-contain p-1" />
              <label className="text-sm font-bold text-accent">
                Ganti logo
                <input className="hidden" type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void shrinkLogo(file).then((logo) => setShop((prev) => ({ ...prev, logo }))).catch((err: Error) => toast.error(err.message));
                }} />
              </label>
              {shop.logo ? <button type="button" className="text-xs text-danger" onClick={() => setShop({ ...shop, logo: "" })}>Pakai logo bawaan</button> : null}
            </div>
            <Field label="Nama toko"><input className={inputClass} value={shop.nama} onChange={(e) => setShop({ ...shop, nama: e.target.value })} /></Field>
            <Field label="Alamat"><input className={inputClass} value={shop.alamat} onChange={(e) => setShop({ ...shop, alamat: e.target.value })} /></Field>
            <Field label="No. HP / telepon"><input className={inputClass} value={shop.telepon} onChange={(e) => setShop({ ...shop, telepon: e.target.value })} /></Field>
            <Field label="Baris bawah nama"><input className={inputClass} value={shop.tagline} onChange={(e) => setShop({ ...shop, tagline: e.target.value })} /></Field>
            <PrimaryButton type="submit">Simpan Identitas Toko</PrimaryButton>
          </form>
        </Panel>
      ) : null}
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
        {me.role !== "Kasir" ? <PrimaryButton className="mt-3" onClick={() => void savePajak({ data: { items: pajak.map((item) => ({ id: item.id, persentase: Number(item.persentase) })) } }).then(() => toast.success("Pajak disimpan"))}>Simpan Master Pajak</PrimaryButton> : null}
      </Panel>
      <Panel>
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Master Bank / Rekening</h2>
          {me.role !== "Kasir" ? <button className="text-xs font-bold text-accent" onClick={() => { setBank({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" }); setBankOpen(true); }}>+ Tambah</button> : null}
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
                  <td>{me.role !== "Kasir" ? <button className="text-xs font-bold text-accent" onClick={() => { setBank(item); setBankOpen(true); }}>Edit</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel>
        <h2 className="font-extrabold">Nama dan Foto Akun</h2>
        <p className="text-xs text-muted">Ubah nama Owner, Admin, atau Kasir yang sedang masuk. Password tidak ditampilkan di halaman login.</p>
        {me.mustChange ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Password akun ini masih bawaan. Ganti di bagian bawah halaman ini.</p> : null}
        <div className="mt-3 flex items-center gap-3">
          {ownPhoto ? <img src={ownPhoto} alt="" className="size-16 rounded-full object-cover ring-1 ring-line" /> : <span className="grid size-16 place-items-center rounded-full bg-blue-100 text-lg font-bold text-accent">{ownName.slice(0, 1).toUpperCase()}</span>}
          <label className="cursor-pointer text-xs font-bold text-accent">
            Pilih foto
            <input className="hidden" type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void shrinkPhoto(file).then(setOwnPhoto).catch((err: Error) => toast.error(err.message));
            }} />
          </label>
          {ownPhoto ? <button className="text-xs text-danger" onClick={() => setOwnPhoto("")}>Hapus foto</button> : null}
        </div>
        <form className="mt-3 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          void updateOwnProfile({ data: { name: ownName, photo: ownPhoto } })
            .then(() => { toast.success("Nama dan foto disimpan"); window.location.reload(); })
            .catch((err: Error) => toast.error(err.message));
        }}>
          <Field label="Nama tampilan"><input className={inputClass} value={ownName} onChange={(e) => setOwnName(e.target.value)} /></Field>
          <PrimaryButton type="submit">Simpan Nama dan Foto</PrimaryButton>
        </form>
      </Panel>
      {me.role !== "Kasir" ? (
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold">Manajemen Semua Akun</h2>
            <button className="text-xs font-bold text-accent" onClick={() => { setAccount(emptyAccount); setAccountOpen(true); }}>+ Akun baru</button>
          </div>
          <p className="text-xs text-muted">Ubah nama, foto, dan password. Password baru tidak akan tertulis di halaman login.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Nama</th><th>Username</th><th>Role</th><th>Shift</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {staff.map((item) => (
                  <tr key={item.username} className="border-t border-line">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {item.photo ? <img src={item.photo} alt="" className="size-8 rounded-full object-cover" /> : <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-[11px] font-bold">{item.name.slice(0, 1).toUpperCase()}</span>}
                        <span>{item.name}{item.mustChange ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Password bawaan</span> : null}</span>
                      </div>
                    </td>
                    <td>{item.username}</td>
                    <td>{item.role}</td>
                    <td>{item.shift || "-"}</td>
                    <td>{item.status}</td>
                    <td><button className="text-xs font-bold text-accent" onClick={() => { setAccount({ username: item.username, name: item.name, role: item.role, shift: item.shift, password: "", status: item.status, photo: item.photo || "", existing: true }); setAccountOpen(true); }}>Edit Akun</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {bankOpen && me.role !== "Kasir" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form className="w-full max-w-lg rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            void saveBank({ data: bank }).then(() => { toast.success("Bank disimpan"); setBankOpen(false); setBank({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" }); load(); }).catch((err: Error) => toast.error(err.message));
          }}>
            <h3 className="font-extrabold">{bank.id ? "Edit bank" : "Tambah bank"}</h3>
            <div className="mt-3 grid gap-2">
              <input className={inputClass} placeholder="Nama bank" value={bank.nama} onChange={(e) => setBank({ ...bank, nama: e.target.value })} />
              <input className={inputClass} placeholder="Rekening" value={bank.rekening} onChange={(e) => setBank({ ...bank, rekening: e.target.value })} />
              <input className={inputClass} placeholder="Atas nama" value={bank.atasNama} onChange={(e) => setBank({ ...bank, atasNama: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bank.aktif} onChange={(e) => setBank({ ...bank, aktif: e.target.checked })} /> Aktif</label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setBankOpen(false)}>Batal</button>
              <PrimaryButton type="submit">Simpan</PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
      {accountOpen && me.role !== "Kasir" ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4">
          <form className="my-6 w-full max-w-lg rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            void saveStaff({ data: account }).then(() => {
              toast.success("Akun disimpan");
              setAccountOpen(false);
              load();
            }).catch((err: Error) => toast.error(err.message));
          }}>
            <h3 className="font-extrabold">{account.existing ? "Edit akun" : "Akun baru"}</h3>
            <div className="mt-3 space-y-2">
            <div className="flex items-center gap-3">
              {account.photo ? <img src={account.photo} alt="" className="size-14 rounded-full object-cover" /> : <span className="grid size-14 place-items-center rounded-full bg-slate-100 font-bold">{(account.name || "?").slice(0, 1).toUpperCase()}</span>}
              <label className="cursor-pointer text-xs font-bold text-accent">
                Tambah foto
                <input className="hidden" type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void shrinkPhoto(file).then((photo) => setAccount((prev) => ({ ...prev, photo }))).catch((err: Error) => toast.error(err.message));
                }} />
              </label>
              {account.photo ? <button type="button" className="text-xs text-danger" onClick={() => setAccount({ ...account, photo: "" })}>Hapus foto</button> : null}
            </div>
            <Field label="Nama Lengkap"><input className={inputClass} value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} /></Field>
            <Field label="Username"><input className={inputClass} value={account.username} disabled={account.existing} onChange={(e) => setAccount({ ...account, username: e.target.value })} /></Field>
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
            <Field label="Password baru"><input className={inputClass} type="password" placeholder={account.existing ? "Kosongkan jika tidak diganti" : "Wajib untuk akun baru"} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAccountOpen(false)}>Batal</button>
              <PrimaryButton type="submit">Simpan</PrimaryButton>
            </div>
            </div>
          </form>
        </div>
      ) : null}
      <Panel>
        <h2 className="font-extrabold">Ubah Password</h2>
        <p className="text-xs text-muted">Untuk akun yang sedang masuk ({me.name} · {me.username}). Password tidak ditampilkan di halaman login.</p>
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

function shrinkLogo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 256;
      const scale = Math.min(max / image.width, max / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Logo tidak bisa diproses"));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Logo tidak bisa dibaca"));
    };
    image.src = url;
  });
}

function shrinkPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Foto tidak bisa diproses"));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Foto tidak bisa dibaca"));
    };
    image.src = url;
  });
}
