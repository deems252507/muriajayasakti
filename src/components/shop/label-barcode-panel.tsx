import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, PrimaryButton } from "@/components/shop/shell";
import { getLabelBarcode, saveLabelBarcode } from "@/lib/shop/api";
import { FIELDS_DEFAULTS, FIELDS_NAMA_HARGA, LABEL_DEFAULTS, LABEL_FIELDS, cleanLabelOptions, labelAdaIsi, type LabelFields, type LabelOptions, type LabelUnit } from "@/lib/shop/label-settings";

/** Satu set pilihan untuk satu jenis label (Pcs atau Dus), lengkap dengan contoh tampilannya. */
function UnitBox({ title, sub, value, onChange }: { title: string; sub: string; value: LabelFields; onChange: (next: LabelFields) => void }) {
  const toggle = (key: keyof LabelFields) => onChange({ ...value, [key]: !value[key] });
  const lines = [value.nama && "CLUTCH OPERATING ASSY Saurus", [value.merek && "Birkens", value.partNumber && "PN 31470-37080"].filter(Boolean).join(" · "), value.kodePajak && "101731"].filter(Boolean) as string[];
  const kosong = value.aktif && !labelAdaIsi(value);
  return (
    <div className="rounded-xl border border-line p-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" className="mt-1 size-4" checked={value.aktif} onChange={() => toggle("aktif")} />
        <span>
          <span className="block text-sm font-extrabold">{title}</span>
          <span className="block text-[11px] text-muted">{sub}</span>
        </span>
      </label>
      <div className={`mt-2 ${value.aktif ? "" : "pointer-events-none opacity-40"}`}>
        <div className="grid gap-1.5">
          {LABEL_FIELDS.map((f) => {
            const off = f.key === "kodeBarcode" && !value.barcode;
            return (
              <label key={f.key} className={`flex items-start gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm font-semibold ${off ? "opacity-50" : "cursor-pointer"}`}>
                <input type="checkbox" className="mt-0.5 size-4" checked={value[f.key] && !off} disabled={off} onChange={() => toggle(f.key)} />
                <span>
                  {f.label}
                  {f.hint ? <span className="block text-[11px] font-normal text-muted">{f.hint}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex gap-3 text-xs">
          <button type="button" className="btn-inline text-accent" onClick={() => onChange({ ...FIELDS_DEFAULTS })}>Tampilkan semua</button>
          <button type="button" className="btn-inline text-slate-600" onClick={() => onChange({ ...FIELDS_NAMA_HARGA })}>Hanya nama + harga</button>
        </div>
        {kosong ? <p role="alert" className="mt-1 text-xs font-semibold text-red-700">Belum ada yang dicentang.</p> : null}
      </div>
      <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Contoh</p>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-center">
        {!value.aktif ? <p className="py-6 text-xs text-slate-400">Label ini tidak dicetak</p> : null}
        {value.aktif && !labelAdaIsi(value) ? <p className="py-6 text-xs text-slate-400">Kosong</p> : null}
        {value.aktif ? lines.map((t, i) => (
          <p key={i} className={i === 0 && value.nama ? "text-sm font-extrabold leading-snug" : "text-xs leading-snug"}>{t}</p>
        )) : null}
        {value.aktif && value.barcode ? (
          <div className="mx-auto mt-1.5 h-9 w-36" style={{ backgroundImage: "repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px,#111 4px 5px,#fff 5px 8px)" }} aria-hidden="true" />
        ) : null}
        {value.aktif && value.barcode && value.kodeBarcode ? <p className="font-mono text-[11px]">SP-1944-PCS</p> : null}
        {value.aktif && value.harga ? <p className="mt-1 text-base font-semibold">Rp 120.000</p> : null}
      </div>
    </div>
  );
}

/** Pengaturan isi label barcode: label Pcs dan label Dus diatur sendiri-sendiri, lalu Simpan. Berlaku untuk semua akun. */
export function LabelBarcodePanel() {
  const [opt, setOpt] = useState<LabelOptions>(LABEL_DEFAULTS);
  const [saved, setSaved] = useState<LabelOptions>(LABEL_DEFAULTS);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getLabelBarcode().then((res) => { const v = cleanLabelOptions(res); setOpt(v); setSaved(v); }).catch((err: Error) => toast.error(err.message));
  }, []);

  const set = (unit: LabelUnit, next: LabelFields) => setOpt((prev) => ({ ...prev, [unit]: next }));
  const berubah = JSON.stringify(opt) !== JSON.stringify(saved);
  const tidakAdaYangTercetak = !labelAdaIsi(opt.pcs) && !labelAdaIsi(opt.dus);
  const simpan = () => {
    setBusy(true);
    void saveLabelBarcode({ data: opt })
      .then((res) => { const v = cleanLabelOptions(res); setOpt(v); setSaved(v); toast.success("Isi label barcode disimpan", { description: "Berlaku untuk semua akun." }); })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <Panel id="label-barcode">
      <h2 className="font-extrabold">Label Barcode</h2>
      <p className="mt-1 text-xs text-muted">Atur isi label untuk tombol Barcode di Daftar Sparepart. Label Pcs dan label Dus diatur sendiri-sendiri, misalnya label Pcs tanpa barcode dan label Dus tanpa harga. Berlaku untuk semua akun.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <UnitBox title="Label Pcs" sub="Satuan dasar / kecil" value={opt.pcs} onChange={(next) => set("pcs", next)} />
        <UnitBox title="Label Dus" sub="Satuan besar, hanya untuk barang yang punya Dus" value={opt.dus} onChange={(next) => set("dus", next)} />
      </div>
      {tidakAdaYangTercetak ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">Tidak ada label yang akan tercetak. Aktifkan dan centang minimal satu isi.</p> : null}
      <div className="mt-3">
        <PrimaryButton type="button" disabled={busy || !berubah || tidakAdaYangTercetak} onClick={simpan}>{busy ? "Menyimpan..." : "Simpan Isi Label"}</PrimaryButton>
      </div>
    </Panel>
  );
}
