import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { manualNota, searchProducts } from "@/lib/shop/api";
import { todayInput } from "@/lib/shop/format";
import { shopBrand } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/manual")({ component: ManualPage });

type Draft = { product: Product; jenis: "MASUK" | "KELUAR"; qty: number; isAlt: boolean; tujuan: string; keterangan: string };

function ManualPage() {
  const me = Route.useRouteContext().me;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [items, setItems] = useState<Draft[]>([]);
  const [tanggal, setTanggal] = useState(todayInput());
  const [jenis, setJenis] = useState<"MASUK" | "KELUAR">("MASUK");
  const [tujuan, setTujuan] = useState("");
  const [ket, setKet] = useState("");

  useEffect(() => {
    if (q.trim().length < 1) return setHits([]);
    const timer = setTimeout(() => void searchProducts({ data: { q } }).then((res) => setHits(res.items)), 160);
    return () => clearTimeout(timer);
  }, [q]);

  function addItem(product: Product, isAlt: boolean) {
    setItems((prev) => [...prev, { product, jenis, qty: 1, isAlt, tujuan, keterangan: ket }]);
  }

  if (me.role === "Owner") return <Panel><p>Halaman ini untuk operasional Admin/Kasir. Akun Owner hanya melihat laporan.</p></Panel>;
  if (me.role === "Kasir") return <p>Halaman ini untuk Admin.</p>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Panel className="lg:col-span-2">
        <h2 className="font-extrabold">Nota Mutasi Barang (Masuk/Keluar)</h2>
        <p className="mt-1 text-xs text-muted">Tambahkan beberapa barang, termasuk Masuk dan Keluar, lalu simpan sebagai satu nota.</p>
        <button className="mt-2 text-xs font-bold text-red-500" onClick={() => { setItems([]); setQ(""); setTujuan(""); setKet(""); }}>Reset Form</button>
        <input className={`${inputClass} mt-3`} placeholder="Cari Sparepart" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line">
          {hits.map((item) => {
            const dusOk = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
            return (
              <li key={item.id} className="flex items-center gap-2 border-b border-line px-3 py-2 hover:bg-blue-50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium"><Mark text={item.nama} q={q} /></p>
                  <p className="text-[11px] text-muted">Stok: {item.stok} {item.satuan}{dusOk ? ` · ${Math.floor(item.stok / item.isiSatuanAlt)} ${item.satuanAlt}` : ""}</p>
                </div>
                <button className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold" onClick={() => addItem(item, false)}>Pcs</button>
                <button className="rounded bg-blue-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40" disabled={!dusOk} onClick={() => addItem(item, true)}>{item.satuanAlt || "Dus"}</button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 grid gap-2">
          <label className="text-xs text-muted">Tanggal Nota<input className={`${inputClass} mt-1`} type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></label>
          <label className="text-xs text-muted">Jenis Transaksi
            <select className={`${inputClass} mt-1`} value={jenis} onChange={(e) => setJenis(e.target.value as "MASUK" | "KELUAR")}>
              <option value="MASUK">Masuk</option>
              <option value="KELUAR">Keluar</option>
            </select>
          </label>
          <input className={inputClass} placeholder="Supplier / pelanggan / gudang" value={tujuan} onChange={(e) => setTujuan(e.target.value)} />
          <input className={inputClass} placeholder="Keterangan" value={ket} onChange={(e) => setKet(e.target.value)} />
        </div>
      </Panel>
      <Panel className="lg:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">Isi Nota Saat Ini</h2>
          <button className="text-xs font-bold text-red-500" onClick={() => setItems([])}>Kosongkan Nota</button>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {items.length === 0 ? <li className="py-6 text-center text-sm text-muted">Nota masih kosong.</li> : null}
          {items.map((item, index) => (
            <li key={`${item.product.id}-${index}`} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1">{item.jenis} · {item.product.nama}<span className="block text-[11px] text-muted">Stok saat ini: {item.product.stok} {item.product.satuan}</span></span>
              {item.product.satuanAlt ? (
                <select
                  className="rounded border border-blue-300 bg-blue-50 px-1 py-1 text-xs font-bold text-blue-700"
                  value={item.isAlt ? "alt" : "base"}
                  onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, isAlt: e.target.value === "alt" } : row))}
                >
                  <option value="base">{item.product.satuan}</option>
                  <option value="alt">{item.product.satuanAlt}</option>
                </select>
              ) : <span className="text-xs">{item.product.satuan}</span>}
              <input className="num h-11 w-16 rounded-lg border border-line text-center" value={item.qty} onChange={(e) => {
                const qty = Math.max(1, Number(e.target.value) || 1);
                setItems((prev) => prev.map((row, i) => i === index ? { ...row, qty } : row));
              }} />
              <button className="text-xs text-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>Hapus</button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">1 dus mengurangi atau menambah stok sebanyak isinya dalam Pcs. Harga nota manual nol, jadi pajak keluarnya nol.</p>
        <PrimaryButton className="mt-4 w-full" disabled={items.length === 0} onClick={() => {
          void manualNota({
            data: {
              tanggal: new Date(`${tanggal}T12:00:00+08:00`).toISOString(),
              items: items.map((item) => ({
                productId: item.product.id,
                jenis: item.jenis,
                qty: item.qty,
                isAlt: item.isAlt,
                tujuan: item.tujuan,
                keterangan: item.keterangan,
              })),
            },
          }).then((res) => {
            const nomor = (res as { nomor: string }).nomor;
            toast.success(`${me.role} · Nota ${nomor} tersimpan`);
            printManual(nomor, tanggal, items);
            setItems([]);
          }).catch((error: Error) => toast.error(error.message));
        }}>Simpan & Cetak 1 Nota</PrimaryButton>
      </Panel>
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
