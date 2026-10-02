import { createFileRoute, Link } from "@tanstack/react-router";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { checkout, listMasters, listPartners, listShifts, savePartner, saveProduct, searchProducts } from "@/lib/shop/api";
import { digits, grouped, rupiah } from "@/lib/shop/format";
import { printSaleReceipt } from "@/lib/shop/print";
import type { Bank, Partner, Product, Shift } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/kasir")({ component: KasirPage });

type CartLine = {
  key: string;
  productId: number | null;
  nama: string;
  qty: number;
  isAlt: boolean;
  locked: boolean;
  satuan: string;
  satuanBase: string;
  hargaBase: number;
  satuanAlt: string;
  hargaAlt: number;
  isi: number;
  harga: number;
  konv: number;
  kodePajak: string;
  custom?: string;
};

function KasirPage() {
  const me = Route.useRouteContext().me;
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftId, setShiftId] = useState("");
  const [drawers, setDrawers] = useState<Record<string, number>>({});
  const [partners, setPartners] = useState<Partner[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("Umum");
  const [metode, setMetode] = useState("Tunai");
  const [bank, setBank] = useState("");
  const [bayar, setBayar] = useState("");
  const [diskon, setDiskon] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [scanConfirm, setScanConfirm] = useState<{ product: Product; unit: "pcs" | "dus" | null } | null>(null);
  const scanLock = useRef(false);

  useEffect(() => {
    function loadShifts() {
      void listShifts().then((res) => {
        const active = res.shifts.filter((s) => {
          if (s.status !== "AKTIF") return false;
          if (me.role !== "Kasir") return true;
          return s.username === me.username || s.shift === me.shift || s.cashierName === me.name;
        });
        setShifts(active);
        setDrawers(res.drawers);
        setShiftId((prev) => (active.some((s) => s.id === prev) ? prev : active[0]?.id || ""));
      });
    }
    loadShifts();
    const timer = setInterval(loadShifts, 8000);
    return () => clearInterval(timer);
  }, [me.role, me.username, me.shift, me.name]);
  useEffect(() => {
    void listPartners().then(setPartners);
    void listMasters().then((res) => setBanks(res.banks.filter((b) => b.aktif)));
  }, []);

  useEffect(() => {
    if (q.trim().length < 1) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchProducts({ data: { q } }).then((res) => {
        if (res.items[0] && (res.unit || res.exact)) {
          setScanConfirm({ product: res.items[0], unit: res.unit });
          setQ("");
          setHits([]);
          beep();
          return;
        }
        setHits(res.items);
      });
    }, /[\s]/.test(q) ? 160 : 40);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!camera) return;
    scanLock.current = false;
    const reader = new Html5Qrcode("kasir-qr", {
      verbose: false,
      useBarCodeDetectorIfSupported: true,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
    });
    let stopped = false;
    reader
      .start(
        { facingMode: "environment" },
        {
          fps: 30,
          qrbox: { width: 300, height: 180 },
          videoConstraints: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        },
        (value) => {
          if (stopped || scanLock.current) return;
          scanLock.current = true;
          setQ(value);
          beep();
          setCamera(false);
        },
        () => undefined,
      )
      .catch(() => {
        toast.error("Kamera tidak bisa dibuka. Ketik kode atau pakai alat scan USB.");
        setCamera(false);
      });
    return () => {
      stopped = true;
      void reader.stop().then(() => reader.clear()).catch(() => undefined);
    };
  }, [camera]);

  function addProduct(product: Product, isAlt: boolean, locked: boolean) {
    if (isAlt && (!product.satuanAlt || product.isiSatuanAlt <= 0)) {
      toast.error("Barang ini tidak punya satuan dus.");
      return;
    }
    const available = isAlt ? Math.floor(product.stok / product.isiSatuanAlt) : product.stok;
    if (available <= 0) {
      toast.error(isAlt ? "Stok dus tidak cukup." : "Stok pcs habis.");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        key: `${product.id}-${Date.now()}`,
        productId: product.id,
        nama: product.nama,
        qty: 1,
        isAlt,
        locked,
        satuan: isAlt ? product.satuanAlt : product.satuan,
        satuanBase: product.satuan,
        hargaBase: product.hargaJual,
        satuanAlt: product.satuanAlt,
        hargaAlt: product.hargaJualAlt,
        isi: product.isiSatuanAlt,
        harga: isAlt ? product.hargaJualAlt : product.hargaJual,
        konv: isAlt ? product.isiSatuanAlt : 1,
        kodePajak: product.kodePajak,
      },
    ]);
  }

  const subtotal = cart.reduce((sum, line) => sum + line.harga * line.qty, 0);
  const potongan = digits(diskon);
  const total = Math.max(0, subtotal - potongan);
  const bayarNum = digits(bayar);
  const kembalian = metode === "Tunai" ? bayarNum - total : 0;
  const sisaTf = metode === "Split" ? total - bayarNum : 0;

  async function pay() {
    if (!shiftId) return toast.error("Shift belum aktif.");
    if (cart.length === 0) return toast.error("Keranjang kosong.");
    if (cart.some((line) => line.harga <= 0)) return toast.error("Isi harga satuan.");
    setBusy(true);
    try {
      const result = (await checkout({
        data: {
          shiftId,
          customer,
          metode,
          bank,
          bayarTunai: bayarNum,
          diskon: potongan,
          items: cart.map((line) =>
            line.custom
              ? { custom: line.custom, qty: line.qty, harga: line.harga }
              : { productId: line.productId, qty: line.qty, isAlt: line.isAlt, harga: line.harga },
          ),
        },
      })) as {
        nomor: string;
        total: number;
        subtotal: number;
        diskon: number;
        bayarTunai: number;
        kembalian: number;
        transfer: number;
        status: string;
        metode: string;
        bank: string;
        customer: string;
        kasir: string;
        lines: Array<{ nama: string; qty: number; satuan: string; harga: number; kodePajak?: string }>;
      };
      printSaleReceipt(result);
      setCart([]);
      setBayar("");
      setDiskon("");
      setMetode("Tunai");
      toast.success(`${me.role} · Nota ${result.nomor} tersimpan.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel className="lg:col-span-2">
        <div className="mb-3 flex justify-end">
          <Link to="/retur" className="inline-flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-bold text-red-600">Proses Retur/Tukar</Link>
        </div>
        <input
          className={inputClass}
          placeholder="Ketik nama, part, kategori (oli), atau scan barcode..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const code = q.trim();
            if (!code) return;
            void searchProducts({ data: { q: code } }).then((res) => {
              const item = res.items[0];
              if (!item) {
                toast.error("Barcode tidak dikenali.");
                return;
              }
              setScanConfirm({ product: item, unit: res.unit });
              setQ("");
              setHits([]);
              beep();
            }).catch((err: Error) => toast.error(err.message));
          }}
        />
        {camera ? (
          <div className="relative mt-3 overflow-hidden rounded-lg bg-slate-900">
            <div id="kasir-qr" className="min-h-48 w-full" />
            <button className="absolute top-2 right-2 rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white" onClick={() => setCamera(false)}>Tutup Kamera</button>
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          {me.role !== "Kasir" ? (
            <button className="flex min-h-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500" onClick={() => setProductOpen(true)}>Tambah Baru</button>
          ) : null}
          <button className="flex min-h-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-purple-300 text-xs text-purple-500" onClick={() => setCustomOpen(true)}>Jasa / Item Custom</button>
          {!camera ? <button className="flex min-h-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-green-300 text-xs text-green-500" onClick={() => setCamera(true)}>Scan Barcode (Kamera)</button> : null}
          {hits.map((item) => {
            const dusOk = Boolean(item.satuanAlt && item.isiSatuanAlt > 0);
            const dusStok = dusOk ? Math.floor(item.stok / item.isiSatuanAlt) : 0;
            const habis = item.stok <= 0;
            return (
              <div key={item.id} className="flex min-h-28 cursor-pointer flex-col justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-blue-500 hover:bg-blue-50" onClick={() => addProduct(item, false, false)}>
                <div>
                  <p className="line-clamp-2 text-xs font-semibold"><Mark text={item.nama} q={q} />{item.kodePajak ? ` (${item.kodePajak})` : ""}</p>
                  <p className="mt-1 text-[10px] font-bold text-slate-600">{item.kategori || "-"}</p>
                  <p className="font-mono text-[10px] text-blue-600">PN: {item.partNumber || item.kode || "-"}</p>
                  {item.merek ? <p className="text-[10px] text-slate-500">{item.merek}</p> : null}
                </div>
                <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn-tight bg-slate-900 text-white shadow-sm" onClick={() => addProduct(item, false, false)}>Pcs</button>
                  <button type="button" className="btn-tight bg-blue-700 text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40" disabled={!dusOk} title={dusOk ? "" : "Isi satuan dus lewat Ubah di Daftar Sparepart"} onClick={() => addProduct(item, true, false)}>{item.satuanAlt || "Dus"}</button>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${habis ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{habis ? "HABIS" : "CUKUP"}</span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="text-[11px] font-bold text-green-600">
                    {rupiah(item.hargaJual)} / {item.satuan}
                    {dusOk ? <span className="mt-0.5 block text-blue-700">{rupiah(item.hargaJualAlt)} / {item.satuanAlt}</span> : null}
                  </span>
                  <span className="text-right text-[10px] text-slate-500">Stok: {item.stok} {item.satuan}{dusOk ? ` · ${dusStok} ${item.satuanAlt}` : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel className={`flex flex-col ${metode === "Bon" ? "ring-2 ring-red-500" : ""}`}>
        <Field label="Kasir (Shift)">
          <select className={`${inputClass} font-bold text-blue-600`} value={shiftId} onChange={(e) => setShiftId(e.target.value)} disabled={me.role === "Kasir"}>
            {shifts.length === 0 ? <option value="">Tidak ada shift aktif</option> : null}
            {shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>{shift.shift} · {shift.cashierName}</option>
            ))}
          </select>
        </Field>
        <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${shiftId ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {shiftId
            ? `Terhubung ke laci ${shifts.find((s) => s.id === shiftId)?.shift || "shift"}. Penjualan ${me.role === "Kasir" ? "kasir" : "admin"} masuk ke kas shift ini. Kas laci ${rupiah(drawers[shiftId] ?? 0)}.`
            : "Shift belum terhubung. Admin harus membuka shift untuk akun kasir ini dulu."}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Keranjang Belanja</h3>
          <button className="text-[10px] text-red-500" onClick={() => setCart([])}>Kosongkan</button>
        </div>
        <div className="mt-3">
          <Field label="Pelanggan">
            <select className={inputClass} value={customer} onChange={(e) => {
              if (e.target.value === "__new__") {
                setPartnerOpen(true);
                setCustomer("Umum");
                return;
              }
              setCustomer(e.target.value);
            }}>
              <option value="Umum">Umum / Cash</option>
              <optgroup label="Pelanggan">
                {partners.filter((partner) => partner.tipe === "Pelanggan").map((partner) => <option key={partner.id} value={partner.nama}>{partner.nama}</option>)}
              </optgroup>
              <optgroup label="Supplier">
                {partners.filter((partner) => partner.tipe === "Supplier").map((partner) => <option key={partner.id} value={partner.nama}>{partner.nama}</option>)}
              </optgroup>
              <option value="__new__">+ Tambah Pelanggan Baru...</option>
            </select>
          </Field>
        </div>
        <ul className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-100">
          {cart.length === 0 ? <li className="p-4 text-center text-xs text-slate-400">Keranjang kosong</li> : null}
          {cart.map((line) => (
            <li key={line.key} className="border-b border-slate-100 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{line.nama}{line.kodePajak ? ` (${line.kodePajak})` : ""}</p>
                  {!line.custom && line.satuanAlt && !line.locked ? (
                    <select
                      className="mt-1 rounded border border-blue-300 bg-blue-50 p-0.5 text-[10px] font-bold text-blue-600"
                      value={line.isAlt ? "alt" : "base"}
                      onChange={(e) => {
                        const isAlt = e.target.value === "alt";
                        setCart((prev) => prev.map((item) => item.key === line.key ? { ...item, isAlt, satuan: isAlt ? item.satuanAlt : item.satuanBase, harga: isAlt ? item.hargaAlt : item.hargaBase, konv: isAlt ? item.isi : 1 } : item));
                      }}
                    >
                      <option value="base">{line.satuanBase}</option>
                      <option value="alt">{line.satuanAlt}</option>
                    </select>
                  ) : <p className="mt-0.5 text-[10px] font-bold text-indigo-600">{line.satuan}{line.isAlt ? ` · 1 ${line.satuan} = ${line.isi} pcs` : ""}</p>}
                  <p className="text-[10px] text-slate-500">Stok berkurang {line.qty * line.konv} pcs</p>
                </div>
                <button aria-label="Hapus" onClick={() => setCart((prev) => prev.filter((item) => item.key !== line.key))}><Trash2 className="size-3 text-red-400" /></button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button className="qty-btn bg-slate-200" onClick={() => setCart((prev) => prev.map((item) => item.key === line.key ? { ...item, qty: Math.max(1, item.qty - 1) } : item))}>-</button>
                  <input className="num w-10 rounded border border-slate-200 p-0.5 text-center text-xs" value={line.qty} onChange={(e) => {
                    const qty = Math.max(1, Number(e.target.value) || 1);
                    setCart((prev) => prev.map((item) => (item.key === line.key ? { ...item, qty } : item)));
                  }} />
                  <button className="qty-btn bg-slate-200" onClick={() => setCart((prev) => prev.map((item) => item.key === line.key ? { ...item, qty: item.qty + 1 } : item))}>+</button>
                </div>
                <label className="text-[10px] text-slate-500">
                  Harga {line.satuan}
                  <input className="num mt-0.5 w-28 rounded border border-slate-200 p-1 text-right text-xs font-bold" inputMode="numeric" value={grouped(line.harga)} onChange={(e) => {
                    const harga = digits(e.target.value);
                    setCart((prev) => prev.map((item) => (item.key === line.key ? { ...item, harga } : item)));
                  }} />
                </label>
                <span className="num text-xs font-bold">{rupiah(line.harga * line.qty)}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Metode Pembayaran</p>
              <button className="text-[10px] text-slate-500" onClick={() => { setMetode("Tunai"); setBayar(""); setBank(""); setDiskon(""); }}>Reset</button>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {([
                ["Tunai", "bg-green-500"],
                ["Transfer", "bg-blue-500"],
                ["Split", "bg-indigo-500"],
                ["Bon", "bg-red-500"],
              ] as const).map(([item, color]) => (
                <button key={item} className={`rounded-md py-2 text-xs font-bold ${metode === item ? `${color} text-white` : "border border-slate-200 bg-white text-slate-600"}`} onClick={() => setMetode(item)}>{item}</button>
              ))}
            </div>
            {metode === "Tunai" ? (
              <div className="space-y-2">
                <Field label="Uang Diterima (Tunai)">
                  <input className={`${inputClass} num text-right font-bold text-green-600`} inputMode="numeric" value={bayar} onChange={(e) => setBayar(grouped(digits(e.target.value)))} />
                </Field>
                <div className="flex gap-1.5">
                  <button type="button" className="flex-1 rounded bg-slate-200 py-1.5 text-[10px] font-bold" onClick={() => setBayar(grouped(total))}>Uang Pas</button>
                  {[50000, 100000, 200000].map((nominal) => (
                    <button key={nominal} type="button" className="flex-1 rounded bg-slate-200 py-1.5 text-[10px] font-bold" onClick={() => setBayar(grouped(nominal))}>{nominal / 1000}K</button>
                  ))}
                </div>
                <div className="flex justify-between rounded-lg border border-green-100 bg-green-50 p-2 text-sm">
                  <span className="font-medium text-green-600">Kembalian:</span>
                  <span className="num font-bold text-green-700">{rupiah(Math.max(kembalian, 0))}</span>
                </div>
              </div>
            ) : null}
            {metode === "Transfer" ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
                <p className="mb-2 text-center font-bold">Pembayaran Transfer dianggap Lunas</p>
                <Field label="Bank / Rekening Tujuan">
                  <select className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="">Pilih Bank / Rekening</option>
                    {banks.map((item) => <option key={item.id} value={item.nama}>{item.nama}</option>)}
                  </select>
                </Field>
              </div>
            ) : null}
            {metode === "Split" ? (
              <div className="space-y-2">
                <Field label="Uang Tunai Diberikan">
                  <input className={`${inputClass} num text-right font-bold text-green-600`} inputMode="numeric" value={bayar} onChange={(e) => setBayar(grouped(digits(e.target.value)))} />
                </Field>
                <div className="flex justify-between rounded-lg border border-indigo-100 bg-indigo-50 p-2 text-sm">
                  <span className="font-medium text-indigo-600">Sisa dibayar Transfer:</span>
                  <span className="num font-bold text-indigo-700">{rupiah(Math.max(sisaTf, 0))}</span>
                </div>
                <Field label="Bank / Rekening Transfer">
                  <select className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="">Pilih Bank / Rekening</option>
                    {banks.map((item) => <option key={item.id} value={item.nama}>{item.nama}</option>)}
                  </select>
                </Field>
              </div>
            ) : null}
            {metode === "Bon" ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-center text-xs font-medium text-red-700">Transaksi ini akan tercatat sebagai HUTANG (Bon).</div> : null}
          </div>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500">Total Item: <b className="text-slate-800">{cart.reduce((sum, line) => sum + line.qty, 0)}</b></span>
              <span>Subtotal: <b className="num">{rupiah(subtotal)}</b></span>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-orange-200 bg-white p-3">
              <span className="font-medium text-orange-600">Diskon (Rp):</span>
              <input className="num w-28 border-b border-orange-300 bg-transparent text-right font-bold text-red-600 outline-none" inputMode="numeric" value={diskon} onChange={(e) => setDiskon(grouped(digits(e.target.value)))} />
            </label>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total Bayar:</span>
              <span className="num text-2xl font-extrabold text-red-600">{rupiah(total)}</span>
            </div>
          </div>
          <button className="w-full rounded-lg bg-green-600 p-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || !shiftId || cart.length === 0 || (metode === "Tunai" && bayarNum < total) || (metode === "Split" && (bayarNum <= 0 || bayarNum >= total || !bank)) || (metode === "Transfer" && !bank) || (metode === "Bon" && customer === "Umum")} onClick={() => void pay()}>
            {busy ? "Menyimpan..." : metode === "Bon" ? "Simpan Bon (Hutang)" : "Proses Bayar & Simpan"}
          </button>
        </div>
      </Panel>
      {customOpen ? (
        <CustomItem
          onClose={() => setCustomOpen(false)}
          onAdd={(nama, harga) => {
            setCart((prev) => [...prev, { key: `c-${Date.now()}`, productId: null, nama, qty: 1, isAlt: false, locked: true, satuan: "Item", satuanBase: "Item", hargaBase: harga, satuanAlt: "", hargaAlt: 0, isi: 1, harga, konv: 1, kodePajak: "", custom: nama }]);
            setCustomOpen(false);
          }}
        />
      ) : null}
      {partnerOpen ? (
        <QuickPartner
          onClose={() => setPartnerOpen(false)}
          onSave={(nama) => {
            setCustomer(nama);
            setPartnerOpen(false);
            void listPartners().then(setPartners);
          }}
        />
      ) : null}
      {productOpen ? <QuickProduct onClose={() => setProductOpen(false)} onSaved={() => { setProductOpen(false); toast.success("Barang ditambahkan"); }} /> : null}
      {scanConfirm ? (
        <ScanConfirm
          product={scanConfirm.product}
          unit={scanConfirm.unit}
          onCancel={() => setScanConfirm(null)}
          onOk={(isAlt) => {
            addProduct(scanConfirm.product, isAlt, true);
            setScanConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomItem({ onClose, onAdd }: { onClose: () => void; onAdd: (nama: string, harga: number) => void }) {
  const [nama, setNama] = useState("");
  const [harga, setHarga] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-panel p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(nama.trim(), digits(harga));
        }}
      >
        <h3 className="font-semibold">Item jasa</h3>
        <div className="mt-3 space-y-3">
          <input className={inputClass} placeholder="Nama" value={nama} onChange={(e) => setNama(e.target.value)} />
          <input className={`${inputClass} num`} placeholder="Harga" inputMode="numeric" value={harga} onChange={(e) => setHarga(grouped(digits(e.target.value)))} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-11 px-3" onClick={onClose}>Batal</button>
          <PrimaryButton type="submit">Tambah</PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function QuickPartner({ onClose, onSave }: { onClose: () => void; onSave: (nama: string) => void }) {
  const [nama, setNama] = useState("");
  const [telp, setTelp] = useState("");
  const [busyForm, setBusyForm] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <form className="w-full max-w-sm rounded-2xl bg-panel p-4" onSubmit={(e) => {
        e.preventDefault();
        if (!nama.trim()) return;
        setBusyForm(true);
        void savePartner({ data: { nama: nama.trim(), tipe: "Pelanggan", telp, alamat: "" } })
          .then(() => onSave(nama.trim()))
          .catch((error: Error) => toast.error(error.message))
          .finally(() => setBusyForm(false));
      }}>
        <h3 className="font-semibold">Pelanggan baru</h3>
        <div className="mt-3 space-y-3">
          <input className={inputClass} placeholder="Nama pelanggan" value={nama} onChange={(e) => setNama(e.target.value)} />
          <input className={inputClass} placeholder="Telepon" value={telp} onChange={(e) => setTelp(e.target.value)} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-11 px-3" onClick={onClose}>Batal</button>
          <PrimaryButton type="submit" disabled={busyForm}>Simpan</PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function QuickProduct({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nama, setNama] = useState("");
  const [part, setPart] = useState("");
  const [kategori, setKategori] = useState("SPAREPART");
  const [harga, setHarga] = useState("");
  const [stok, setStok] = useState("0");
  const [busyForm, setBusyForm] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <form className="w-full max-w-sm rounded-2xl bg-panel p-4" onSubmit={(e) => {
        e.preventDefault();
        setBusyForm(true);
        void saveProduct({
          data: {
            partNumber: part, partNumbersAlt: "", nama, kategori, merek: "", satuan: "Pcs", stokMin: 0,
            stok: Number(stok) || 0, hargaBeli: 0, hargaJual: digits(harga), satuanAlt: "", isiSatuanAlt: 0,
            hargaJualAlt: 0, pajakStatus: "Non Pajak", kodePajak: "", keterangan: "",
          },
        }).then(() => onSaved()).catch((error: Error) => toast.error(error.message)).finally(() => setBusyForm(false));
      }}>
        <h3 className="font-semibold">Barang baru</h3>
        <p className="mt-1 text-xs text-muted">Satuan dus dan harga beli bisa dilengkapi nanti di Daftar Sparepart.</p>
        <div className="mt-3 space-y-3">
          <input className={inputClass} placeholder="Nama barang" value={nama} onChange={(e) => setNama(e.target.value)} />
          <input className={inputClass} placeholder="Part number" value={part} onChange={(e) => setPart(e.target.value)} />
          <input className={inputClass} placeholder="Kategori, contoh Oli" value={kategori} onChange={(e) => setKategori(e.target.value)} />
          <input className={`${inputClass} num`} placeholder="Harga jual" inputMode="numeric" value={harga} onChange={(e) => setHarga(grouped(digits(e.target.value)))} />
          <input className={`${inputClass} num`} placeholder="Stok awal" inputMode="numeric" value={stok} onChange={(e) => setStok(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-11 px-3" onClick={onClose}>Batal</button>
          <PrimaryButton type="submit" disabled={busyForm}>Simpan</PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function ScanConfirm({ product, unit, onCancel, onOk }: { product: Product; unit: "pcs" | "dus" | null; onCancel: () => void; onOk: (isAlt: boolean) => void }) {
  const dusOk = Boolean(product.satuanAlt && product.isiSatuanAlt > 0);
  const [mode, setMode] = useState<"pcs" | "dus">(unit === "dus" && dusOk ? "dus" : "pcs");
  const dusStok = dusOk ? Math.floor(product.stok / product.isiSatuanAlt) : 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-panel p-4">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">Cek barang sebelum masuk keranjang</p>
        <h3 className="mt-1 text-lg font-extrabold">{product.nama}</h3>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-800">{product.kategori || "Tanpa kategori"}</span>
          {product.merek ? <span className="rounded-full bg-slate-100 px-2 py-1 font-bold">{product.merek}</span> : null}
        </div>
        <p className="mt-2 font-mono text-xs text-blue-700">PN: {product.partNumber || product.kode || "-"}{product.kodePajak ? ` · Pajak ${product.kodePajak}` : ""}</p>
        <p className="mt-1 text-sm">Stok: {product.stok} {product.satuan}{dusOk ? ` · ${dusStok} ${product.satuanAlt}` : ""}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className={`rounded-xl border-2 p-3 text-left ${mode === "pcs" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`} onClick={() => setMode("pcs")}>
            <b>Pcs</b>
            <span className="mt-1 block text-sm">{rupiah(product.hargaJual)} / {product.satuan}</span>
          </button>
          <button type="button" className={`rounded-xl border-2 p-3 text-left disabled:opacity-40 ${mode === "dus" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200"}`} disabled={!dusOk} onClick={() => setMode("dus")}>
            <b>{product.satuanAlt || "Dus"}</b>
            <span className="mt-1 block text-sm">{dusOk ? `${rupiah(product.hargaJualAlt)} · isi ${product.isiSatuanAlt} pcs` : "Tidak ada dus"}</span>
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="rounded-xl border border-slate-300 py-3 font-bold" onClick={onCancel}>Batal</button>
          <button type="button" className="rounded-xl bg-green-600 py-3 font-bold text-white" onClick={() => onOk(mode === "dus")}>Lanjut</button>
        </div>
      </div>
    </div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* ignore */
  }
}

