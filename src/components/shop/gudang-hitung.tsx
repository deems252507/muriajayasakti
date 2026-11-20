import { AlertTriangle, Check, Info, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorLine, ItemIdentity, Modal, QtyField, baseOf, defaultUnit, fmt } from "@/components/shop/gudang-dialogs";
import { waktuText } from "@/components/shop/opname-ui";
import { Field, inputClass } from "@/components/shop/shell";
import { confirmDialog } from "@/lib/confirm";
import { gudangDraftConfirm, gudangDraftDelete, gudangDraftSave, gudangOpnameItem } from "@/lib/shop/api";
import type { GudangDraftEntry, GudangItem } from "@/lib/shop/types";

type Loaded = Awaited<ReturnType<typeof gudangOpnameItem>>;
type Unit = "base" | "alt";

/**
 * Hitung stok gudang (Admin dan staf berizin gudang). Hitungan disimpan sementara per lokasi dan TIDAK mengubah stok.
 * Hanya Admin yang menekan Konfirmasi Total; saat itu stok gudang disesuaikan dan tercatat sebagai Opname.
 * Stok toko tidak ikut dihitung di sini.
 */
export function GudangHitungDialog({
  item,
  canCount,
  admin,
  onClose,
  onChanged,
  onDone,
}: {
  item: Pick<GudangItem, "productId" | "nama" | "kode" | "partNumber" | "partNumbersAlt" | "kategori" | "merek" | "kodePajak" | "satuan" | "satuanAlt" | "isiSatuanAlt">;
  /** Boleh menyimpan hitungan (Admin atau staf berizin gudang). */
  canCount: boolean;
  /** Boleh konfirmasi total (Admin). */
  admin: boolean;
  onClose: () => void;
  /** Dipanggil setelah hitungan disimpan/dihapus (dialog tetap terbuka). */
  onChanged: () => void;
  /** Dipanggil setelah total dikonfirmasi (dialog ditutup). */
  onDone: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<Unit>(defaultUnit(item));
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await gudangOpnameItem({ data: { productId: item.productId } }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data gudang.");
    }
  }, [item.productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const units = data?.item ?? item;
  const stok = data?.item.stokGudang ?? 0;
  const drafts = data?.drafts ?? [];
  const total = drafts.reduce((sum, d) => sum + d.jumlah, 0);
  const selisih = total - stok;
  const base = baseOf(qty, unit, item);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!lokasi.trim()) return setError("Isi lokasi hitungan, misalnya Rak A atau Gudang belakang.");
    if (base == null) return setError("Isi jumlah fisik (0 atau lebih).");
    setBusy(true);
    setError("");
    try {
      await gudangDraftSave({ data: { productId: item.productId, lokasi: lokasi.trim(), qty: Number(qty), unit, catatan: catatan.trim() } });
      toast.success(`Hitungan ${lokasi.trim()} disimpan sementara`, { description: "Stok gudang belum berubah." });
      setQty("");
      setCatatan("");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hitungan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  function edit(entry: GudangDraftEntry) {
    setLokasi(entry.lokasi);
    setUnit(entry.satuan === item.satuanAlt && item.satuanAlt ? "alt" : "base");
    setQty(String(entry.qty));
    setCatatan(entry.catatan);
  }

  async function remove(entry: GudangDraftEntry) {
    if (!(await confirmDialog(`Hapus hitungan ${entry.lokasi} (${entry.qty} ${entry.satuan})? Stok gudang tidak berubah.`, { title: "Hapus hitungan sementara?", confirmText: "Hapus" }))) return;
    setBusy(true);
    try {
      await gudangDraftDelete({ data: { draftId: entry.id } });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus hitungan.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotal(force = false): Promise<void> {
    if (!data || !admin || drafts.length === 0) return;
    if (!force) {
      const ok = await confirmDialog(
        selisih === 0
          ? `Total hitungan ${fmt(total, item)} sama dengan stok gudang. Simpan sebagai opname?`
          : `Stok gudang akan disesuaikan dari ${fmt(stok, item)} menjadi ${fmt(total, item)}. Konfirmasi?`,
        { title: "Konfirmasi total gudang?", confirmText: "Ya, konfirmasi" },
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    let retry = false;
    try {
      const res = await gudangDraftConfirm({ data: { productId: item.productId, expected: stok, force, catatan: catatan.trim() } });
      if (res.ok) {
        toast.success(res.selisih === 0 ? "Stok gudang cocok" : "Opname tersimpan, stok gudang disesuaikan", {
          description: `${item.nama}: sistem ${fmt(res.stokSebelum, item)}, fisik ${fmt(res.stokFisik, item)}`,
        });
        onDone();
        return;
      }
      retry = await confirmDialog(
        `Sejak hitungan pertama ada ${res.jumlahMutasi} perubahan stok gudang (tambah/ambil/koreksi). Total hitungan mungkin sudah tidak pas. Tetap konfirmasi total ${fmt(res.total, item)}?`,
        { title: "Stok gudang berubah saat dihitung", confirmText: "Tetap konfirmasi" },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konfirmasi gagal.");
      await load();
    } finally {
      setBusy(false);
    }
    if (retry) await confirmTotal(true);
  }

  return (
    <Modal title="Hitung stok gudang" onClose={onClose}>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <ItemIdentity item={item} />
        <p className="mt-2 text-xs text-slate-600">
          Stok sistem gudang <b className="text-slate-900">{data ? fmt(stok, item) : "..."}</b>
        </p>
        {data ? <p className="text-[11px] text-slate-500">Stok toko {fmt(data.item.stokToko, item)} (info, tidak ikut dihitung di sini)</p> : null}
      </div>

      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>Hitungan disimpan sementara dan belum mengubah stok. {admin ? "Stok gudang berubah saat Anda menekan Konfirmasi Total." : "Stok gudang berubah setelah Admin mengonfirmasi."}</span>
      </p>

      {drafts.length > 0 ? (
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
          <p className="text-sm font-extrabold text-violet-900">Hitungan Sementara</p>
          <ul className="mt-2 divide-y divide-violet-100 rounded-xl bg-white">
            {drafts.map((d) => {
              const mine = admin || d.petugasUsername === data?.me;
              return (
                <li key={d.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {d.lokasi}: {d.qty.toLocaleString("id-ID")} {d.satuan}
                      {d.satuan !== units.satuan ? ` = ${d.jumlah.toLocaleString("id-ID")} ${units.satuan}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-500">{d.petugas || "-"} · {waktuText(d.diubah)}</p>
                  </div>
                  {canCount && mine ? (
                    <>
                      <button type="button" aria-label={`Ubah hitungan ${d.lokasi}`} disabled={busy} onClick={() => edit(d)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700">
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" aria-label={`Hapus hitungan ${d.lokasi}`} disabled={busy} onClick={() => void remove(d)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-red-200 bg-red-50 text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className={`mt-2 rounded-xl border p-3 text-sm ${selisih === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-orange-200 bg-orange-50 text-orange-800"}`}>
            <p className="font-extrabold">Total semua lokasi gudang: {fmt(total, item)}</p>
            <p className="text-xs leading-5">
              Stok sistem gudang {fmt(stok, item)} · {selisih === 0 ? "Sesuai" : `Selisih ${selisih > 0 ? "+" : "-"}${fmt(Math.abs(selisih), item)}`}
            </p>
          </div>
          {data && data.mutasi > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Sejak hitungan pertama ada {data.mutasi} perubahan stok gudang (tambah/ambil/koreksi). Total di atas mungkin sudah tidak pas.
            </p>
          ) : null}
        </div>
      ) : data ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Belum ada hitungan sementara untuk barang ini.</p>
      ) : null}

      {canCount ? (
        <form onSubmit={(event) => void save(event)} className="mt-3 space-y-2">
          <Field label="Lokasi hitungan">
            <input
              className={inputClass}
              list="gudang-hitung-lokasi"
              maxLength={40}
              value={lokasi}
              disabled={busy}
              placeholder="Contoh: Rak A, Gudang belakang"
              onChange={(event) => setLokasi(event.target.value)}
            />
            <datalist id="gudang-hitung-lokasi">{(data?.lokasiList ?? []).map((l) => <option key={l} value={l} />)}</datalist>
          </Field>
          <QtyField label="Jumlah fisik di lokasi ini" qty={qty} unit={unit} units={item} onQty={setQty} onUnit={setUnit} />
          <Field label="Catatan (opsional)">
            <input className={inputClass} maxLength={300} value={catatan} placeholder="Contoh: dus penyok" onChange={(event) => setCatatan(event.target.value)} />
          </Field>
          <button type="submit" disabled={busy || !data} className="h-12 w-full rounded-xl border border-violet-300 bg-violet-50 text-sm font-extrabold text-violet-900 disabled:opacity-50">
            {busy ? "Menyimpan..." : "Simpan Hitungan Sementara"}
          </button>
        </form>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Akun ini hanya dapat melihat. Minta Admin memberi izin Stok Gudang untuk ikut menghitung.</p>
      )}

      <ErrorLine text={error} />

      <div className="mt-4 flex flex-col gap-2">
        {admin ? (
          <button type="button" disabled={busy || drafts.length === 0} onClick={() => void confirmTotal()} className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-extrabold text-white shadow-sm disabled:opacity-50">
            <Check className="size-5" /> Konfirmasi Total{drafts.length ? ` (${fmt(total, item)})` : ""}
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">
          Tutup
        </button>
      </div>
    </Modal>
  );
}
