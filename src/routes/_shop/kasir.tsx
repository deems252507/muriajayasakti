import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { checkout, listMasters, listPartners, listShifts, searchProducts } from "@/lib/shop/api";
import { digits, grouped, rupiah, when } from "@/lib/shop/format";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanLock = useRef(false);

  useEffect(() => {
    void listShifts().then((res) => {
      const active = res.shifts.filter((s) => s.status === "AKTIF" && (me.role !== "Kasir" || s.username === me.username));
      setShifts(active);
      if (active[0]) setShiftId(active[0].id);
    });
    void listPartners().then(setPartners);
    void listMasters().then((res) => setBanks(res.banks.filter((b) => b.aktif)));
  }, [me.role, me.username]);

  useEffect(() => {
    if (q.trim().length < 1) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchProducts({ data: { q } }).then((res) => {
        if (res.unit && res.items[0]) {
          addProduct(res.items[0], res.unit === "dus", true);
          setQ("");
          setHits([]);
          beep();
          return;
        }
        setHits(res.items);
      });
    }, 160);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!camera || !videoRef.current) return;
    const video = videoRef.current;
    let stop = false;
    let stream: MediaStream | null = null;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        await video.play();
        if (!Detector) {
          toast.error("Browser ini tidak punya pembaca barcode. Ketik kode atau pakai alat scan.");
          return;
        }
        const detector = new Detector({ formats: ["code_128", "ean_13", "code_39", "qr_code"] });
        const tick = async () => {
          if (stop) return;
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue;
            if (value && !scanLock.current) {
              scanLock.current = true;
              setQ(value);
              beep();
              setCamera(false);
              return;
            }
          } catch {
            /* frame not ready */
          }
          requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        toast.error("Kamera tidak bisa dibuka.");
        setCamera(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
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
              : { productId: line.productId, qty: line.qty, isAlt: line.isAlt },
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
      printReceipt(result);
      setCart([]);
      setBayar("");
      setDiskon("");
      setMetode("Tunai");
      toast.success(`Nota ${result.nomor} tersimpan.`);
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
          placeholder="Ketik Nama / Scan Barcode..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              e.preventDefault();
              addProduct(hits[0], false, false);
              setQ("");
              setHits([]);
            }
          }}
        />
        {camera ? (
          <div className="relative mt-3 overflow-hidden rounded-lg bg-slate-900">
            <video ref={videoRef} className="aspect-video w-full" muted playsInline />
            <button className="absolute top-2 right-2 rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white" onClick={() => setCamera(false)}>Tutup Kamera</button>
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          {me.role === "Admin" ? (
            <button className="flex min-h-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500" onClick={() => toast.message("Barang baru ditambah dari menu Daftar Sparepart.")}>Tambah Baru</button>
          ) : null}
          <button className="flex min-h-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-purple-300 text-xs text-purple-500" onClick={() => setCustomOpen(true)}>Jasa / Item Custom</button>
          {!camera ? <button className="flex min-h-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-green-300 text-xs text-green-500" onClick={() => setCamera(true)}>Scan Barcode (Kamera)</button> : null}
          {hits.map((item) => (
            <button key={item.id} className="flex min-h-20 flex-col justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-blue-500 hover:bg-blue-50" onClick={() => { addProduct(item, false, false); setQ(""); setHits([]); }}>
              <span>
                <span className="line-clamp-2 text-xs font-medium">{item.nama}{item.kodePajak ? ` (${item.kodePajak})` : ""}</span>
                <span className="mt-1 block font-mono text-[10px] text-blue-600">PN: {item.partNumber || item.kode}</span>
                {item.merek ? <span className="mt-0.5 block text-[10px] text-slate-500">{item.merek}</span> : null}
              </span>
              <span className="mt-2 flex items-end justify-between">
                <span className="text-sm font-bold text-green-600">{rupiah(item.hargaJual)}</span>
                <span className="text-[10px] text-slate-500">Stok: {item.stok} {item.satuan}</span>
              </span>
              {item.satuanAlt ? (
                <span className="mt-2 text-[10px] font-bold text-blue-600" onClick={(event) => { event.stopPropagation(); addProduct(item, true, true); setQ(""); setHits([]); }}>+ {item.satuanAlt}</span>
              ) : null}
            </button>
          ))}
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
        <div className="mt-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Keranjang Belanja</h3>
          <button className="text-[10px] text-red-500" onClick={() => setCart([])}>Kosongkan</button>
        </div>
        <div className="mt-3">
          <Field label="Pelanggan">
            <select className={inputClass} value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="Umum">Umum / Cash</option>
              <optgroup label="Pelanggan">
                {partners.filter((partner) => partner.tipe === "Pelanggan").map((partner) => <option key={partner.id} value={partner.nama}>{partner.nama}</option>)}
              </optgroup>
              <optgroup label="Supplier">
                {partners.filter((partner) => partner.tipe === "Supplier").map((partner) => <option key={partner.id} value={partner.nama}>{partner.nama}</option>)}
              </optgroup>
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
                  ) : <p className="mt-0.5 text-[10px] font-bold text-indigo-600">{line.satuan}{line.isAlt ? ` (@${line.konv})` : ""}</p>}
                </div>
                <button aria-label="Hapus" onClick={() => setCart((prev) => prev.filter((item) => item.key !== line.key))}><Trash2 className="size-3 text-red-400" /></button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button className="size-5 rounded bg-slate-100 text-xs font-bold" onClick={() => setCart((prev) => prev.map((item) => item.key === line.key ? { ...item, qty: Math.max(1, item.qty - 1) } : item))}>-</button>
                  <input className="num w-10 rounded border border-slate-200 p-0.5 text-center text-xs" value={line.qty} onChange={(e) => {
                    const qty = Math.max(1, Number(e.target.value) || 1);
                    setCart((prev) => prev.map((item) => (item.key === line.key ? { ...item, qty } : item)));
                  }} />
                  <button className="size-5 rounded bg-slate-100 text-xs font-bold" onClick={() => setCart((prev) => prev.map((item) => item.key === line.key ? { ...item, qty: item.qty + 1 } : item))}>+</button>
                </div>
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
          <button className="w-full rounded-lg bg-green-600 p-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || !shiftId || cart.length === 0} onClick={() => void pay()}>
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

