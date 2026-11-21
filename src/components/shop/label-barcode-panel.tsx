import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, PrimaryButton } from "@/components/shop/shell";
import { getLabelBarcode, saveLabelBarcode } from "@/lib/shop/api";
import { LABEL_DEFAULTS, LABEL_FIELDS, cleanLabelOptions, type LabelOptions } from "@/lib/shop/label-settings";

/** Pengaturan isi label barcode: centang apa saja yang ikut tercetak, lalu Simpan. Berlaku untuk semua akun. */
export function LabelBarcodePanel() {
  const [opt, setOpt] = useState<LabelOptions>(LABEL_DEFAULTS);
  const [saved, setSaved] = useState<LabelOptions>(LABEL_DEFAULTS);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getLabelBarcode().then((res) => { const v = cleanLabelOptions(res); setOpt(v); setSaved(v); }).catch((err: Error) => toast.error(err.message));
  }, []);

  const set = (next: LabelOptions) => setOpt(next);
  const berubah = JSON.stringify(opt) !== JSON.stringify(saved);
  const simpan = () => {
    setBusy(true);
    void saveLabelBarcode({ data: opt })
      .then((res) => { const v = cleanLabelOptions(res); setOpt(v); setSaved(v); toast.success("Isi label barcode disimpan", { description: "Berlaku untuk semua akun." }); })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false));
  };
  const toggle = (key: keyof LabelOptions) => set({ ...opt, [key]: !opt[key] });
  const kosong = !LABEL_FIELDS.some((f) => opt[f.key]);
  const lines = [opt.nama && "CLUTCH OPERATING ASSY Saurus", [opt.merek && "Birkens", opt.partNumber && "PN 31470-37080"].filter(Boolean).join(" · "), opt.kodePajak && "101731"].filter(Boolean) as string[];

  return (
    <Panel id="label-barcode">
      <h2 className="font-extrabold">Label Barcode</h2>
      <p className="mt-1 text-xs text-muted">Centang isi yang ingin tercetak di label (tombol Barcode di Daftar Sparepart). Contoh: hanya nama dan harga. Pengaturan ini berlaku untuk semua akun.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_220px]">
        <div>
          <div className="grid gap-2 sm:grid-cols-2">
            {LABEL_FIELDS.map((f) => {
              const off = f.key === "kodeBarcode" && !opt.barcode;
              return (
                <label key={f.key} className={`flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold ${off ? "opacity-50" : "cursor-pointer"}`}>
                  <input type="checkbox" className="mt-0.5 size-4" checked={opt[f.key] && !off} disabled={off} onChange={() => toggle(f.key)} />
                  <span>
                    {f.label}
                    {f.hint ? <span className="block text-[11px] font-normal text-muted">{f.hint}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-sm">
            <button type="button" className="btn-inline text-accent" onClick={() => set({ ...LABEL_DEFAULTS })}>Tampilkan semua</button>
            <button type="button" className="btn-inline text-slate-600" onClick={() => set({ nama: true, merek: false, partNumber: false, kodePajak: false, barcode: false, kodeBarcode: false, harga: true })}>Hanya nama + harga</button>
          </div>
          <div className="mt-3">
            <PrimaryButton type="button" disabled={busy || !berubah || kosong} onClick={simpan}>{busy ? "Menyimpan..." : "Simpan Isi Label"}</PrimaryButton>
          </div>
          {kosong ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">Belum ada yang dicentang, label tidak akan bisa dicetak.</p> : null}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Contoh label</p>
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-center">
            {kosong ? <p className="py-6 text-xs text-slate-400">Kosong</p> : null}
            {lines.map((t, i) => (
              <p key={i} className={i === 0 && opt.nama ? "text-sm font-extrabold leading-snug" : "text-xs leading-snug"}>{t}</p>
            ))}
            {opt.barcode ? (
              <div className="mx-auto mt-1.5 h-9 w-36" style={{ backgroundImage: "repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px,#111 4px 5px,#fff 5px 8px)" }} aria-hidden="true" />
            ) : null}
            {opt.barcode && opt.kodeBarcode ? <p className="font-mono text-[11px]">SP-1944-PCS</p> : null}
            {opt.harga ? <p className="mt-1 text-base font-semibold">Rp 120.000</p> : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}
