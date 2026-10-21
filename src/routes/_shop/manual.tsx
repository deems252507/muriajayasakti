import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { listPartners, manualNota, searchProducts } from "@/lib/shop/api";
import { digits, grouped, rupiah, todayInput } from "@/lib/shop/format";
import { shopBrand } from "@/lib/shop/print";
import type { Partner, Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/manual")({ component: ManualPage });

type Jenis = "MASUK" | "KELUAR";
type Draft = { key: string; product: Product; jenis: Jenis; qty: number; isAlt: boolean; harga: number; own?: boolean; custom?: boolean };

const konvOf = (item: Draft) => (item.isAlt && item.product.isiSatuanAlt > 0 ? item.product.isiSatuanAlt : 1);
const hargaDefault = (product: Product, isAlt: boolean) => (isAlt && product.isiSatuanAlt > 0 ? product.hargaJualAlt : product.hargaJual) || 0; // sama persis dengan Daftar Sparepart/Kasir; harga dus tidak dihitung otomatis
const deltaOf = (item: Draft) => (item.jenis === "MASUK" ? 1 : -1) * item.qty * konvOf(item);

function ManualPage() {
  const me = Route.useRouteContext().me;
  const [q, setQ] = usePersistedState("manual:q", "");
  const [hits, setHits] = useState<Product[]>([]);
  const [activeHit, setActiveHit] = useState(0);
  const [items, setItems] = usePersistedState<Draft[]>("manual:items", []);
  const [tanggal, setTanggal] = useState(todayInput());
  const [jenis, setJenis] = usePersistedState<Jenis>("manual:jenis", "MASUK");
  const [tujuan, setTujuan] = usePersistedState("manual:tujuan", "");
  const [ket, setKet] = usePersistedState("manual:ket", "");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [bon, setBon] = usePersistedState("manual:bon", false);
  const [customNama, setCustomNama] = useState("");
  const [customSatuan, setCustomSatuan] = useState("Item");
  const [tujuanOpen, setTujuanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justAdded, setJustAdded] = useState<{ key: string; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (q.trim().length < 1) return setHits([]);
    const timer = setTimeout(() => void searchProducts({ data: { q, limit: 20 } }).then((res) => setHits(res.items)).catch((error: Error) => toast.error(error.message)), 160);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => { setActiveHit(0); }, [hits]);
  useEffect(() => {
    if (me.role === "Owner" || me.role === "Kasir") return;
    void listPartners().then(setPartners).catch(() => setPartners([]));
  }, [me.role]);
  const tujuanQuery = tujuan.trim().toLowerCase();
  const tujuanHits = partners.filter((row) => !tujuanQuery || row.nama.toLowerCase().includes(tujuanQuery)).slice(0, 30);
  useEffect(() => {
    if (!justAdded) return;
    const el = qtyRefs.current[justAdded.key];
    el?.focus();
    el?.select();
  }, [justAdded]);

  /** Stok (pcs) suatu barang setelah semua baris nota ini diterapkan. */
  function stokSetelah(product: Product, list = items) {
    return product.stok + list.filter((row) => !row.custom && row.product.id === product.id).reduce((sum, row) => sum + deltaOf(row), 0);
  }
  const melebihi = items.filter((row) => !row.custom && row.jenis === "KELUAR" && stokSetelah(row.product) < 0);

  /** Tombol Masuk/Keluar: baris yang belum diatur sendiri ikut berubah. */
  function pilihJenis(next: Jenis) {
    setJenis(next);
    setItems((prev) => prev.map((row) => (row.own ? row : { ...row, jenis: next })));
  }

  function addItem(product: Product, isAlt: boolean) {
    if (isAlt && !(product.satuanAlt && product.isiSatuanAlt > 0)) return toast.error("Barang ini tidak punya satuan dus.");
    const same = items.find((row) => row.product.id === product.id && row.jenis === jenis && row.isAlt === isAlt);
    if (same) {
      setItems((prev) => prev.map((row) => (row.key === same.key ? { ...row, qty: row.qty + 1 } : row)));
      setJustAdded({ key: same.key, n: Date.now() });
    } else {
      const key = `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setItems((prev) => [...prev, { key, product, jenis, qty: 1, isAlt, harga: hargaDefault(product, isAlt) }]);
      setJustAdded({ key, n: Date.now() });
    }
    setQ("");
    setHits([]);
  }

  function addCustom() {
    const nama = customNama.trim();
    if (!nama) return toast.error("Isi nama barang custom dulu.");
    const satuan = customSatuan.trim() || "Item";
    const product: Product = {
      id: 0, kode: "", partNumber: "", partNumbersAlt: "", nama, kategori: "Lainnya", merek: "", satuan,
      stokMin: 0, stok: 0, hargaBeli: 0, hargaJual: 0, satuanAlt: "", isiSatuanAlt: 0, hargaJualAlt: 0,
      pajakStatus: "Non Pajak", kodePajak: "", keterangan: "",
    };
    const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [...prev, { key, product, custom: true, jenis, qty: 1, isAlt: false, harga: 0 }]);
    setJustAdded({ key, n: Date.now() });
    setCustomNama("");
  }

  /** Syarat Bon: semua barang Keluar dan nama pelanggan terisi. Harga boleh Rp 0, bisa diedit nanti di menu Bon / Piutang. */
  const totalKeluarNilai = items.filter((row) => row.jenis === "KELUAR").reduce((sum, row) => sum + row.harga * row.qty, 0);
  const bonMasalah: string[] = [];
  if (bon) {
    if (items.some((row) => row.jenis === "MASUK")) bonMasalah.push("Ada barang Masuk. Bon hanya untuk barang Keluar.");
    if (!tujuan.trim() || tujuan.trim().toLowerCase() === "umum") bonMasalah.push("Isi nama pelanggan di kolom Supplier / pelanggan / gudang.");
  }

  function setQty(key: string, raw: number) {
    setItems((prev) => prev.map((row) => (row.key === key ? { ...row, qty: Math.max(1, raw) } : row)));
  }

  function setHarga(key: string, raw: number) {
    setItems((prev) => prev.map((row) => (row.key === key ? { ...row, harga: Math.max(0, raw) } : row)));
  }

  function resetAll() {
    setItems([]);
    setQ("");
    setTujuan("");
    setKet("");
    setBon(false);
  }

  async function simpan() {
    if (melebihi.length) return toast.error(`Stok ${melebihi[0].product.nama} tidak cukup untuk barang keluar.`);
    if (bonMasalah.length) return toast.error(bonMasalah[0]);
    setBusy(true);
    try {
      const res = (await manualNota({
        data: {
          tanggal: new Date(`${tanggal}T12:00:00+08:00`).toISOString(),
          bon,
          items: items.map((item) => ({
            ...(item.custom ? { custom: item.product.nama, satuan: item.product.satuan } : { productId: item.product.id }),
            jenis: item.jenis,
            qty: item.qty,
            isAlt: item.isAlt,
            harga: item.jenis === "KELUAR" ? item.harga : 0,
            tujuan,
            keterangan: ket,
          })),
        },
      })) as { nomor: string };
      const saved = items;
      toast.success(`Nota ${res.nomor} tersimpan${bon ? " sebagai Bon" : ""}`, {
        description: bon ? "Masuk ke menu Bon / Piutang. Pelunasan dilakukan dari sana." : "Nota tidak dicetak otomatis. Bisa dicetak lewat tombol ini atau nanti dari Riwayat Transaksi.",
        duration: 10000,
        action: { label: "Cetak Nota", onClick: () => printManual(res.nomor, tanggal, saved) },
      });
      setItems([]);
      setBon(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (me.role === "Owner") return <Panel><p>Halaman ini untuk operasional Admin/Kasir. Akun Owner hanya melihat laporan.</p></Panel>;
  if (me.role === "Kasir") return <p>Halaman ini untuk Admin.</p>;

  const totalMasuk = items.filter((row) => row.jenis === "MASUK").length;
  const totalKeluar = items.length - totalMasuk;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">Nota Mutasi Barang (Masuk/Keluar)</h2>
            <p className="mt-1 text-sm text-slate-600">Tambahkan beberapa barang, termasuk Masuk dan Keluar, lalu simpan sebagai satu nota.</p>
          </div>
          <button className="h-11 rounded-lg border border-red-200 px-4 text-sm font-bold text-danger" onClick={resetAll}>Reset Form</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-600">Tanggal Nota<input className={`${inputClass} mt-1 h-12`} type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></label>
          <div className="relative text-sm text-slate-600">
            <label htmlFor="manual-tujuan">Supplier / pelanggan / gudang</label>
            <input
              id="manual-tujuan"
              autoComplete="off"
              className={`${inputClass} mt-1 h-12`}
              placeholder="Opsional — pilih dari daftar atau ketik sendiri"
              value={tujuan}
              onChange={(e) => { setTujuan(e.target.value); setTujuanOpen(true); }}
              onFocus={() => setTujuanOpen(true)}
              onBlur={() => setTimeout(() => setTujuanOpen(false), 150)}
              onKeyDown={(e) => { if (e.key === "Escape") setTujuanOpen(false); }}
            />
            {tujuanOpen && tujuanHits.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-white shadow-xl">
                {tujuanHits.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setTujuan(row.nama); setTujuanOpen(false); }}
                  >
                    <span className="truncate font-semibold">{row.nama}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${row.tipe === "Supplier" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{row.tipe}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {tujuan ? <button type="button" className="mt-1 text-xs font-semibold text-slate-500 underline" onClick={() => setTujuan("")}>Kosongkan</button> : null}
          </div>
          <label className="text-sm text-slate-600">Keterangan<input className={`${inputClass} mt-1 h-12`} placeholder="Opsional" value={ket} onChange={(e) => setKet(e.target.value)} /></label>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,1fr)_2fr]">
        <Panel>
          <h3 className="text-base font-extrabold">1. Pilih jenis, lalu cari barang</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => pilihJenis("MASUK")} className={`h-14 rounded-xl border-2 text-base font-extrabold ${jenis === "MASUK" ? "border-emerald-600 bg-emerald-600 text-white" : "border-line bg-white text-slate-600"}`}>+ MASUK</button>
            <button type="button" onClick={() => pilihJenis("KELUAR")} className={`h-14 rounded-xl border-2 text-base font-extrabold ${jenis === "KELUAR" ? "border-red-600 bg-red-600 text-white" : "border-line bg-white text-slate-600"}`}>− KELUAR</button>
          </div>
          <p className="mt-1 text-xs text-slate-600">Semua barang di nota ikut berjenis <b>{jenis === "MASUK" ? "Masuk" : "Keluar"}</b>. Kalau perlu campuran, klik tombol jenis di baris tertentu; baris itu tidak ikut berubah lagi.</p>
          <input
            ref={searchRef}
            className="mt-3 h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none focus:border-blue-500"
            placeholder="Cari nama / part number, lalu Enter"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveHit((i) => Math.min(hits.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveHit((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter" && hits[activeHit]) { e.preventDefault(); addItem(hits[activeHit], e.shiftKey); }
            }}
          />
          <p className="mt-1 text-xs text-slate-600">Enter = tambah per Pcs · Shift+Enter = tambah per Dus.</p>
          <div className="mt-3 rounded-lg border border-dashed border-slate-400 bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-900">Barang custom <span className="font-normal text-slate-600">(tidak ada di daftar sparepart)</span></p>
            <div className="mt-2 grid grid-cols-[1fr_6rem] gap-2">
              <input
                className="h-11 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-blue-500"
                placeholder="Nama barang / jasa"
                value={customNama}
                onChange={(e) => setCustomNama(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              />
              <input
                className="h-11 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-blue-500"
                placeholder="Satuan"
                aria-label="Satuan barang custom"
                value={customSatuan}
                onChange={(e) => setCustomSatuan(e.target.value)}
              />
            </div>
            <button type="button" className="mt-2 h-11 w-full rounded-lg bg-slate-800 text-sm font-bold text-white" onClick={addCustom}>+ Tambah barang custom ({jenis === "MASUK" ? "Masuk" : "Keluar"})</button>
            <p className="mt-1 text-[11px] text-slate-600">Stok tidak berubah. Harga boleh dikosongkan.</p>
          </div>
          <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-lg border border-line bg-white">
            {!q.trim() ? <p className="px-3 py-6 text-center text-sm text-slate-600">Hasil pencarian muncul di sini.</p> : null}
            {q.trim() && hits.length === 0 ? <p className="px-3 py-6 text-center text-sm text-slate-600">Barang tidak ditemukan.</p> : null}
            {hits.map((item, index) => {
              const dusOk = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
              return (
                <div key={item.id} className={`flex items-center gap-2 border-b border-slate-300 px-3 py-3 ${index === activeHit ? "bg-blue-100" : "bg-white"}`} onMouseEnter={() => setActiveHit(index)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900"><Mark text={item.nama} q={q} />{item.merek ? <span className="ml-2 inline-block rounded-md bg-blue-100 px-1.5 py-0.5 align-middle text-[11px] font-bold text-blue-800"><Mark text={item.merek} q={q} /></span> : null}</p>
                    <p className="mt-0.5 text-xs text-slate-600">PN: {item.partNumber || item.kode || "-"} · Stok: {item.stok} {item.satuan}{dusOk ? ` · ${Math.floor(item.stok / item.isiSatuanAlt)} ${item.satuanAlt}` : ""}</p>
                    <p className="num mt-0.5 text-xs font-bold text-emerald-700">{rupiah(hargaDefault(item, false))} / {item.satuan}{dusOk ? ` · ${rupiah(hargaDefault(item, true))} / ${item.satuanAlt}` : ""}</p>
                  </div>
                  <button type="button" className="h-11 rounded-lg bg-slate-800 px-4 text-sm font-bold text-white" onClick={() => addItem(item, false)}>+ Pcs</button>
                  {dusOk ? <button type="button" className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white" onClick={() => addItem(item, true)}>+ {item.satuanAlt || "Dus"}</button> : null}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-extrabold">2. Isi Nota <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{items.length} baris</span>
              {items.length ? <span className="ml-2 text-xs font-medium text-slate-600">{totalMasuk} masuk · {totalKeluar} keluar</span> : null}
            </h3>
            <button className="h-10 rounded-lg border border-line px-3 text-sm font-medium" onClick={() => setItems([])} disabled={!items.length}>Kosongkan Nota</button>
          </div>
          <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-200 text-[11px] font-bold tracking-wide text-slate-900 uppercase">
                <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2">Jenis</th><th className="px-2 py-2 text-left">Barang</th><th className="px-2 py-2">Satuan</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2 text-right">Harga (opsional)</th><th className="px-2 py-2 text-right">Stok setelah</th><th className="w-20"></th></tr>
              </thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={8} className="py-10 text-center text-slate-600">Nota masih kosong. Cari barang di sebelah kiri lalu tekan Enter.</td></tr> : items.map((item, index) => {
                  const after = item.custom ? 0 : stokSetelah(item.product);
                  const bad = !item.custom && item.jenis === "KELUAR" && after < 0;
                  return (
                    <tr key={item.key} className={`border-t border-slate-300 ${bad ? "bg-red-100" : justAdded?.key === item.key ? "bg-yellow-100" : "bg-white"}`}>
                      <td className="px-2 py-2 text-slate-600">{index + 1}</td>
                      <td className="px-2 text-center">
                        <button
                          type="button"
                          title="Klik untuk mengubah Masuk/Keluar"
                          className={`h-10 w-24 rounded-lg text-xs font-extrabold text-white ${item.jenis === "MASUK" ? "bg-emerald-600" : "bg-red-600"}`}
                          onClick={() => setItems((prev) => prev.map((row) => (row.key === item.key ? { ...row, own: true, jenis: row.jenis === "MASUK" ? "KELUAR" : "MASUK" } : row)))}
                        >{item.jenis}</button>
                      </td>
                      <td className="px-2 py-2"><b className="text-slate-900">{item.product.nama}</b>{item.custom ? <span className="ml-2 inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">Custom</span> : null}{item.product.merek ? <span className="ml-2 inline-block rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-bold text-blue-800">{item.product.merek}</span> : null}<span className="block text-xs text-slate-600">{item.product.partNumber || item.product.kode} · Stok saat ini: {item.product.stok} {item.product.satuan}</span></td>
                      <td className="px-2 text-center">
                        {item.product.satuanAlt && item.product.isiSatuanAlt > 0 ? (
                          <select
                            className="h-11 rounded-lg border border-blue-300 bg-blue-50 px-2 text-sm font-bold text-blue-700"
                            value={item.isAlt ? "alt" : "base"}
                            onChange={(e) => setItems((prev) => prev.map((row) => (row.key === item.key ? { ...row, isAlt: e.target.value === "alt", harga: hargaDefault(item.product, e.target.value === "alt") } : row)))}
                          >
                            <option value="base">{item.product.satuan}</option>
                            <option value="alt">{item.product.satuanAlt}</option>
                          </select>
                        ) : <span>{item.product.satuan}</span>}
                      </td>
                      <td className="px-2">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" className="h-11 w-11 rounded-lg bg-slate-200 text-lg font-bold" onClick={() => setQty(item.key, item.qty - 1)}>−</button>
                          <input
                            ref={(el) => { qtyRefs.current[item.key] = el; }}
                            className="num h-12 w-20 rounded-lg border border-line text-center text-base"
                            inputMode="numeric"
                            value={item.qty}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchRef.current?.focus(); } }}
                            onChange={(e) => setQty(item.key, digits(e.target.value))}
                          />
                          <button type="button" className="h-11 w-11 rounded-lg bg-slate-200 text-lg font-bold" onClick={() => setQty(item.key, item.qty + 1)}>+</button>
                        </div>
                        {item.isAlt ? <p className="mt-0.5 text-center text-[11px] text-slate-600">= {item.qty * konvOf(item)} {item.product.satuan}</p> : null}
                      </td>
                      <td className="px-2 text-right">
                        {item.jenis === "KELUAR" ? (
                          <>
                            <input
                              className="num h-11 w-28 rounded-lg border border-line px-2 text-right text-sm"
                              inputMode="numeric"
                              aria-label="Harga satuan"
                              value={item.harga ? grouped(item.harga) : ""}
                              placeholder="0"
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setHarga(item.key, digits(e.target.value))}
                            />
                            <p className="num mt-0.5 text-[11px] text-slate-600">= {rupiah(item.harga * item.qty)}</p>
                          </>
                        ) : <span className="text-xs text-slate-600">-</span>}
                      </td>
                      <td className={`num px-2 text-right font-semibold ${bad ? "text-red-600" : ""}`}>{item.custom ? <span className="text-xs font-medium text-slate-600">Tanpa stok</span> : <>{after} {item.product.satuan}{bad ? <span className="block text-[11px]">Stok tidak cukup</span> : null}</>}</td>
                      <td className="px-2 text-right"><button type="button" className="h-10 rounded-lg border border-red-200 px-3 text-xs font-bold text-danger" onClick={() => setItems((prev) => prev.filter((row) => row.key !== item.key))}>Hapus</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.some((row) => row.jenis === "KELUAR") ? <p className="num mt-3 text-right text-sm font-bold">Total nilai barang keluar: {rupiah(items.filter((row) => row.jenis === "KELUAR").reduce((sum, row) => sum + row.harga * row.qty, 0))}</p> : null}
          <p className="mt-3 text-xs text-slate-600">1 dus mengurangi atau menambah stok sebanyak isinya dalam Pcs. Harga hanya untuk barang Keluar (otomatis dari harga jual, boleh diubah atau dikosongkan) dan ikut dihitung ke pajak. Nota tidak dicetak otomatis.</p>
          {melebihi.length ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Ada barang keluar yang melebihi stok. Kurangi jumlahnya sebelum menyimpan.</p> : null}
          <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${bon ? "border-amber-500 bg-amber-50" : "border-line bg-white"}`}>
            <input type="checkbox" className="mt-1 h-5 w-5" checked={bon} onChange={(e) => setBon(e.target.checked)} />
            <span className="text-sm">
              <b className="text-slate-900">Catat sebagai Bon (belum dibayar)</b>
              <span className="mt-0.5 block text-xs text-slate-600">Nota masuk ke menu Bon / Piutang atas nama pelanggan di atas, dan dilunasi dari sana. Syarat: semua barang Keluar dan nama pelanggan terisi. Harga boleh dikosongkan dulu, bisa diedit nanti di menu Bon / Piutang.</span>
            </span>
          </label>
          {bon && bonMasalah.length ? <ul className="mt-2 list-disc rounded-lg bg-amber-50 py-2 pl-7 pr-3 text-sm font-semibold text-amber-800">{bonMasalah.map((m) => <li key={m}>{m}</li>)}</ul> : null}
          {bon && !bonMasalah.length ? <p className="num mt-2 text-right text-sm font-bold text-amber-800">Piutang yang akan dicatat: {rupiah(totalKeluarNilai)}{totalKeluarNilai <= 0 ? " (harga bisa diisi nanti di Bon / Piutang)" : ""}</p> : null}
          <PrimaryButton className="mt-4 h-14 w-full text-base" disabled={items.length === 0 || busy || melebihi.length > 0 || bonMasalah.length > 0} onClick={() => void simpan()}>{busy ? "Menyimpan..." : bon ? `Simpan sebagai Bon (${items.length} baris)` : `Simpan Nota (${items.length} baris)`}</PrimaryButton>
        </Panel>
      </div>
    </div>
  );
}

function printManual(nomor: string, tanggal: string, items: Draft[]) {
  const rows = items.map((item) => `<tr><td>${item.jenis}</td><td>${item.product.nama}</td><td>${item.qty}</td><td>${item.isAlt ? item.product.satuanAlt : item.product.satuan}</td><td style="text-align:right">${item.jenis === "KELUAR" ? rupiah(item.harga * item.qty) : "-"}</td></tr>`).join("");
  const win = window.open("", "_blank", "width=720,height=640");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${nomor}</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:6px;text-align:left}</style></head><body><h2>${shopBrand().nama}</h2><p>${shopBrand().alamat}<br>${shopBrand().telepon}</p><p>${nomor} · ${tanggal}</p><table><thead><tr><th>Jenis</th><th>Barang</th><th>Qty</th><th>Satuan</th><th>Nilai</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`);
  win.document.close();
}