function printReceipt(result: {
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
}) {
  const rows = (result.lines ?? []).map((line) => {
    const lineTotal = Number(line.harga) * Number(line.qty);
    return `<div style="margin-bottom:6px"><b>${line.nama}${line.kodePajak ? " (" + line.kodePajak + ")" : ""}</b><div style="display:flex;justify-content:space-between"><span>${line.qty} ${line.satuan} x ${rupiah(line.harga)}</span><span>${rupiah(lineTotal)}</span></div></div>`;
  }).join("");
  const pay = result.status === "Bon"
    ? `<div style="text-align:center;border:2px solid #8f2d2d;color:#8f2d2d;padding:6px;font-weight:700">BON / BELUM LUNAS</div>`
    : `<div>Metode: ${result.metode}</div>${result.bank ? `<div>Bank: ${result.bank}</div>` : ""}${result.metode === "Tunai" ? `<div>Terima: ${rupiah(result.bayarTunai)}</div><div>Kembali: ${rupiah(result.kembalian)}</div>` : ""}${result.metode === "Split" ? `<div>Tunai: ${rupiah(result.bayarTunai)}</div><div>Transfer: ${rupiah(result.transfer)}</div>` : ""}`;
  const html = `<!doctype html><html><head><title>${result.nomor}</title><style>@page{size:80mm auto;margin:0}body{font-family:monospace;width:80mm;margin:0;padding:8px;font-size:12px}</style></head><body>
    <div style="text-align:center"><b>MURIA JAYA SAKTI</b><div>Jl. Raja Alam RT.13 No.22</div><div>0852-4717-7445</div></div>
    <hr>
    <div>No: ${result.nomor}</div><div>${when(new Date().toISOString())}</div><div>Kasir: ${result.kasir}</div><div>Pelanggan: ${result.customer}</div>
    <hr>${rows}<hr>
    <div style="display:flex;justify-content:space-between"><span>Subtotal</span><b>${rupiah(result.subtotal)}</b></div>
    ${Number(result.diskon) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Diskon</span><b>- ${rupiah(result.diskon)}</b></div>` : ""}
    <div style="display:flex;justify-content:space-between;font-size:16px"><span>TOTAL</span><b>${rupiah(result.total)}</b></div>
    <hr>${pay}<p style="text-align:center">Terima kasih</p>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}
