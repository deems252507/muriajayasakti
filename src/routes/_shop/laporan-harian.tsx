import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { inputClass, MarkWords, Panel } from "@/components/shop/shell";
import { lhCustomers, lhDeleteLine, lhDeleteNota, lhList, lhSaveLine, lhSaveNota, lhSearchProducts, type LhLine, type LhNota } from "@/lib/shop/api";
import { digits, grouped, monthSpan, todayInput } from "@/lib/shop/format";
import { notaTotal, printHarian, sumTotal, type LhTab } from "@/lib/shop/print-harian";
import { usePersistedState } from "@/lib/persist";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/laporan-harian")({ component: LaporanHarianPage });

const TABS: Array<{ id: LhTab; label: string; cls: string; active: string }> = [
  { id: "BON", label: "BON", cls: "bg-red-600 text-white", active: "ring-2 ring-offset-1 ring-red-600" },
  { id: "CASH", label: "CASH", cls: "bg-sky-500 text-white", active: "ring-2 ring-offset-1 ring-sky-500" },
  { id: "IMRON", label: "IMRON MOTOR", cls: "bg-black text-white", active: "ring-2 ring-offset-1 ring-black" },
  { id: "MJB", label: "MJB", cls: "bg-yellow-300 text-black", active: "ring-2 ring-offset-1 ring-yellow-500" },
];

