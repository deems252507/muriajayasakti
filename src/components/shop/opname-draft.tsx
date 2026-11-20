import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { KategoriPicker } from "@/components/shop/opname-kategori";
import { HASIL_LABEL, HasilBadge, ItemTitle, MetaLine, Pager, TONE, hasilTone, hitungHasil, newToken, selisihClass, selisihText, umurHari, waktuText } from "@/components/shop/opname-ui";
import { inputClass } from "@/components/shop/shell";
import { confirmDialog } from "@/lib/confirm";
import { opnameDraftConfirm, opnameDraftDelete, opnameDraftList } from "@/lib/shop/api";
import type { OpnameDraftItem } from "@/lib/shop/types";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Tab "Hitungan Sementara": semua barang yang sedang dihitung di beberapa lokasi, dikelompokkan per lokasi. */
export function OpnameDraft({ categories, canSave, onOpen, onChanged }: { categories: string[]; canSave: boolean; onOpen: (id: number) => void; onChanged: () => void }) {
  const [lokasi, setLokasi] = useState("");
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ total: number; perPage: number; lokasi: Array<{ lokasi: string; n: number }>; items: OpnameDraftItem[] } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const tokens = useRef(new Map<string, string>());
  const dq = useDebounced(q.trim());

  useEffect(() => {
    let alive = true;
    void opnameDraftList({ data: { lokasi, q: dq, kategori, page } })
      .then((res) => {
        if (!alive) return;
        setError("");
        setData(res);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || "Gagal memuat hitungan sementara.");
      });
    return () => {
      alive = false;
    };
  }, [lokasi, dq, kategori, page, reload]);

  useEffect(() => {
    setSelected([]);
  }, [lokasi, dq, kategori, page]);

  const items = data?.items ?? [];
  // Hanya barang yang tidak ada peringatan perubahan stok yang bisa dikonfirmasi massal; sisanya dikonfirmasi satu per satu.
  const ready = items;
  const totalLokasi = data ? data.lokasi.reduce((sum, l) => sum + l.n, 0) : 0;

  async function confirmSelected() {
    if (busy || selected.length === 0) return;
    const chosen = items.filter((i) => selected.includes(i.id));
    const ok = await confirmDialog(`Konfirmasi total ${chosen.length} barang? Stok sistem masing-masing barang akan disesuaikan dengan total hitungan semua lokasinya.`, {
      title: "Konfirmasi yang dipilih?",
      confirmText: "Ya, konfirmasi",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await opnameDraftConfirm({
        data: {
          items: chosen.map((i) => {
            const key = `${i.id}|${i.stok}|${i.rincian.map((d) => `${d.id}:${d.jumlah}`).join(",")}`;
            if (!tokens.current.has(key)) tokens.current.set(key, newToken());
            return { productId: i.id, expectedStok: i.stok, token: tokens.current.get(key) as string };
          }),
          force: false,
        },
      });
      let berhasil = 0;
      const masalah: string[] = [];
      for (const it of res.items) {
        if (it.error) masalah.push(`${it.nama} (${it.error})`);
        else if (it.r?.ok) berhasil += 1;
        else if (it.r && "peringatan" in it.r) masalah.push(`${it.nama} (ada ${it.r.jumlahMutasi} perubahan stok sejak dihitung, buka barangnya untuk memutuskan)`);
        else masalah.push(`${it.nama} (stok berubah, periksa ulang)`);
      }
      if (berhasil > 0) toast.success(`${berhasil} barang dikonfirmasi`);
      if (masalah.length > 0) toast.warning(`${masalah.length} belum dikonfirmasi: ${masalah.slice(0, 3).join("; ")}${masalah.length > 3 ? "; ..." : ""}`, { duration: 10000 });
      setSelected([]);
      setReload((n) => n + 1);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konfirmasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLokasi() {
    if (!lokasi || busy) return;
    const n = data?.lokasi.find((l) => l.lokasi.toLowerCase() === lokasi.toLowerCase())?.n ?? 0;
    const ok = await confirmDialog(`Hapus semua hitungan sementara lokasi ${lokasi} (${n} barang)? Stok sistem tidak berubah.`, { title: "Hapus hitungan lokasi?", confirmText: "Hapus semua" });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await opnameDraftDelete({ data: { lokasi } });
      toast.success(`${res.dihapus} hitungan dihapus`);
      setLokasi("");
      setReload((x) => x + 1);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: OpnameDraftItem) {
    if (busy) return;
    const ok = await confirmDialog(`Hapus semua hitungan sementara ${item.nama}? Stok sistem tidak berubah.`, { title: "Hapus hitungan barang?", confirmText: "Hapus" });
    if (!ok) return;
    setBusy(true);
    try {
      await opnameDraftDelete({ data: { productId: item.id } });
      setReload((x) => x + 1);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs leading-5 text-slate-600">Barang yang sedang dihitung di beberapa lokasi. Hitungan di sini belum mengubah stok sistem. Stok berubah setelah dikonfirmasi.</p>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Lokasi">
        <button type="button" aria-label="Semua lokasi" aria-pressed={lokasi === ""} onClick={() => { setPage(1); setLokasi(""); }} className={`h-10 rounded-full px-3 text-xs font-bold ${lokasi === "" ? "bg-violet-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`}>
          Semua lokasi ({data ? totalLokasi : "…"})
        </button>
        {(data?.lokasi ?? []).map((l) => (
          <button key={l.lokasi} type="button" aria-label={`Lokasi ${l.lokasi}`} aria-pressed={lokasi.toLowerCase() === l.lokasi.toLowerCase()} onClick={() => { setPage(1); setLokasi(l.lokasi); }} className={`h-10 rounded-full px-3 text-xs font-bold ${lokasi.toLowerCase() === l.lokasi.toLowerCase() ? "bg-violet-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`}>
            {l.lokasi} ({l.n})
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <input className={inputClass} placeholder="Cari nama, part number, alt, merek" aria-label="Cari barang" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <KategoriPicker value={kategori} options={categories} onChange={(next) => { setPage(1); setKategori(next); }} />
        {canSave && lokasi ? (
          <button type="button" aria-label={`Hapus semua hitungan lokasi ${lokasi}`} disabled={busy} onClick={() => void removeLokasi()} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-danger sm:col-span-2 xl:col-span-1">
            <Trash2 className="size-4" /> Hapus semua draft {lokasi}
          </button>
        ) : null}
      </div>

      {canSave && ready.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-900">
          <span className="min-w-0 flex-1 basis-48">Pilih barang yang semua lokasinya sudah selesai dihitung, lalu konfirmasi sekaligus.</span>
          <button type="button" aria-label="Pilih semua di halaman ini" onClick={() => setSelected(items.map((i) => i.id))} className="h-10 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold">Pilih semua di halaman ini</button>
          <button type="button" aria-label="Konfirmasi barang terpilih" disabled={busy || selected.length === 0} onClick={() => void confirmSelected()} className="h-10 rounded-lg bg-violet-600 px-3 text-xs font-extrabold text-white disabled:opacity-50">
            Konfirmasi yang dipilih ({selected.length})
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <p className="mt-3 text-xs font-semibold text-slate-600">{data ? `${data.total.toLocaleString("id-ID")} barang sedang dihitung` : "Memuat..."}</p>

      {data && items.length === 0 ? <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Tidak ada hitungan sementara.</div> : null}

      <div className="mt-2 grid gap-2.5 lg:grid-cols-2">
        {items.map((item) => {
          const hasil = hitungHasil(item.stok, item.total);
          const tone = TONE[hasilTone(hasil)];
          const umur = umurHari(item.tertua);
          return (
            <article key={item.id} className="flex flex-col rounded-xl border border-l-4 border-slate-200 border-l-violet-500 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                {canSave ? (
                  <input type="checkbox" className="mt-1 size-5 shrink-0" aria-label={`Pilih ${item.nama}`} checked={selected.includes(item.id)} onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, item.id] : cur.filter((x) => x !== item.id)))} />
                ) : null}
                <div className="min-w-0 flex-1">
                  <ItemTitle item={item} q={dq} className="text-[15px]" />
                  <div className="mt-1 space-y-0.5">
                    <MetaLine label="Kategori" value={item.kategori} />
                    <MetaLine label="Part Number" value={item.partNumber || item.kode} mono />
                    <MetaLine label="Part Number Alt" value={item.partNumbersAlt} mono />
                  </div>
                </div>
              </div>
              <ul className="mt-2 divide-y divide-violet-100 rounded-lg bg-violet-50/60">
                {item.rincian.map((d) => (
                  <li key={d.id ?? d.lokasi} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate font-bold text-slate-900">{d.lokasi}</span>
                    <span className="shrink-0 font-semibold">{d.qty.toLocaleString("id-ID")} {d.satuan}{d.satuan !== item.satuan ? ` = ${d.jumlah.toLocaleString("id-ID")} ${item.satuan}` : ""}</span>
                  </li>
                ))}
              </ul>
              <div className={`mt-2 rounded-lg border p-2 text-xs ${tone.panel}`}>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-extrabold">Total {item.total.toLocaleString("id-ID")} {item.satuan}</span>
                  <HasilBadge hasil={hasil} />
                </div>
                <p className="mt-0.5">Stok sistem {item.stok.toLocaleString("id-ID")} {item.satuan} · Selisih <b className={selisihClass(item.total - item.stok)}>{selisihText(item.total - item.stok)}</b> · {HASIL_LABEL[hasil]}</p>
              </div>
              {umur || item.mutasiN > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {umur ? <p className="rounded-lg bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900">Draft {umur} hari lalu</p> : null}
                  {item.mutasiN > 0 ? <p className="rounded-lg bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900">Ada {item.mutasiN} perubahan stok sejak dihitung ({selisihText(item.mutasiNet)} {item.satuan}). Buka barangnya untuk memutuskan.</p> : null}
                </div>
              ) : null}
              <p className="mt-1.5 text-[11px] text-slate-500">Hitungan pertama {waktuText(item.tertua)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" aria-label={`Buka ${item.nama}`} onClick={() => onOpen(item.id)} className="h-11 flex-1 rounded-xl bg-accent text-sm font-extrabold text-white">{canSave ? "Buka / Konfirmasi" : "Lihat Detail"}</button>
                {canSave ? (
                  <button type="button" aria-label={`Hapus draft ${item.nama}`} disabled={busy} onClick={() => void removeItem(item)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-red-200 bg-red-50 text-danger"><Trash2 className="size-4" /></button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {data ? <Pager page={page} total={data.total} perPage={data.perPage} onPage={setPage} /> : null}
    </div>
  );
}
