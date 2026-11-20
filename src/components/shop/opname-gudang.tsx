import { ChevronRight, History, Info, RotateCcw, Search, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GudangHitungDialog } from "@/components/shop/gudang-hitung";
import { Pager, QtyDus, StatusBadge, TONE, selisihClass, waktuText, type OpnameTone } from "@/components/shop/opname-ui";
import { MarkWords, Panel, inputClass } from "@/components/shop/shell";
import { usePersistedState } from "@/lib/persist";
import { gudangOpnameList } from "@/lib/shop/api";
import type { GudangOpnameItem } from "@/lib/shop/types";

type GFilter = "semua" | "sudah" | "belum" | "ulang" | "draft";
type Data = Awaited<ReturnType<typeof gudangOpnameList>>;

const FILTERS: Array<{ key: GFilter; label: string }> = [
  { key: "semua", label: "Semua Barang" },
  { key: "belum", label: "Belum Dicek" },
  { key: "sudah", label: "Sudah Dicek" },
  { key: "ulang", label: "Perlu Cek Ulang" },
  { key: "draft", label: "Sedang Dihitung" },
];

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Warna: abu = belum dicek, kuning = perlu cek ulang, hijau = cocok, oranye = ada selisih. */
function tone(item: GudangOpnameItem): OpnameTone {
  if (item.statusCek === "BELUM_DICEK") return "gray";
  if (item.statusCek === "PERLU_CEK_ULANG") return "yellow";
  return item.opnameSelisih === 0 ? "green" : "orange";
}

const th = "whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600";
const td = "px-3 py-2.5 align-middle";

/**
 * Stok Opname pilihan Gudang. Gudang dan toko dihitung terpisah: stok gudang hanya dibandingkan dengan hitungan gudang.
 * Hitungan disimpan sementara; stok gudang berubah saat Admin Konfirmasi Total.
 */