const shiftDay = (iso: string, d: number) => {
  const dt = new Date(`${iso}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().slice(0, 10);
};
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const rp = (n: number) => `Rp ${grouped(n)}`;
/** Harga Satuan 2 = harga dikurangi persen, dibulatkan ke ribuan terdekat (sama seperti di Excel). */
const hargaNet = (harga: number, persen: number) => (harga <= 0 ? 0 : Math.round((harga * (1 - persen / 100)) / 1000) * 1000);
const totalNet = (ns: LhNota[]) => ns.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.pcs * hargaNet(l.harga, l.persen), 0), 0);

function LaporanHarianPage() {
  const me = Route.useRouteContext().me;
  const readOnly = me.role === "Owner";
  const [tab, setTab] = usePersistedState<LhTab>("lh:tab", "CASH");
  const [tanggal, setTanggal] = usePersistedState("lh:tanggal", todayInput());
  const [notas, setNotas] = useState<LhNota[]>([]);
  const [imron, setImron] = useState<LhNota[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const newNotaRef = useRef<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const jobs: Array<Promise<unknown>> = [lhList({ data: { tab, start: tanggal, end: tanggal } }).then(setNotas)];
    jobs.push(tab === "CASH" ? lhList({ data: { tab: "IMRON", start: tanggal, end: tanggal } }).then(setImron) : Promise.resolve(setImron([])));
    if (tab === "BON") jobs.push(lhCustomers().then(setCustomers));
    void Promise.all(jobs).catch((e: Error) => toast.error(e.message)).finally(() => setLoading(false));
  }, [tab, tanggal]);
  useEffect(() => { load(); }, [load]);

  async function addNota() {
    try {
      const res = await lhSaveNota({ data: { tab, tanggal, customer: "" } });
      newNotaRef.current = res.id;
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function cetak(kind: "hari" | "bulan" | "tahun") {
    const y = Number(tanggal.slice(0, 4));
    const m = Number(tanggal.slice(5, 7));
    const range = kind === "hari" ? { start: tanggal, end: tanggal } : kind === "bulan" ? monthSpan(y, m) : { start: `${y}-01-01`, end: `${y}-12-31` };
    try {
      const [main, im] = await Promise.all([
        lhList({ data: { tab, ...range } }),
        tab === "CASH" ? lhList({ data: { tab: "IMRON", ...range } }) : Promise.resolve([] as LhNota[]),
      ]);
      printHarian(tab, main, im, range.start, range.end);
    } catch (e) { toast.error((e as Error).message); }
  }

  const cashTotal = sumTotal(notas);
  const imronTotal = sumTotal(imron);
  const isMjb = tab === "MJB";
  const perName = new Map<string, number>();
  if (tab === "BON") for (const n of notas) perName.set(n.customer || "(tanpa nama)", (perName.get(n.customer || "(tanpa nama)") ?? 0) + notaTotal(n));

  return (
    <div className="space-y-3 pb-20">
      <Panel>
        <h2 className="text-lg font-extrabold">Laporan Harian</h2>
        <p className="text-xs text-muted">Catatan mandiri seperti Excel — tidak mengubah stok, kas, atau kasir. Garis kotak = satu nota. Barang diambil dari master, atau ketik sendiri jika tidak ada.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <button type="button" className="h-11 rounded-lg bg-slate-100 px-3" onClick={() => setTanggal(shiftDay(tanggal, -1))}><ChevronLeft size={18} /></button>
          <label className="text-xs text-muted">Tanggal
            <input className={`${inputClass} mt-1`} type="date" value={tanggal} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
          </label>
          <button type="button" className="h-11 rounded-lg bg-slate-100 px-3" onClick={() => setTanggal(shiftDay(tanggal, 1))}><ChevronRight size={18} /></button>
          <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" onClick={() => setTanggal(todayInput())}>Hari Ini</button>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="inline-flex h-11 items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => void cetak("hari")}><Printer size={15} /> Cetak Tanggal</button>
            <button type="button" className="inline-flex h-11 items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => void cetak("bulan")}><Printer size={15} /> Cetak Bulan</button>
            <button type="button" className="inline-flex h-11 items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white" onClick={() => void cetak("tahun")}><Printer size={15} /> Cetak Tahun</button>
          </div>
        </div>
      </Panel>

      <Panel>
        <p className="text-sm font-bold italic">{isMjb ? "Pembelian MJB" : "Barang Keluar Customer"} Per {ddmmyyyy(tanggal)} — {tab === "IMRON" ? "IMRON MOTOR" : tab}</p>
        {tab === "IMRON" && <p className="text-xs text-muted">Input Imron di sini. Otomatis tampil di tab CASH, di bawah penanda tanggal.</p>}
        {loading && <p className="mt-2 text-xs text-muted">Memuat…</p>}

        <div className="mt-3 space-y-3">
          {notas.map((n, i) => (
            <NotaBox key={n.id} nota={n} no={i + 1} tab={tab} readOnly={readOnly} customers={customers} autoFocusName={newNotaRef.current === n.id} onChanged={load} />
          ))}
          {!notas.length && !loading && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-muted">Belum ada nota pada tanggal ini.</p>}
          {!readOnly && !(isMjb && notas.length >= 1) && (
            <button type="button" className="inline-flex h-11 items-center gap-1 rounded-lg bg-accent px-4 text-sm font-bold text-white" onClick={() => void addNota()}>
              <Plus size={16} /> {isMjb ? "Mulai catat hari ini" : "Nota baru"}
            </button>
          )}
        </div>

        {tab === "CASH" && imron.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="px-1 text-sm font-extrabold text-red-700">({ddmmyyyy(tanggal)})</div>
            {imron.map((n, i) => (
              <NotaBox key={n.id} nota={n} no={notas.length + i + 1} tab="IMRON" readOnly customers={[]} onChanged={load} />
            ))}
          </div>
        )}

        {!isMjb && (
          <div className="mt-4 max-w-md rounded-lg border-2 border-black p-3">
            <p className="text-lg font-extrabold">Keterangan :</p>
            {tab === "BON" && [...perName.entries()].map(([k, v]) => (
              <div key={k} className="flex justify-between border-t border-slate-300 py-1 font-bold"><span>{k}</span><span>{rp(v)}</span></div>
            ))}
            {tab === "CASH" && imronTotal > 0 && (
              <div className="flex justify-between border-t border-slate-300 py-1 text-sm"><span>Termasuk bon Imron</span><span>{rp(imronTotal)}</span></div>
            )}
            <div className="flex justify-between border-t border-black py-1 text-base font-extrabold">
              <span>{tab === "BON" ? "Total Bon" : "Total Penjualan Bruto"}</span>
              <span>{rp(cashTotal + (tab === "CASH" ? imronTotal : 0))}</span>
            </div>
            <div className="flex justify-between border-t border-slate-300 py-1 text-base font-extrabold text-red-600">
              <span>Total Penjualan Netto (%)</span>
              <span>{rp(totalNet(notas) + (tab === "CASH" ? totalNet(imron) : 0))}</span>
            </div>
            <p className="text-[11px] text-muted">Baris merah hanya untuk catatan di layar, tidak ikut tercetak.</p>
          </div>
        )}
      </Panel>

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-1 md:left-[260px] border-t border-slate-300 bg-white/95 px-2 py-2 backdrop-blur">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`h-10 rounded-md px-4 text-xs font-extrabold ${t.cls} ${tab === t.id ? t.active : "opacity-70"}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotaBox({ nota, no, tab, readOnly, customers, autoFocusName, onChanged }: {
  nota: LhNota; no: number; tab: LhTab; readOnly: boolean; customers: string[]; autoFocusName?: boolean; onChanged: () => void;
}) {
  const [customer, setCustomer] = useState(nota.customer);
  useEffect(() => setCustomer(nota.customer), [nota.customer]);
  const showHarga = tab !== "MJB";
  const showPn = tab !== "MJB";
  const fail = (e: unknown) => toast.error((e as Error).message);

  async function saveCustomer() {
    if (customer.trim() === nota.customer) return;
    try { await lhSaveNota({ data: { id: nota.id, tab, tanggal: nota.tanggal, customer } }); onChanged(); } catch (e) { fail(e); }
  }
  async function hapusNota() {
    if (!window.confirm(`Hapus seluruh nota ${tab === "MJB" ? "hari ini" : `no ${no}`} beserta ${nota.lines.length} barangnya?`)) return;
    try { await lhDeleteNota({ data: { id: nota.id } }); onChanged(); } catch (e) { fail(e); }
  }

  return (
    <div className="rounded-lg border-2 border-black bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-black bg-slate-100 px-2 py-1">
        <span className="text-sm font-extrabold">{tab === "MJB" ? "MJB" : `NO ${no}`}</span>
        {tab === "BON" && (
          <>
            <input
              className="h-9 w-56 rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold"
              list={`lh-cust-${nota.id}`}
              placeholder="Nama customer bon (mis. Waban)"
              value={customer}
              autoFocus={autoFocusName}
              disabled={readOnly}
              onChange={(e) => setCustomer(e.target.value)}
              onBlur={() => void saveCustomer()}
            />
            <datalist id={`lh-cust-${nota.id}`}>{customers.map((c) => <option key={c} value={c} />)}</datalist>
          </>
        )}
        <span className="ml-auto text-sm font-extrabold">{showHarga ? rp(notaTotal(nota)) : ""}</span>
        {!readOnly && <button type="button" title="Hapus nota" className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => void hapusNota()}><Trash2 size={16} /></button>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-muted">
              {showPn && <th className="w-44 px-2 py-1 text-left">Part Number</th>}
              <th className="px-2 py-1 text-left">Nama Barang</th>
              <th className="w-16 px-2 py-1 text-center">{tab === "MJB" ? "Jumlah" : "Pcs"}</th>
              {showHarga && <th className="w-28 px-2 py-1 text-right">Harga</th>}
              {showHarga && <th className="w-28 px-2 py-1 text-right">Total</th>}
              {showHarga && <th className="w-16 px-2 py-1 text-center text-red-600">Persen %</th>}
              {showHarga && <th className="w-28 px-2 py-1 text-right text-red-600">Harga 2</th>}
              {showHarga && <th className="w-28 px-2 py-1 text-right text-red-600">Total Persen</th>}
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {nota.lines.map((l) => (
              <LineRow key={`${l.id}-${l.partNumber}-${l.nama}-${l.pcs}-${l.harga}-${l.persen}`} line={l} notaId={nota.id} showPn={showPn} showHarga={showHarga} readOnly={readOnly} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && <AddLine notaId={nota.id} tab={tab} onChanged={onChanged} />}
    </div>
  );
}

function LineRow({ line, notaId, showPn, showHarga, readOnly, onChanged }: {
  line: LhLine; notaId: number; showPn: boolean; showHarga: boolean; readOnly: boolean; onChanged: () => void;
}) {
  const [pn, setPn] = useState(line.partNumber);
  const [nama, setNama] = useState(line.nama);
  const [pcs, setPcs] = useState(String(line.pcs));
  const [harga, setHarga] = useState(String(line.harga));
  const [persen, setPersen] = useState(String(line.persen));
  const cell = "h-9 w-full rounded-md border border-transparent bg-transparent px-2 hover:border-slate-300 focus:border-accent focus:bg-white";

  async function save() {
    const next = { partNumber: pn.trim(), nama: nama.trim(), pcs: Number(String(pcs).replace(",", ".")) || 0, harga: digits(harga), persen: Math.min(100, Math.max(0, Number(String(persen).replace(",", ".")) || 0)) };
    if (next.partNumber === line.partNumber && next.nama === line.nama && next.pcs === line.pcs && next.harga === line.harga && next.persen === line.persen) return;
    if (!next.nama) { toast.error("Nama barang tidak boleh kosong."); setNama(line.nama); return; }
    try { await lhSaveLine({ data: { id: line.id, notaId, ...next } }); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  async function hapus() {
    try { await lhDeleteLine({ data: { id: line.id } }); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  const blur = () => void save();

  return (
    <tr className="border-t border-slate-200">
      {showPn && <td className="px-1"><input className={cell} value={pn} disabled={readOnly} onChange={(e) => setPn(e.target.value)} onBlur={blur} /></td>}
      <td className="px-1"><input className={cell} value={nama} disabled={readOnly} onChange={(e) => setNama(e.target.value)} onBlur={blur} /></td>
      <td className="px-1"><input className={`${cell} text-center`} inputMode="decimal" value={pcs} disabled={readOnly} onChange={(e) => setPcs(e.target.value)} onBlur={blur} /></td>
      {showHarga && <td className="px-1"><input className={`${cell} text-right`} inputMode="numeric" value={grouped(digits(harga))} disabled={readOnly} onChange={(e) => setHarga(String(digits(e.target.value)))} onBlur={blur} /></td>}
      {showHarga && <td className="px-2 text-right font-bold">{grouped(line.pcs * line.harga)}</td>}
      {showHarga && <td className="px-1"><input className={`${cell} text-center text-red-600`} inputMode="decimal" value={persen} disabled={readOnly} onChange={(e) => setPersen(e.target.value)} onBlur={blur} /></td>}
      {showHarga && <td className="px-2 text-right font-bold text-red-600">{grouped(hargaNet(line.harga, line.persen))}</td>}
      {showHarga && <td className="px-2 text-right font-bold text-red-600">{grouped(line.pcs * hargaNet(line.harga, line.persen))}</td>}
      {!readOnly && <td className="px-1 text-center"><button type="button" title="Hapus baris" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" onClick={() => void hapus()}><Trash2 size={15} /></button></td>}
    </tr>
  );
}

function AddLine({ notaId, tab, onChanged }: { notaId: number; tab: LhTab; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 1) { setHits([]); return; }
    const timer = setTimeout(() => void lhSearchProducts({ data: { q, limit: 30 } }).then((r) => { setHits(r); setActive(0); }).catch(() => setHits([])), 160);
    return () => clearTimeout(timer);
  }, [q]);

  async function add(input: { partNumber: string; nama: string; harga: number; productId?: number; pcs?: number }) {
    try {
      await lhSaveLine({ data: { notaId, partNumber: input.partNumber, nama: input.nama, pcs: input.pcs ?? 1, harga: tab === "MJB" ? 0 : input.harga, productId: input.productId ?? null } });
      setQ(""); setHits([]);
      onChanged();
      ref.current?.focus();
    } catch (e) { toast.error((e as Error).message); }
  }
  /** Kolom Part Number di nota = "Merek PartNumber" (mis. "Indoparts 23300-06010-000"); tanpa part number dikosongkan. */
  const pnLabel = (p: Product) => {
    const pn = p.partNumber.trim();
    const merek = p.merek.trim();
    if (!pn) return "";
    return merek && !pn.toLowerCase().startsWith(merek.toLowerCase()) ? `${merek} ${pn}` : pn;
  };
  const pick = (p: Product) => void add({ partNumber: pnLabel(p), nama: p.nama, harga: p.hargaJual, productId: p.id });
  const free = () => { if (q.trim()) void add({ partNumber: "", nama: q.trim(), harga: 0 }); };

  return (
    <div className="relative border-t border-slate-200 p-2">
      <div className="flex flex-wrap gap-2">
        <input
          ref={ref}
          className={`${inputClass} flex-1`}
          placeholder="Cari barang dari master (nama / part number), Enter untuk pilih…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (hits[active]) pick(hits[active]); else free(); }
          }}
        />
        <button type="button" className="h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold" disabled={!q.trim()} onClick={free}>+ Ketik sendiri (tidak ada di master)</button>
        {tab === "MJB" && <button type="button" className="h-11 rounded-lg bg-yellow-200 px-3 text-xs font-bold" onClick={() => void add({ partNumber: "", nama: "TIDAK ADA PEMBELIAN", harga: 0, pcs: 0 })}>TIDAK ADA PEMBELIAN</button>}
      </div>
      {hits.length > 0 && (
        <ul className="absolute inset-x-2 z-10 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {hits.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === active ? "bg-blue-50" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => pick(p)}>
                <span>
                  <b><MarkWords text={p.nama} q={q} /></b><br />
                  <span className="text-xs text-muted">
                    PN: <MarkWords text={p.partNumber || "-"} q={q} />
                    {p.partNumbersAlt ? <> · Alt: <MarkWords text={p.partNumbersAlt} q={q} /></> : null}
                    {p.merek ? <> · <MarkWords text={p.merek} q={q} /></> : null}
                    {p.kategori ? <> · <MarkWords text={p.kategori} q={q} /></> : null}
                  </span>
                </span>
                <span className="whitespace-nowrap text-xs font-bold">{tab === "MJB" ? "" : rp(p.hargaJual)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
