import { ChevronRight, History } from "lucide-react";
import { MarkWords } from "@/components/shop/shell";
import {
  DraftTag,
  HasilBadge,
  ItemTitle,
  MetaLine,
  StatusBadge,
  TONE,
  itemTone,
  selisihClass,
  selisihText,
  waktuText,
} from "@/components/shop/opname-ui";
import type { OpnameItem } from "@/lib/shop/types";

const th = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2.5 align-middle";

function actionLabel(item: OpnameItem, canSave: boolean) {
  if (!canSave) return "Lihat Detail";
  if (item.statusCek === "BELUM_DICEK") return "Cek Barang";
  if (item.statusCek === "PERLU_CEK_ULANG") return "Cek Ulang";
  return "Lihat Detail";
}

/**
 * Daftar barang Stok Opname. Data dari Master Data; nama, part number, part number alt, dan kode pajak
 * tampil sama seperti di Daftar Sparepart.
 * HP / tablet (di bawah xl): kartu per barang. Layar lebar: tabel.
 */
export function OpnameRows({
  items,
  q,
  canSave,
  onOpen,
  onHistory,
  readOnly = false,
  empty = "Tidak ada barang pada filter yang dipilih.",
}: {
  items: OpnameItem[];
  q: string;
  canSave: boolean;
  onOpen?: (id: number) => void;
  /** Buka riwayat pemeriksaan barang itu. */
  onHistory?: (id: number) => void;
  /** Mode laporan: tanpa tombol aksi. */
  readOnly?: boolean;
  empty?: string;
}) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{empty}</div>;
  }
  return (
    <>
      {/* HP & tablet: kartu */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:hidden">
        {items.map((item) => {
          const tone = itemTone(item);
          const stale = item.statusCek === "PERLU_CEK_ULANG";
          const checked = item.stokFisik != null;
          return (
            <article key={item.id} className={`flex flex-col rounded-xl border border-l-4 border-slate-200 bg-white p-3 shadow-sm ${TONE[tone].edge}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <ItemTitle item={item} q={q} className="text-[15px]" />
                </div>
                <StatusBadge status={item.statusCek} />
              </div>
              <div className="mt-1.5 space-y-0.5">
                <MetaLine label="Kategori" value={item.kategori} q={q} />
                <MetaLine label="Part Number" value={item.partNumber || item.kode} q={q} mono />
                <MetaLine label="Part Number Alt" value={item.partNumbersAlt} q={q} mono />
                {item.kodePajak ? <MetaLine label="Kode Pajak" value={item.kodePajak} q={q} /> : null}
              </div>
              <DraftTag item={item} />
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                <Cell label="Stok Sistem" value={`${item.stok} ${item.satuan}`} />
                <Cell label="Stok Fisik" value={checked ? `${item.stokFisik} ${item.satuan}` : "-"} dim={stale} />
                <Cell label="Selisih" value={checked ? selisihText(item.selisih) : "-"} valueClass={checked ? selisihClass(item.selisih) : ""} dim={stale} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <HasilBadge hasil={item.hasil} stale={stale} />
                <span className="truncate text-[11px] text-slate-500">{item.dicekPada ? `${waktuText(item.dicekPada)}` : "Belum pernah dicek"}</span>
              </div>
              {stale ? <p className="mt-1 text-[11px] font-medium text-yellow-800">Jumlah di sistem berubah setelah dicek ({item.stokSesudah} → {item.stok}). Hasil di atas adalah hasil lama.</p> : null}
              {readOnly ? null : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    aria-label={`${actionLabel(item, canSave)} ${item.nama}`}
                    onClick={() => onOpen?.(item.id)}
                    className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl text-sm font-extrabold active:scale-[.99] ${
                      canSave && item.statusCek !== "SUDAH_DICEK" ? "bg-accent text-white" : "border border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    {actionLabel(item, canSave)} <ChevronRight className="size-4" />
                  </button>
                  {onHistory ? (
                    <button type="button" aria-label={`Riwayat ${item.nama}`} onClick={() => onHistory(item.id)} className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800">
                      <History className="size-4" /> Riwayat
                    </button>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Layar lebar: tabel */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white xl:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100">
            <tr>
              <th className={th}>Nama Barang</th>
              <th className={th}>Kategori</th>
              <th className={th}>Part Number</th>
              <th className={`${th} text-center`}>Stok Sistem</th>
              <th className={`${th} text-center`}>Stok Fisik</th>
              <th className={`${th} text-center`}>Selisih</th>
              <th className={`${th} text-center`}>Status Pemeriksaan</th>
              <th className={`${th} text-center`}>Hasil</th>
              <th className={th}>Terakhir Dicek</th>
              {readOnly ? null : <th className={`${th} text-center`}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const tone = itemTone(item);
              const stale = item.statusCek === "PERLU_CEK_ULANG";
              const checked = item.stokFisik != null;
              return (
                <tr
                  key={item.id}
                  className={`border-b border-slate-100 border-l-4 bg-white transition-colors hover:bg-blue-50/60 ${TONE[tone].edge} ${readOnly ? "" : "cursor-pointer"}`}
                  onClick={readOnly ? undefined : () => onOpen?.(item.id)}
                  title={readOnly ? undefined : "Klik baris untuk membuka"}
                >
                  <td className={`${td} min-w-[220px] max-w-[320px]`}>
                    <ItemTitle item={item} q={q} />
                    <DraftTag item={item} />
                  </td>
                  <td className={`${td} text-xs font-semibold text-slate-700`}><MarkWords text={item.kategori || "-"} q={q} /></td>
                  <td className={`${td} min-w-[150px]`}>
                    <div className="whitespace-nowrap font-mono text-xs"><MarkWords text={item.partNumber || item.kode || "-"} q={q} /></div>
                    {item.partNumbersAlt ? <div className="mt-0.5 break-words font-mono text-[11px] text-slate-500">Alt: <MarkWords text={item.partNumbersAlt} q={q} /></div> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap text-center font-bold`}>{item.stok} {item.satuan}</td>
                  <td className={`${td} whitespace-nowrap text-center font-semibold ${stale ? "opacity-50" : ""}`}>{checked ? `${item.stokFisik} ${item.satuan}` : "-"}</td>
                  <td className={`${td} whitespace-nowrap text-center font-bold ${stale ? "opacity-50" : ""} ${checked ? selisihClass(item.selisih) : ""}`}>{checked ? selisihText(item.selisih) : "-"}</td>
                  <td className={`${td} text-center`}><StatusBadge status={item.statusCek} /></td>
                  <td className={`${td} text-center`}><HasilBadge hasil={item.hasil} stale={stale} /></td>
                  <td className={`${td} whitespace-nowrap text-xs text-slate-600`}>
                    {item.dicekPada ? (
                      <>
                        <div className="font-semibold text-slate-800">{waktuText(item.dicekPada)}</div>
                        {item.petugas ? <div>{item.petugas}</div> : null}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  {readOnly ? null : (
                    <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`${actionLabel(item, canSave)} ${item.nama}`}
                          onClick={() => onOpen?.(item.id)}
                          className={`inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-extrabold ${
                            canSave && item.statusCek !== "SUDAH_DICEK" ? "bg-accent text-white" : "border border-slate-300 bg-white text-slate-800"
                          }`}
                        >
                          {actionLabel(item, canSave)}
                        </button>
                        {onHistory ? (
                          <button type="button" aria-label={`Riwayat ${item.nama}`} title="Riwayat pemeriksaan barang ini" onClick={() => onHistory(item.id)} className="grid size-10 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700">
                            <History className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Cell({ label, value, valueClass = "text-slate-900", dim }: { label: string; value: string; valueClass?: string; dim?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg bg-slate-50 px-1 py-1.5 ${dim ? "opacity-60" : ""}`}>
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`num truncate text-sm font-extrabold ${valueClass}`}>{value}</p>
    </div>
  );
}