export function OpnameGudang({ canSave }: { canSave: boolean }) {
  const [q, setQ] = usePersistedState("opname:g:q", "");
  const [kategori, setKategori] = usePersistedState("opname:g:kategori", "");
  const [filter, setFilter] = usePersistedState<GFilter>("opname:g:filter", "semua");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<GudangOpnameItem | null>(null);
  const dq = useDebounced(q.trim());

  useEffect(() => {
    let alive = true;
    void gudangOpnameList({ data: { q: dq, kategori, filter, page } })
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError("");
      })
      .catch((err: Error) => alive && setError(err.message || "Gagal memuat stok gudang."));
    return () => {
      alive = false;
    };
  }, [dq, kategori, filter, page, tick]);

  const reload = () => setTick((n) => n + 1);
  const pick = (key: GFilter) => {
    setPage(1);
    setFilter(key);
  };
  const dirty = Boolean(q || kategori || filter !== "semua");
  const s = data?.summary;
  const cards: Array<{ key: GFilter; label: string; value: number | null; tone: OpnameTone; span?: boolean }> = [
    { key: "semua", label: "Total Barang Gudang", value: s?.total ?? null, tone: "blue", span: true },
    { key: "sudah", label: "Sudah Dicek", value: s?.sudah ?? null, tone: "green" },
    { key: "belum", label: "Belum Dicek", value: s?.belum ?? null, tone: "gray" },
    { key: "ulang", label: "Perlu Cek Ulang", value: s?.ulang ?? null, tone: "yellow" },
    { key: "draft", label: "Sedang Dihitung", value: s?.draft ?? null, tone: "purple" },
  ];
  const actionLabel = (item: GudangOpnameItem) => (!canSave ? "Lihat Detail" : item.draftN > 0 ? "Lanjut Hitung" : item.statusCek === "PERLU_CEK_ULANG" ? "Cek Ulang" : item.statusCek === "BELUM_DICEK" ? "Hitung Gudang" : "Hitung Lagi");

  return (
    <>
      <Panel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => {
            const t = TONE[card.tone];
            const active = filter === card.key;
            return (
              <button
                key={card.key}
                type="button"
                aria-pressed={active}
                aria-label={`${card.label}: tampilkan daftarnya`}
                onClick={() => pick(card.key)}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${card.span ? "col-span-2 sm:col-span-1" : ""} ${t.panel} ${active ? "ring-2 ring-accent ring-offset-1" : "hover:brightness-95"}`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">{card.label}</span>
                <span className="num mt-0.5 text-2xl font-extrabold leading-tight text-slate-900">{card.value == null ? "…" : card.value.toLocaleString("id-ID")}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-sm font-extrabold text-slate-900">Progres Pemeriksaan Gudang</p>
            <p className="num text-lg font-extrabold text-accent">{s ? `${s.progress}%` : "…"}</p>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s?.progress ?? 0}>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${s?.progress ?? 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-600">{s ? `${s.sudah.toLocaleString("id-ID")} dari ${s.total.toLocaleString("id-ID")} barang gudang sudah dicek` : "Memuat..."}</p>
        </div>
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>Gudang dan toko dihitung terpisah. Hitungan gudang disimpan sementara dulu, stok gudang baru berubah saat Admin menekan Konfirmasi Total. Stok toko hanya ditampilkan sebagai info.</span>
        </p>
      </Panel>

      <Panel>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="relative sm:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputClass} pl-9 pr-10`}
              placeholder="Cari nama, kode, part number, alt, merek"
              aria-label="Cari barang gudang"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
            {q ? (
              <button type="button" aria-label="Hapus pencarian" onClick={() => { setPage(1); setQ(""); }} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <select className={inputClass} aria-label="Kategori" value={kategori} onChange={(e) => { setPage(1); setKategori(e.target.value); }}>
            <option value="">Semua Kategori</option>
            {(data?.kategori ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className={inputClass} aria-label="Status pemeriksaan gudang" value={filter} onChange={(e) => pick(e.target.value as GFilter)}>
            {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => { setQ(""); setKategori(""); setFilter("semua"); setPage(1); }}
            className="col-span-full inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-40 sm:col-span-2 xl:col-span-1"
          >
            <RotateCcw className="size-4" /> Reset Filter
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <p className="mt-3 text-xs font-semibold text-slate-600">{data ? `${data.total.toLocaleString("id-ID")} barang` : "Memuat..."}</p>

        <div className="mt-2">
          {!data ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              {data.summary.total === 0 ? "Belum ada barang di daftar gudang. Tambahkan dulu lewat menu Stok Gudang." : "Tidak ada barang gudang pada filter yang dipilih."}
            </div>
          ) : (
            <>
              {/* HP & tablet: kartu */}
              <div className="grid gap-2.5 sm:grid-cols-2 xl:hidden">
                {data.items.map((item) => {
                  const stale = item.statusCek === "PERLU_CEK_ULANG";
                  const checked = item.opnameFisik != null;
                  return (
                    <article key={item.productId} className={`flex flex-col rounded-xl border border-l-4 border-slate-200 bg-white p-3 shadow-sm ${TONE[tone(item)].edge}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-[15px] font-semibold leading-snug text-slate-900"><MarkWords text={item.nama} q={dq} /></p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500"><MarkWords text={item.partNumber || item.kode} q={dq} /></p>
                          <p className="text-[11px] text-slate-500">{[item.kategori, item.merek].filter(Boolean).join(" · ")}</p>
                        </div>
                        <StatusBadge status={item.statusCek} />
                      </div>
                      {item.draftN > 0 ? <p className="mt-1.5 inline-flex w-fit rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">Sedang dihitung: {item.draftN} lokasi, total {item.draftTotal.toLocaleString("id-ID")} {item.satuan}</p> : null}
                      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                        <Cell label="Stok Gudang"><QtyDus item={item} value={item.stokGudang} className="text-sm font-extrabold" /></Cell>
                        <Cell label="Stok Fisik" dim={stale}>{checked ? <QtyDus item={item} value={item.opnameFisik ?? 0} className="text-sm font-extrabold" /> : <span className="text-sm font-extrabold">-</span>}</Cell>
                        <Cell label="Selisih" dim={stale}>{checked ? <QtyDus item={item} value={item.opnameSelisih ?? 0} signed showUnit={false} valueClass={`text-sm font-extrabold ${selisihClass(item.opnameSelisih)}`} /> : <span className="text-sm font-extrabold">-</span>}</Cell>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Stok toko (info): {item.stokToko.toLocaleString("id-ID")} {item.satuan} · {item.opnamePada ? `Dicek ${waktuText(item.opnamePada)}${item.opnameOleh ? ` oleh ${item.opnameOleh}` : ""}` : "Belum pernah dicek"}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => setOpen(item)} className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl text-sm font-extrabold ${canSave && item.statusCek !== "SUDAH_DICEK" ? "bg-accent text-white" : "border border-slate-300 bg-white text-slate-800"}`}>
                          {actionLabel(item)} <ChevronRight className="size-4" />
                        </button>
                        <Link to="/gudang" search={{ tab: "riwayat", hid: item.productId }} aria-label={`Riwayat ${item.nama}`} className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800">
                          <History className="size-4" /> Riwayat
                        </Link>
                      </div>
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
                      <th className={`${th} text-center`}>Stok Gudang</th>
                      <th className={`${th} text-center`}>Stok Fisik</th>
                      <th className={`${th} text-center`}>Selisih</th>
                      <th className={`${th} text-center`}>Status</th>
                      <th className={th}>Terakhir Dicek</th>
                      <th className={`${th} text-center`}>Stok Toko (info)</th>
                      <th className={`${th} text-center`}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => {
                      const stale = item.statusCek === "PERLU_CEK_ULANG";
                      const checked = item.opnameFisik != null;
                      return (
                        <tr key={item.productId} className={`cursor-pointer border-b border-slate-100 border-l-4 bg-white transition-colors hover:bg-blue-50/60 ${TONE[tone(item)].edge}`} onClick={() => setOpen(item)} title="Klik baris untuk membuka">
                          <td className={`${td} min-w-[220px] max-w-[320px]`}>
                            <div className="font-semibold leading-snug text-slate-900"><MarkWords text={item.nama} q={dq} /></div>
                            {item.draftN > 0 ? <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">Sedang dihitung: {item.draftN} lokasi</span> : null}
                          </td>
                          <td className={`${td} text-xs font-semibold text-slate-700`}><MarkWords text={item.kategori || "-"} q={dq} /></td>
                          <td className={`${td} font-mono text-xs`}><MarkWords text={item.partNumber || item.kode || "-"} q={dq} /></td>
                          <td className={`${td} whitespace-nowrap text-center`}><QtyDus item={item} value={item.stokGudang} /></td>
                          <td className={`${td} whitespace-nowrap text-center ${stale ? "opacity-50" : ""}`}>{checked ? <QtyDus item={item} value={item.opnameFisik ?? 0} /> : "-"}</td>
                          <td className={`${td} whitespace-nowrap text-center ${stale ? "opacity-50" : ""}`}>{checked ? <QtyDus item={item} value={item.opnameSelisih ?? 0} signed showUnit={false} valueClass={selisihClass(item.opnameSelisih)} /> : "-"}</td>
                          <td className={`${td} text-center`}><StatusBadge status={item.statusCek} /></td>
                          <td className={`${td} whitespace-nowrap text-xs text-slate-600`}>
                            {item.opnamePada ? (
                              <>
                                <div className="font-semibold text-slate-800">{waktuText(item.opnamePada)}</div>
                                {item.opnameOleh ? <div>{item.opnameOleh}</div> : null}
                              </>
                            ) : "-"}
                          </td>
                          <td className={`${td} whitespace-nowrap text-center text-xs text-slate-600`}><QtyDus item={item} value={item.stokToko} className="text-slate-600" /></td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1">
                              <button type="button" onClick={() => setOpen(item)} className={`inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-extrabold ${canSave && item.statusCek !== "SUDAH_DICEK" ? "bg-accent text-white" : "border border-slate-300 bg-white text-slate-800"}`}>
                                {actionLabel(item)}
                              </button>
                              <Link to="/gudang" search={{ tab: "riwayat", hid: item.productId }} aria-label={`Riwayat ${item.nama}`} title="Riwayat gudang barang ini" className="grid size-10 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700">
                                <History className="size-4" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        {data ? <Pager page={page} total={data.total} perPage={data.perPage} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} /> : null}
      </Panel>

      {open ? (
        <GudangHitungDialog
          item={open}
          canCount={canSave}
          admin={canSave}
          onClose={() => setOpen(null)}
          onChanged={reload}
          onDone={() => {
            setOpen(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function Cell({ label, children, dim }: { label: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col items-center rounded-lg bg-slate-50 px-1 py-1.5 ${dim ? "opacity-60" : ""}`}>
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  );
}
