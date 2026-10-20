import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { manualNota, searchProducts } from "@/lib/shop/api";
import { digits, todayInput } from "@/lib/shop/format";
import { shopBrand } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/manual")({ component: ManualPage });

type Jenis = "MASUK" | "KELUAR";
type Draft = { key: string; product: Product; jenis: Jenis; qty: number; isAlt: boolean; own?: boolean };

const konvOf = (item: Draft) => (item.isAlt && item.product.isiSatuanAlt > 0 ? item.product.isiSatuanAlt : 1);
const deltaOf = (item: Draft) => (item.jenis === "MASUK" ? 1 : -1) * item.qty * konvOf(item);

function ManualPage() {
  const me = Route.useRouteContext().me;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [activeHit, setActiveHit] = useState(0);
  const [items, setItems] = useState<Draft[]>([]);
  const [tanggal, setTanggal] = useState(todayInput());
  const [jenis, setJenis] = useState<Jenis>("MASUK");
  const [tujuan, setTujuan] = useState("");
  const [ket, setKet] = useState("");
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
    if (!justAdded) return;
    const el = qtyRefs.current[justAdded.key];
    el?.focus();
    el?.select();
  }, [justAdded]);

  /** Stok (pcs) suatu barang setelah semua baris nota ini diterapkan. */
  function stokSetelah(product: Product, list = items) {
    return product.stok + list.filter((row) => row.product.id === product.id).reduce((sum, row) => sum + deltaOf(row), 0);
  }
  const melebihi = items.filter((row) => row.jenis === "KELUAR" && stokSetelah(row.product) < 0);

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
      setItems((prev) => [...prev, { key, product, jenis, qty: 1, isAlt }]);
      setJustAdded({ key, n: Date.now() });
    }
    setQ("");
    setHits([]);
  }

  function setQty(key: string, raw: number) {
    setItems((prev) => prev.map((row) => (row.key === key ? { ...row, qty: Math.max(1, raw) } : row)));
  }

  function resetAll() {
    setItems([]);
    setQ("");
    setTujuan("");
    setKet("");
  }

  async function simpan() {
    if (melebihi.length) return toast.error(`Stok ${melebihi[0].product.nama} tidak cukup untuk barang keluar.`);
    setBusy(true);
    try {
      const res = (await manualNota({
        data: {
          tanggal: new Date(`${tanggal}T12:00:00+08:00`).toISOString(),
          items: items.map((item) => ({
            productId: item.product.id,
            jenis: item.jenis,
            qty: item.qty,
            isAlt: item.isAlt,
            tujuan,
            keterangan: ket,
          })),
        },
      })) as { nomor: string };
      toast.success(`${me.role} · Nota ${res.nomor} tersimpan`);
      printManual(res.nomor, tanggal, items);
      setItems([]);
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
            <p className="mt-1 text-sm text-muted">Tambahkan beberapa barang, termasuk Masuk dan Keluar, lalu simpan sebagai satu nota.</p>
          </div>
          <button className="h-11 rounded-lg border border-red-200 px-4 text-sm font-bold text-danger" onClick={resetAll}>Reset Form</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-muted">Tanggal Nota<input className={`${inputClass} mt-1 h-12`} type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></label>
          <label className="text-sm text-muted">Supplier / pelanggan / gudang<input className={`${inputClass} mt-1 h-12`} placeholder="Opsional" value={tujuan} onChange={(e) => setTujuan(e.target.value)} /></label>
          <label className="text-sm text-muted">Keterangan<input className={`${inputClass} mt-1 h-12`} placeholder="Opsional" value={ket} onChange={(e) => setKet(e.target.value)} /></label>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,1fr)_2fr]">
        <Panel>
          <h3 className="text-base font-extrabold">1. Pilih jenis, lalu cari barang</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => pilihJenis("MASUK")} className={`h-14 rounded-xl border-2 text-base font-extrabold ${jenis === "MASUK" ? "border-emerald-600 bg-emerald-600 text-white" : "border-line bg-white text-slate-600"}`}>+ MASUK</button>
            <button type="button" onClick={() => pilihJenis("KELUAR")} className={`h-14 rounded-xl border-2 text-base font-extrabold ${jenis === "KELUAR" ? "border-red-600 bg-red-600 text-white" : "border-line bg-white text-slate-600"}`}>− KELUAR</button>
          </div>
          <p className="mt-1 text-xs text-muted">Semua barang di nota ikut berjenis <b>{jenis === "MASUK" ? "Masuk" : "Keluar"}</b>. Kalau perlu campuran, klik tombol jenis di baris tertentu; baris itu tidak ikut berubah lagi.</p>
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
          <p className="mt-1 text-xs text-muted">Enter = tambah per Pcs · Shift+Enter = tambah per Dus.</p>
          <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-lg border border-line bg-white">
            {!q.trim() ? <p className="px-3 py-6 text-center text-sm text-muted">Hasil pencarian muncul di sini.</p> : null}
            {q.trim() && hits.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">Barang tidak ditemukan.</p> : null}
            {hits.map((item, index) => {
              const dusOk = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
              return (
                <div key={item.id} className={`flex items-center gap-2 border-b border-line px-3 py-3 ${index === activeHit ? "bg-blue-50" : ""}`} onMouseEnter={() => setActiveHit(index)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold"><Mark text={item.nama} q={q} /></p>
                    <p className="mt-0.5 text-xs text-muted">PN: {item.partNumber || item.kode || "-"} · Stok: {item.stok} {item.satuan}{dusOk ? ` · ${Math.floor(item.stok / item.isiSatuanAlt)} ${item.satuanAlt}` : ""}</p>
                  </div>
                  <button type="button" className="h-11 rounded-lg bg-slate-800 px-4 text-sm font-bold text-white" onClick={() => addItem(item, false)}>+ Pcs</button>
                  <button type="button" className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-30" disabled={!dusOk} onClick={() => addItem(item, true)}>+ {item.satuanAlt || "Dus"}</button>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-extrabold">2. Isi Nota <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{items.length} baris</span>
              {items.length ? <span className="ml-2 text-xs font-medium text-muted">{totalMasuk} masuk · {totalKeluar} keluar</span> : null}
            </h3>
            <button className="h-10 rounded-lg border border-line px-3 text-sm font-medium" onClick={() => setItems([])} disabled={!items.length}>Kosongkan Nota</button>
          </div>
          <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
                <tr><th className="w-10 px-2 py-2 text-left">No</th><th className="px-2 py-2">Jenis</th><th className="px-2 py-2 text-left">Barang</th><th className="px-2 py-2">Satuan</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2 text-right">Stok setelah</th><th className="w-20"></th></tr>
              </thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted">Nota masih kosong. Cari barang di sebelah kiri lalu tekan Enter.</td></tr> : items.map((item, index) => {
                  const after = stokSetelah(item.product);
                  const bad = item.jenis === "KELUAR" && after < 0;
                  return (
                    <tr key={item.key} className={`border-t border-line ${bad ? "bg-red-50" : justAdded?.key === item.key ? "bg-yellow-50" : ""}`}>
                      <td className="px-2 py-2 text-muted">{index + 1}</td>
                      <td className="px-2 text-center">
                        <button
                          type="button"
                          title="Klik untuk mengubah Masuk/Keluar"
                          className={`h-10 w-24 rounded-lg text-xs font-extrabold text-white ${item.jenis === "MASUK" ? "bg-emerald-600" : "bg-red-600"}`}
                          onClick={() => setItems((prev) => prev.map((row) => (row.key === item.key ? { ...row, own: true, jenis: row.jenis === "MASUK" ? "KELUAR" : "MASUK" } : row)))}
                        >{item.jenis}</button>
                      </td>
                      <td className="px-2 py-2"><b>{item.product.nama}</b><span className="block text-xs text-muted">{item.product.partNumber || item.product.kode} · Stok saat ini: {item.product.stok} {item.product.satuan}</span></td>
                      <td className="px-2 text-center">
                        {item.product.satuanAlt && item.product.isiSatuanAlt > 0 ? (
                          <select
                            className="h-11 rounded-lg border border-blue-300 bg-blue-50 px-2 text-sm font-bold text-blue-700"
                            value={item.isAlt ? "alt" : "base"}
                            onChange={(e) => setItems((prev) => prev.map((row) => (row.key === item.key ? { ...row, isAlt: e.target.value === "alt" } : row)))}
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
                        {item.isAlt ? <p className="mt-0.5 text-center text-[11px] text-muted">= {item.qty * konvOf(item)} {item.product.satuan}</p> : null}
                      </td>
                      <td className={`num px-2 text-right font-semibold ${bad ? "text-red-600" : ""}`}>{after} {item.product.satuan}{bad ? <span className="block text-[11px]">Stok tidak cukup</span> : null}</td>
                      <td className="px-2 text-right"><button type="button" className="h-10 rounded-lg border border-red-200 px-3 text-xs font-bold text-danger" onClick={() => setItems((prev) => prev.filter((row) => row.key !== item.key))}>Hapus</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">1 dus mengurangi atau menambah stok sebanyak isinya dalam Pcs. Harga nota manual nol, jadi pajak keluarnya nol.</p>
          {melebihi.length ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Ada barang keluar yang melebihi stok. Kurangi jumlahnya sebelum menyimpan.</p> : null}
          <PrimaryButton className="mt-4 h-14 w-full text-base" disabled={items.length === 0 || busy || melebihi.length > 0} onClick={() => void simpan()}>{busy ? "Menyimpan..." : `Simpan & Cetak 1 Nota (${items.length} baris)`}</PrimaryButton>
        </Panel>
      </div>
    </div>
  );
}

function printManual(nomor: string, tanggal: string, items: Draft[]) {
  const rows = items.map((item) => `<tr><td>${item.jenis}</td><td>${item.product.nama}</td><td>${item.qty}</td><td>${item.isAlt ? item.product.satuanAlt : item.product.satuan}</td></tr>`).join("");
  const win = window.open("", "_blank", "width=720,height=640");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${nomor}</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:6px;text-align:left}</style></head><body><h2>${shopBrand().nama}</h2><p>${shopBrand().alamat}<br>${shopBrand().telepon}</p><p>${nomor} · ${tanggal}</p><table><thead><tr><th>Jenis</th><th>Barang</th><th>Qty</th><th>Satuan</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`);
  win.document.close();
}
