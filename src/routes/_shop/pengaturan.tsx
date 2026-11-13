import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { confirmDialog } from "@/lib/confirm";
import { ExpandButton, ExpandGroup } from "@/components/ui/button-7";
import { Field, inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { addPajak, changeOwnPassword, deletePajak, listKategoriBarang, listMasters, listStaff, revealPassword, saveBank, savePajak, saveShopProfile, saveStaff, updateOwnProfile } from "@/lib/shop/api";
import { setShopProfile } from "@/lib/shop/print";
import type { Bank, Staff } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/pengaturan")({ component: SettingsPage });

type PajakRow = { id: number; jenis: string; persentase: string; aktif: boolean };

function isLainnya(jenis: string) {
  return jenis.trim().toLowerCase() === "lainnya";
}

const emptyAccount = { username: "", name: "", role: "Kasir", shift: "", password: "", status: "Aktif", photo: "", existing: false, canManageStaff: false };

function SettingsPage() {
  const me = Route.useRouteContext().me;
  const router = useRouter();
  const [pajak, setPajak] = useState<PajakRow[]>([]);
  const [kategoriBarang, setKategoriBarang] = useState<string[]>([]);
  const [newPajak, setNewPajak] = useState({ jenis: [] as string[], persentase: "" });
  const [jenisQ, setJenisQ] = useState("");
  const [pajakBusy, setPajakBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // Password akun yang sedang ditampilkan (Admin 1). null = belum tersimpan; hilang saat halaman dimuat ulang.
  const [shownPw, setShownPw] = useState<Record<string, string | null>>({});
  const [banks, setBanks] = useState<Bank[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shop, setShop] = useState({ nama: "MURIA JAYA SAKTI", alamat: "Jl. Raja Alam RT.13 No.22", telepon: "0852-4717-7445", tagline: "INTEGRATED BUSINESS SYSTEM", logo: "", icon: "" });
  const [bank, setBank] = useState({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" });
  const [account, setAccount] = useState(emptyAccount);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ownName, setOwnName] = useState(me.name);
  const [ownPhoto, setOwnPhoto] = useState(me.photo || "");

  function load() {
    void listMasters().then((res) => {
      setPajak(res.pajak.map((item) => ({ id: item.id, jenis: item.jenis, persentase: String(item.persentase), aktif: item.aktif })));
      setBanks(res.banks);
      if (res.profile) {
        setShop({ ...res.profile, icon: res.profile.icon ?? "" });
        setShopProfile(res.profile);
      }
    }).catch((err: Error) => toast.error(err.message));
    if (me.role !== "Staf") void listKategoriBarang().then(setKategoriBarang).catch(() => undefined);
    if (me.canManageStaff) void listStaff().then(setStaff);
  }
  useEffect(() => { load(); }, []);

  const lainnyaPersen = pajak.find((item) => isLainnya(item.jenis))?.persentase ?? "11";
  const kategoriTanpaJenis = useMemo(() => {
    const names = pajak.filter((item) => item.aktif && !isLainnya(item.jenis) && item.jenis.trim()).map((item) => item.jenis.trim().toLowerCase());
    return kategoriBarang.filter((kategori) => !names.some((name) => kategori.toLowerCase().includes(name)));
  }, [pajak, kategoriBarang]);

  function togglePassword(username: string) {
    if (username in shownPw) {
      setShownPw((prev) => { const copy = { ...prev }; delete copy[username]; return copy; });
      return;
    }
    void revealPassword({ data: { username } })
      .then((res) => setShownPw((prev) => ({ ...prev, [username]: res.password })))
      .catch((err: Error) => toast.error(err.message));
  }

  function simpanPajak() {
    setPajakBusy(true);
    void savePajak({ data: { items: pajak.map((item) => ({ id: item.id, persentase: item.persentase, aktif: item.aktif })) } })
      .then(() => { toast.success("Master pajak berhasil disimpan", { description: "Berlaku untuk transaksi berikutnya. Nota lama tidak berubah." }); load(); })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setPajakBusy(false));
  }

  function tambahPajak() {
    const daftar = newPajak.jenis;
    if (daftar.length === 0) return;
    setPajakBusy(true);
    void (async () => {
      const gagal: string[] = [];
      let berhasil = 0;
      for (const jenis of daftar) {
        try { await addPajak({ data: { jenis, persentase: newPajak.persentase } }); berhasil += 1; }
        catch (err) { gagal.push(`${jenis}: ${(err as Error).message}`); }
      }
      if (berhasil > 0) toast.success(berhasil === 1 ? "Jenis pajak ditambahkan" : `${berhasil} jenis pajak ditambahkan`, { description: `${daftar.filter((j) => !gagal.some((g) => g.startsWith(`${j}:`))).join(", ")} (${newPajak.persentase}%)` });
      if (gagal.length > 0) toast.error("Sebagian gagal ditambahkan", { description: gagal.join(" | ") });
      setNewPajak({ jenis: gagal.length ? daftar.filter((j) => gagal.some((g) => g.startsWith(`${j}:`))) : [], persentase: gagal.length ? newPajak.persentase : "" });
      setJenisQ("");
      load();
      setPajakBusy(false);
    })();
  }

  async function hapusPajak(item: PajakRow) {
    if (!(await confirmDialog(`Hapus jenis pajak "${item.jenis}"? Barang dengan kategori ini akan memakai persentase "Lainnya". Nota lama tidak berubah.`, { title: "Hapus jenis pajak?", danger: true }))) return;
    setPajakBusy(true);
    void deletePajak({ data: { id: item.id } })
      .then(() => { toast.success("Jenis pajak dihapus", { description: item.jenis }); load(); })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setPajakBusy(false));
  }

  // Hanya Admin 1 yang melihat pengaturan sistem dan password. Akun lain (Staf, Admin lain, Owner) hanya mengubah nama dan foto akunnya.
  const akunSaja = !me.canManageStaff;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel>
        <h2 className="text-lg font-extrabold">{akunSaja ? "Akun Saya" : "Pengaturan Sistem & Data"}</h2>
      </Panel>
      {me.role !== "Kasir" && !akunSaja ? (
        <Panel>
          <h2 className="font-extrabold">Identitas Toko</h2>
          <p className="mt-1 text-xs text-muted">Nama, alamat, nomor, dan logo ini dipakai di menu, halaman masuk, struk/cetakan, ikon tab browser (favicon), ikon notifikasi, dan nama aplikasi. Ikon yang sudah terpasang di layar utama HP baru berganti setelah aplikasi dipasang ulang.</p>
          <form className="mt-3 space-y-2" onSubmit={(e) => {
            e.preventDefault();
            void saveShopProfile({ data: shop }).then(() => {
              setShopProfile(shop);
              toast.success("Identitas toko berhasil disimpan", { description: "Logo, ikon tab browser, halaman masuk, menu, struk, dan notifikasi sudah memakai identitas baru." });
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
                  void makeBrandImages(file).then(({ logo, icon }) => setShop((prev) => ({ ...prev, logo, icon }))).catch((err: Error) => toast.error(err.message));
                }} />
              </label>
              {shop.logo ? <button type="button" className="text-xs text-danger" onClick={() => setShop({ ...shop, logo: "", icon: "" })}>Pakai logo bawaan</button> : null}
            </div>
            <Field label="Nama toko"><input className={inputClass} value={shop.nama} onChange={(e) => setShop({ ...shop, nama: e.target.value })} /></Field>
            <Field label="Alamat"><input className={inputClass} value={shop.alamat} onChange={(e) => setShop({ ...shop, alamat: e.target.value })} /></Field>
            <Field label="No. HP / telepon"><input className={inputClass} value={shop.telepon} onChange={(e) => setShop({ ...shop, telepon: e.target.value })} /></Field>
            <Field label="Baris bawah nama"><input className={inputClass} value={shop.tagline} onChange={(e) => setShop({ ...shop, tagline: e.target.value })} /></Field>
            <PrimaryButton type="submit">Simpan Identitas Toko</PrimaryButton>
          </form>
        </Panel>
      ) : null}
      {!akunSaja ? (<>
      <Panel>
        <h2 className="font-extrabold">Master Persentase Pajak Internal</h2>
        <p className="mt-1 text-xs text-muted">Nama jenis dicocokkan dengan Kategori barang (jenis "Oli" juga berlaku untuk kategori "Oli Mesin"). Kategori yang tidak punya jenis sendiri memakai "Lainnya". Perubahan berlaku untuk transaksi berikutnya; nota lama tidak berubah.</p>
        <div className="mt-3 space-y-2">
          {pajak.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className={item.aktif ? "" : "text-muted line-through"}>{item.jenis}{!item.aktif ? <span className="ml-2 text-[10px] font-bold no-underline">Nonaktif</span> : null}</span>
              <span className="flex items-center gap-2">
                {me.role !== "Kasir" && !isLainnya(item.jenis) ? (
                  <>
                    <label className="flex items-center gap-1 text-[11px] text-muted"><input type="checkbox" checked={item.aktif} onChange={(e) => setPajak((prev) => prev.map((row) => row.id === item.id ? { ...row, aktif: e.target.checked } : row))} />Aktif</label>
                    <button type="button" className="grid size-9 place-items-center rounded-lg text-danger hover:bg-red-50" aria-label={`Hapus ${item.jenis}`} onClick={() => void hapusPajak(item)}><Trash2 className="size-4" /></button>
                  </>
                ) : null}
                <input className="num h-11 w-24 rounded-lg border border-line px-2 text-right" inputMode="decimal" aria-label={`Persentase ${item.jenis}`} readOnly={me.role === "Kasir"} value={item.persentase} onChange={(e) => setPajak((prev) => prev.map((row) => row.id === item.id ? { ...row, persentase: e.target.value.replace(/[^0-9.,]/g, "") } : row))} />
              </span>
            </div>
          ))}
        </div>
        {me.role !== "Kasir" ? <PrimaryButton className="mt-3" disabled={pajakBusy} onClick={simpanPajak}>Simpan Master Pajak</PrimaryButton> : null}
        {(me.role !== "Kasir" || kategoriTanpaJenis.length > 0) ? (
          <form className="mt-4 rounded-xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); tambahPajak(); }}>
            <p className="text-sm font-bold">{me.role !== "Kasir" ? "Tambah jenis pajak baru" : "Kategori yang memakai \"Lainnya\""}</p>
            <p className="text-xs text-muted">Kategori di bawah ini belum punya persentase sendiri sehingga memakai "Lainnya" ({lainnyaPersen}%).{me.role !== "Kasir" ? " Pilih satu atau beberapa kategori, isi persen, lalu Tambah." : ""}</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Field label={me.role !== "Kasir" ? "Nama jenis (kategori)" : "Daftar kategori"}>
                  <details className="relative" id="jenis-pajak-dropdown">
                    <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-sm">
                      <span className="truncate">
                        {me.role === "Kasir"
                          ? `${kategoriTanpaJenis.length} kategori memakai "Lainnya"`
                          : newPajak.jenis.length === 0
                            ? `Pilih kategori (${kategoriTanpaJenis.length} memakai "Lainnya")`
                            : newPajak.jenis.length <= 2 ? newPajak.jenis.join(", ") : `${newPajak.jenis.length} kategori dipilih`}
                      </span>
                      <span className="shrink-0 text-slate-600">▾</span>
                    </summary>
                    <div className="absolute left-0 top-12 z-20 w-full min-w-[300px] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
                      <div className="space-y-2 border-b border-line bg-white p-3">
                        <input
                          className="h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-blue-500"
                          placeholder="Cari nama kategori..."
                          value={jenisQ}
                          maxLength={40}
                          onChange={(e) => setJenisQ(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                        />
                        {me.role !== "Kasir" && newPajak.jenis.length > 0 ? (
                          <button type="button" className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-danger hover:bg-red-100" onClick={() => setNewPajak((prev) => ({ ...prev, jenis: [] }))}>Hapus pilihan</button>
                        ) : null}
                      </div>
                      {me.role !== "Kasir" && newPajak.jenis.length > 0 ? (
                        <div className="border-b border-line bg-blue-50/60 px-3 py-2">
                          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">Dipilih ({newPajak.jenis.length})</p>
                          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                            {newPajak.jenis.map((item) => (
                              <button key={`sel-${item}`} type="button" title="Klik untuk batal pilih" className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700" onClick={() => setNewPajak((prev) => ({ ...prev, jenis: prev.jenis.filter((v) => v !== item) }))}>
                                {item} <span className="opacity-80">×</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="max-h-52 space-y-0.5 overflow-y-auto p-2">
                        {(() => {
                          const qq = jenisQ.trim().toLowerCase();
                          const filtered = qq ? kategoriTanpaJenis.filter((item) => item.toLowerCase().includes(qq)) : kategoriTanpaJenis;
                          const dipilih = new Set(newPajak.jenis.map((v) => v.toLowerCase()));
                          const ordered = [...filtered.filter((i) => dipilih.has(i.toLowerCase())), ...filtered.filter((i) => !dipilih.has(i.toLowerCase()))];
                          const bisaPakaiKetikan = me.role !== "Kasir" && qq !== "" && !kategoriBarang.some((k) => k.toLowerCase() === qq) && !pajak.some((p) => p.jenis.trim().toLowerCase() === qq) && !dipilih.has(qq);
                          return (
                            <>
                              {bisaPakaiKetikan ? (
                                <button type="button" className="w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-blue-800 hover:bg-blue-50" onClick={() => { setNewPajak((prev) => ({ ...prev, jenis: [...prev.jenis, jenisQ.trim()] })); setJenisQ(""); }}>+ Pakai nama "{jenisQ.trim()}"</button>
                              ) : null}
                              {ordered.length === 0 && !bisaPakaiKetikan ? <p className="px-2 py-4 text-center text-xs text-slate-600">Tidak ada kategori cocok</p> : null}
                              {ordered.map((item) => {
                                const checked = dipilih.has(item.toLowerCase());
                                return me.role !== "Kasir" ? (
                                  <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 ${checked ? "bg-blue-50 font-semibold text-blue-800" : ""}`}>
                                    <input type="checkbox" checked={checked} onChange={(e) => setNewPajak((prev) => ({ ...prev, jenis: e.target.checked ? [...prev.jenis, item] : prev.jenis.filter((v) => v.toLowerCase() !== item.toLowerCase()) }))} />
                                    <span>{item}</span>
                                  </label>
                                ) : <p key={item} className="px-2 py-2 text-sm">{item}</p>;
                              })}
                            </>
                          );
                        })()}
                      </div>
                      <div className="border-t border-line bg-slate-50 p-3">
                        <button type="button" className="h-10 w-full rounded-lg bg-slate-800 text-sm font-bold text-white hover:bg-slate-900" onClick={() => { const el = document.getElementById("jenis-pajak-dropdown") as HTMLDetailsElement | null; if (el) el.open = false; setJenisQ(""); }}>
                          {me.role !== "Kasir" ? `OK — Pilih (${newPajak.jenis.length})` : "Tutup"}
                        </button>
                      </div>
                    </div>
                  </details>
                </Field>
              </div>
              {me.role !== "Kasir" ? (
                <>
                  <div className="w-28"><Field label="Persen (%)"><input className={`${inputClass} text-right`} inputMode="decimal" value={newPajak.persentase} onChange={(e) => setNewPajak({ ...newPajak, persentase: e.target.value.replace(/[^0-9.,]/g, "") })} /></Field></div>
                  <PrimaryButton type="submit" disabled={pajakBusy || newPajak.jenis.length === 0 || !newPajak.persentase}><Plus className="size-4" />Tambah</PrimaryButton>
                </>
              ) : null}
            </div>
          </form>
        ) : null}
      </Panel>
      <Panel>
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Master Bank / Rekening</h2>
          {me.role !== "Kasir" ? <ExpandGroup align="end"><ExpandButton variant="primary" icon={<Plus />} label="Tambah" onClick={() => { setBank({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" }); setBankOpen(true); }} /></ExpandGroup> : null}
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
                  <td>{me.role !== "Kasir" ? <ExpandGroup align="end"><ExpandButton icon={<Pencil />} label="Edit" onClick={() => { setBank(item); setBankOpen(true); }} /></ExpandGroup> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      </>) : null}
      <Panel>
        <h2 className="font-extrabold">Nama dan Foto Akun</h2>
        <p className="text-xs text-muted">{akunSaja ? "Ubah nama dan foto akun Anda. Password diatur oleh Admin 1." : "Ubah nama Owner, Admin, atau Kasir yang sedang masuk. Password tidak ditampilkan di halaman login."}</p>
        {me.mustChange && !akunSaja ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Password akun ini masih bawaan. Ganti di bagian "Ubah Password" di bawah.</p> : null}
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
            .then(() => { toast.success("Profil berhasil diperbarui"); window.location.reload(); })
            .catch((err: Error) => toast.error(err.message));
        }}>
          <Field label="Nama tampilan"><input className={inputClass} value={ownName} onChange={(e) => setOwnName(e.target.value)} /></Field>
          <PrimaryButton type="submit">Simpan Nama dan Foto</PrimaryButton>
        </form>
      </Panel>
      {!akunSaja ? <Panel id="ubah-password">
        <h2 className="font-extrabold">Ubah Password</h2>
        <p className="text-xs text-muted">Untuk akun yang sedang masuk ({me.name} · {me.username}). Halaman Pengaturan hanya untuk Admin 1. Akun lain minta ganti password ke Admin 1 lewat Manajemen Semua Akun.</p>
        <form className="mt-3 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (!current) { toast.error("Isi password saat ini."); return; }
          if (next.length < 4) { toast.error("Password baru minimal 4 karakter."); return; }
          if (next !== confirm) { toast.error("Konfirmasi password tidak sama."); return; }
          setPwBusy(true);
          void changeOwnPassword({ data: { current, next } })
            .then(() => { toast.success("Password berhasil diganti"); setCurrent(""); setNext(""); setConfirm(""); void router.invalidate(); })
            .catch((err: Error) => toast.error(err.message))
            .finally(() => setPwBusy(false));
        }}>
          <Field label="Password Saat Ini"><input className={inputClass} type={showPw ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="Password Baru"><input className={inputClass} type={showPw ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Konfirmasi Password"><input className={inputClass} type={showPw ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />Tampilkan password</label>
          <PrimaryButton type="submit" disabled={pwBusy}>{pwBusy ? "Menyimpan..." : "Ubah Password Saya"}</PrimaryButton>
        </form>
      </Panel> : null}
      {me.canManageStaff ? (
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold">Manajemen Semua Akun</h2>
            <ExpandGroup align="end"><ExpandButton variant="primary" icon={<Plus />} label="Akun baru" onClick={() => { setAccount(emptyAccount); setAccountOpen(true); }} /></ExpandGroup>
          </div>
          <p className="text-xs text-muted">Ubah nama, foto, dan password. Klik ikon mata untuk melihat password akun; password akun lama baru bisa dilihat setelah diatur ulang sekali lewat Edit Akun. Password tidak tertulis di halaman login.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] text-muted uppercase"><tr><th className="py-2">Nama</th><th>Username</th><th>Role</th><th>Shift</th><th>Status</th><th>Password</th><th></th></tr></thead>
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
                    <td>{item.role}{item.canManageStaff ? <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">Admin 1</span> : null}</td>
                    <td>{item.shift || "-"}</td>
                    <td>{item.status}</td>
                    <td className="whitespace-nowrap">
                      {item.username in shownPw ? (
                        shownPw[item.username] ? <span className="mr-2 rounded bg-slate-100 px-2 py-1 font-mono text-xs">{shownPw[item.username]}</span> : <span className="mr-2 text-[11px] text-amber-700">Belum tersimpan, atur ulang lewat Edit Akun</span>
                      ) : null}
                      <button type="button" className="inline-grid size-8 place-items-center rounded-lg text-accent hover:bg-blue-50" aria-label={item.username in shownPw ? `Sembunyikan password ${item.username}` : `Lihat password ${item.username}`} title={item.username in shownPw ? "Sembunyikan password" : "Lihat password"} onClick={() => togglePassword(item.username)}>{item.username in shownPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                    </td>
                    <td><ExpandGroup align="end"><ExpandButton icon={<Pencil />} label="Edit Akun" onClick={() => { setAccount({ username: item.username, name: item.name, role: item.role, shift: item.shift, password: "", status: item.status, photo: item.photo || "", existing: true, canManageStaff: Boolean(item.canManageStaff) }); setAccountOpen(true); }} /></ExpandGroup></td>
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
            void saveBank({ data: bank }).then(() => { toast.success(bank.id ? "Rekening bank berhasil diubah" : "Rekening bank berhasil ditambahkan", { description: bank.nama }); setBankOpen(false); setBank({ id: 0, nama: "", rekening: "", atasNama: "", aktif: true, keterangan: "" }); load(); }).catch((err: Error) => toast.error(err.message));
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
      {accountOpen && me.canManageStaff ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4">
          <form className="my-6 w-full max-w-lg rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            void saveStaff({ data: account }).then(() => {
              toast.success("Akun berhasil disimpan", { description: account.name || account.username });
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
                <option>Admin</option><option>Owner</option><option>Kasir</option><option value="Staf">Staf (pengecek barang)</option>
              </select>
            </Field>
            {account.role === "Kasir" ? (
              <Field label="Shift">
                <select className={inputClass} value={account.shift} onChange={(e) => setAccount({ ...account, shift: e.target.value })}>
                  <option value="">Tidak ada shift</option>
                  <option>Kasir Pagi</option>
                  <option>Kasir Siang</option>
                </select>
              </Field>
            ) : null}
            {account.role === "Staf" ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Staf hanya bisa melihat Daftar Sparepart (tanpa harga beli, hanya tombol Detail) dan memakai Chat Staff.</p> : null}
            {account.role === "Admin" ? (
              <label className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input type="checkbox" className="mt-1" checked={account.canManageStaff} onChange={(e) => setAccount({ ...account, canManageStaff: e.target.checked })} />
                <span><b>Admin 1</b> — boleh menambah dan mengatur akun lain<span className="block text-xs text-muted">Kosongkan untuk Admin 2: semua fitur Admin sama, kecuali kelola akun.</span></span>
              </label>
            ) : null}
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
    </div>
  );
}

/** Logo dibuat persegi (transparan) untuk tampilan aplikasi, dan ikon persegi berlatar putih untuk favicon / layar utama HP / notifikasi. */
function makeBrandImages(file: File) {
  return new Promise<{ logo: string; icon: string }>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!image.width || !image.height) {
        reject(new Error("Format gambar tidak didukung. Pakai PNG atau JPG."));
        return;
      }
      function draw(size: number, solid: boolean, fill: number) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        if (solid) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
        }
        const box = size * fill;
        const scale = Math.min(box / image.width, box / image.height);
        const width = Math.max(1, image.width * scale);
        const height = Math.max(1, image.height * scale);
        ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        return canvas.toDataURL("image/png");
      }
      let logo = "";
      for (const size of [256, 192, 128]) {
        logo = draw(size, false, 1);
        if (logo && logo.length <= 400000) break;
      }
      let icon = "";
      for (const size of [512, 256, 192]) {
        icon = draw(size, true, 0.86);
        if (icon && icon.length <= 400000) break;
      }
      if (!logo || !icon || logo.length > 400000 || icon.length > 400000) {
        reject(new Error("Logo terlalu besar atau rumit. Pilih gambar logo yang lebih sederhana."));
        return;
      }
      resolve({ logo, icon });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Logo tidak bisa dibaca. Pakai PNG atau JPG."));
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
