import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Mark, Panel, PrimaryButton } from "@/components/shop/shell";
import { deleteProduct, exportProducts, importProducts, listProducts, saveProduct } from "@/lib/shop/api";
import { digits, grouped, packFromName, rupiah } from "@/lib/shop/format";
import { shopBrand } from "@/lib/shop/print";
import type { Product } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/barang")({ component: BarangPage });

const empty = {
  id: null as number | null,
  partNumber: "",
  partNumbersAlt: "",
  nama: "",
  kategori: "SPAREPART",
  merek: "",
  satuan: "Pcs",
  stokMin: 0,
  stok: 0,
  hargaBeli: 0,
  hargaJual: 0,
  satuanAlt: "",
  isiSatuanAlt: 0,
  hargaJualAlt: 0,
  pajakStatus: "Non Pajak",
  kodePajak: "",
  keterangan: "",
};

function BarangPage() {
  const me = Route.useRouteContext().me;
  const canEdit = me.role !== "Kasir";
  const [q, setQ] = useState("");
  useEffect(() => {
    const saved = sessionStorage.getItem("mjs-find");
    if (!saved) return;
    sessionStorage.removeItem("mjs-find");
    setQ(saved);
  }, []);
  const [kategori, setKategori] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("nama");
  const [data, setData] = useState<{ total: number; items: Product[]; perPage: number; categories: string[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(empty);
  const [useDus, setUseDus] = useState(false);
  const [open, setOpen] = useState(false);
  const [replaceStock, setReplaceStock] = useState(true);

  function load(next = page) {
    void listProducts({ data: { q, page: next, sort, kategori } })
      .then((res) => { setLoadError(""); setData(res); })
      .catch((error: Error) => setLoadError(error.message || "Gagal memuat daftar barang."));
  }
  useEffect(() => {
    load(page);
    const timer = setInterval(() => load(page), 4000);
    const onFocus = () => load(page);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [q, page, sort, kategori]);

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.perPage ?? 15)));

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {canEdit ? <PrimaryButton onClick={() => { setForm(empty); setUseDus(false); setOpen(true); }}>+ Tambah</PrimaryButton> : null}
            {canEdit ? (
              <label className="inline-flex h-11 cursor-pointer items-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700">
                Import CSV
                <input
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void file.text().then(async (text) => {
                      const rows = parseCsv(text);
                      if (!rows.length) throw new Error("CSV tidak dikenali. Pastikan ada kolom KODE SPAREPART dan NAMA SPAREPART.");
                      const result = await importProducts({ data: { rows, replaceStock } });
                      toast.success(`${result.created} baru, ${result.updated} diperbarui`);
                      load(1);
                    }).catch((error: Error) => toast.error(error.message));
                  }}
                />
              </label>
            ) : null}
            <button
              className="inline-flex h-11 items-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-700"
              onClick={() => {
                void exportProducts().then((csv) => {
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${shopBrand().nama.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-stok.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }).catch((error: Error) => toast.error(error.message));
              }}
            >
              Export CSV
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:justify-end">
            <input className={inputClass} placeholder="Cari nama, part, atau kategori (oli)" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
            <input className={inputClass} list="kategori-barang" placeholder="Ketik kategori, contoh Oli" value={kategori} onChange={(e) => { setPage(1); setKategori(e.target.value); }} />
            <datalist id="kategori-barang">
              {data?.categories.map((item) => <option key={item} value={item} />)}
            </datalist>
            <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="nama">Kategori, Nama (A - Z)</option>
              <option value="nama_desc">Nama (Z - A)</option>
              <option value="stok_desc">Stok Terbesar</option>
              <option value="stok_asc">Stok Terkecil</option>
            </select>
            <button className="h-11 rounded-lg border border-line px-3 text-sm" onClick={() => { setQ(""); setKategori(""); setSort("nama"); setPage(1); }}>Reset</button>
          </div>
        </div>
        {canEdit ? (
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={replaceStock} onChange={(e) => setReplaceStock(e.target.checked)} />
            Saat impor, timpa stok dengan angka STOK di file
          </label>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          File Google Sheet: kolom KODE SPAREPART, NAMA SPAREPART, JENIS BARANG, STOK, HARGA.
          Contoh nama `101486 / ACTUATOR IDLE SPEED AVANZA, XENIA - DAIHATSU (G)` dibaca sebagai kode pajak 101486, nama barang, merek DAIHATSU (G). Part number tetap 89690-BZ010-001. Kode SP- untuk barcode dibuat otomatis.
        </p>
      </Panel>
      <Panel className="overflow-x-auto">
        {loadError ? <p className="mb-3 text-sm text-danger">{loadError}</p> : null}
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th className="px-2 py-3">Nama Barang</th>
              <th className="px-2 py-3">Kategori</th>
              <th className="hidden px-2 py-3 md:table-cell">Part Number</th>
              <th className="px-2 py-3 text-center">Stok Akhir</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">Harga Jual</th>
              <th className="px-2 py-3 text-center">Kode Pajak</th>
              <th className="px-2 py-3 text-center">Status Stok</th>
              <th className="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let previousCategory = "";
              return data?.items.map((item) => {
              const status = item.stok <= 0 ? "HABIS" : item.stokMin > 0 && item.stok <= item.stokMin ? "KRITIS" : "AMAN";
              const category = (item.kategori || "TANPA KATEGORI").trim();
              const showCategory = category.toLowerCase() !== previousCategory.toLowerCase();
              previousCategory = category;
              return (
                <Fragment key={`group-${item.id}`}>
                {showCategory ? <tr><td colSpan={8} className="border-y border-line bg-slate-100 px-2 py-2 text-xs font-extrabold tracking-wide text-slate-700">{category.toUpperCase()}</td></tr> : null}
              <tr key={item.id} className="border-t border-line">
                <td className="py-3 pr-3">
                  <div className="font-medium"><Mark text={item.nama} q={q} />{item.kodePajak ? ` (${item.kodePajak})` : ""}</div>
                  {item.merek ? <div className="text-[11px] text-muted">{item.merek}</div> : null}
                </td>
                <td className="px-2 text-xs font-bold">{item.kategori || "-"}</td>
                <td className="hidden font-mono text-xs md:table-cell">{item.partNumber || item.kode}</td>
                <td className={`num text-center font-semibold ${status === "HABIS" ? "text-danger" : status === "KRITIS" ? "text-warn" : ""}`}>
                  <div>{item.stok} {item.satuan}</div>
                  {item.satuanAlt && item.isiSatuanAlt > 0 ? <div className="text-[11px] font-medium text-blue-700">{Math.floor(item.stok / item.isiSatuanAlt)} {item.satuanAlt}{item.stok % item.isiSatuanAlt ? ` + ${item.stok % item.isiSatuanAlt} ${item.satuan}` : ""}</div> : <div className="text-[11px] text-muted">Pcs saja</div>}
                </td>
                <td className="num hidden text-right sm:table-cell">{rupiah(item.hargaJual)}{item.hargaJualAlt ? ` · dus ${rupiah(item.hargaJualAlt)}` : ""}</td>
                <td className="text-center text-xs">{item.kodePajak || "-"}</td>
                <td className="text-center">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status === "HABIS" ? "bg-red-50 text-danger" : status === "KRITIS" ? "bg-amber-50 text-warn" : "bg-emerald-50 text-ok"}`}>{status}</span>
                </td>
                <td className="whitespace-nowrap text-right">
                  <button className="h-11 px-2 text-sm" onClick={() => void printBarcode(item)}>Barcode</button>
                  {canEdit ? (
                    <>
                      <button className="h-11 px-2 text-sm" onClick={() => { setForm({ ...item, id: item.id }); setUseDus(Boolean(item.satuanAlt && item.isiSatuanAlt > 0)); setOpen(true); }}>Ubah</button>
                      <button className="h-11 px-2 text-sm text-danger" onClick={() => { if (confirm("Hapus barang ini?")) void deleteProduct({ data: { id: item.id } }).then(() => load()).catch((e: Error) => toast.error(e.message)); }}>Hapus</button>
                    </>
                  ) : null}
                </td>
              </tr>
              </Fragment>
              );
            });
            })()}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">Menampilkan {data?.items.length ?? 0} dari {data?.total ?? 0} barang</span>
          <div className="flex items-center gap-2">
            <button className="h-11 rounded-lg border border-line px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
            <span className="grid place-items-center text-sm">Hal {page} / {pages}</span>
            <button className="h-11 rounded-lg border border-line px-3" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
          </div>
        </div>
      </Panel>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4">
          <form
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-panel p-4 sm:max-w-xl sm:rounded-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              if (useDus && (!form.satuanAlt.trim() || form.isiSatuanAlt <= 0)) {
                toast.error("Isi nama dus dan jumlah pcs di dalam 1 dus.");
                return;
              }
              const payload = useDus ? form : { ...form, satuanAlt: "", isiSatuanAlt: 0, hargaJualAlt: 0 };
              void saveProduct({ data: payload })
                .then(() => { setOpen(false); toast.success("Barang tersimpan"); load(); })
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            <h2 className="text-lg font-semibold">{form.id ? "Ubah barang" : "Barang baru"}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Nama"><input className={inputClass} value={form.nama} onChange={(e) => {
                const nama = e.target.value;
                const pack = packFromName(nama);
                if (pack && form.isiSatuanAlt <= 0) {
                  setUseDus(true);
                  setForm({ ...form, nama, satuanAlt: form.satuanAlt || "Dus", isiSatuanAlt: pack.pcs, hargaJualAlt: form.hargaJualAlt || form.hargaJual * pack.pcs });
                  return;
                }
                setForm({ ...form, nama });
              }} /></Field>
              <Field label="Part number"><input className={inputClass} value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} /></Field>
              <Field label="Part number lain"><input className={inputClass} value={form.partNumbersAlt} onChange={(e) => setForm({ ...form, partNumbersAlt: e.target.value })} /></Field>
              <Field label="Kategori"><input className={inputClass} value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} /></Field>
              <Field label="Merek"><input className={inputClass} value={form.merek} onChange={(e) => setForm({ ...form, merek: e.target.value })} /></Field>
              <Field label="Satuan"><input className={inputClass} value={form.satuan} onChange={(e) => setForm({ ...form, satuan: e.target.value })} /></Field>
              <Field label="Stok (Pcs)"><input className={`${inputClass} num`} value={form.stok} onChange={(e) => setForm({ ...form, stok: Number(e.target.value) || 0 })} /></Field>
              <Field label="Stok minimum (Pcs)"><input className={`${inputClass} num`} value={form.stokMin} onChange={(e) => setForm({ ...form, stokMin: Number(e.target.value) || 0 })} /></Field>
              <Field label="Harga beli"><input className={`${inputClass} num`} value={grouped(form.hargaBeli)} onChange={(e) => setForm({ ...form, hargaBeli: digits(e.target.value) })} /></Field>
              <Field label="Harga jual Pcs"><input className={`${inputClass} num`} value={grouped(form.hargaJual)} onChange={(e) => setForm({ ...form, hargaJual: digits(e.target.value) })} /></Field>
            </div>
            <div className="mt-4 rounded-xl border border-line p-3">
              <p className="text-sm font-bold">Satuan jual</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className={`h-11 rounded-lg text-sm font-bold ${!useDus ? "bg-slate-900 text-white" : "bg-slate-100"}`} onClick={() => setUseDus(false)}>Pcs saja</button>
                <button type="button" className={`h-11 rounded-lg text-sm font-bold ${useDus ? "bg-blue-700 text-white" : "bg-slate-100"}`} onClick={() => { setUseDus(true); setForm((prev) => ({ ...prev, satuanAlt: prev.satuanAlt || "Dus" })); }}>Ada Dus</button>
              </div>
              {!useDus ? <p className="mt-2 text-xs text-muted">Barang ini hanya dijual per pcs. Stok yang diisi adalah jumlah pcs.</p> : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Nama satuan"><input className={inputClass} value={form.satuanAlt} onChange={(e) => setForm({ ...form, satuanAlt: e.target.value })} placeholder="Dus" /></Field>
                  <Field label="Isi 1 dus (berapa pcs)"><input className={`${inputClass} num`} value={form.isiSatuanAlt || ""} onChange={(e) => setForm({ ...form, isiSatuanAlt: Number(e.target.value) || 0 })} placeholder="12" /></Field>
                  <Field label="Harga jual 1 dus"><input className={`${inputClass} num`} value={grouped(form.hargaJualAlt)} onChange={(e) => setForm({ ...form, hargaJualAlt: digits(e.target.value) })} /></Field>
                  <p className="self-end text-xs text-blue-800">
                    {form.isiSatuanAlt > 0
                      ? `1 ${form.satuanAlt || "Dus"} = ${form.isiSatuanAlt} ${form.satuan || "Pcs"}${packFromName(form.nama) ? ` @ ${packFromName(form.nama)?.ukuran}` : ""}. Stok ${form.stok} ${form.satuan || "Pcs"} = ${Math.floor(form.stok / form.isiSatuanAlt)} ${form.satuanAlt || "Dus"}${form.stok % form.isiSatuanAlt ? ` + ${form.stok % form.isiSatuanAlt} ${form.satuan || "Pcs"}` : ""}.`
                      : "Isi berapa pcs di dalam 1 dus. Penjualan dus akan mengurangi stok pcs sebanyak angka itu."}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Status pajak">
                <select className={inputClass} value={form.pajakStatus} onChange={(e) => setForm({ ...form, pajakStatus: e.target.value })}>
                  <option>Non Pajak</option>
                  <option>Pajak</option>
                </select>
              </Field>
              <Field label="Kode pajak"><input className={inputClass} disabled={form.pajakStatus !== "Pajak"} value={form.kodePajak} onChange={(e) => setForm({ ...form, kodePajak: e.target.value })} /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setOpen(false)}>Batal</button>
              <PrimaryButton type="submit">Simpan</PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => {
    const cells = splitCsv(line).map((cell) => cell.trim().toUpperCase());
    return cells.some((cell) => cell === "KODE SPAREPART" || cell === "NAMA SPAREPART" || cell === "PART NUMBER");
  });
  if (headerIndex < 0 || headerIndex === lines.length - 1) return [];
  const headers = splitCsv(lines[headerIndex]);
  return lines.slice(headerIndex + 1).map((line) => {
    let cells = splitCsv(line);
    if (cells.length > headers.length) {
      const nameIndex = headers.findIndex((header) => {
        const name = header.trim().toUpperCase();
        return name === "NAMA SPAREPART" || name === "NAMA";
      });
      if (nameIndex >= 0) {
        const extra = cells.length - headers.length;
        const nama = cells.slice(nameIndex, nameIndex + 1 + extra).join(", ");
        cells = [...cells.slice(0, nameIndex), nama, ...cells.slice(nameIndex + 1 + extra)];
      }
    }
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => value.trim()));
}

function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if ((ch === "," || ch === ";") && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function printBarcode(item: Product) {
  const { default: JsBarcode } = await import("jsbarcode");
  const make = (code: string) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, code, { format: "CODE128", width: 1.2, height: 40, displayValue: true, fontSize: 12, margin: 4 });
    return svg.outerHTML;
  };
  const dus = item.satuanAlt
    ? `<hr><div><b>${item.nama}</b><div>${item.merek || "-"} · ${item.partNumber || "-"}</div>${item.kodePajak ? `<div>${item.kodePajak}</div>` : ""}${make(`${item.kode}-DUS`)}<div style="font-size:16px">${rupiah(item.hargaJualAlt)}</div></div>`
    : "";
  const html = `<!doctype html><html><body style="font-family:sans-serif;width:280px;margin:16px auto;text-align:center">
    <div><b>${item.nama}</b><div style="font-size:12px">${item.merek || "-"} · PN ${item.partNumber || "-"}</div>${item.kodePajak ? `<div>${item.kodePajak}</div>` : ""}${make(`${item.kode}-PCS`)}<div style="font-size:16px">${rupiah(item.hargaJual)}</div></div>
    ${dus}
  </body></html>`;
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) {
    toast.error("Popup diblokir. Izinkan popup untuk mencetak barcode.");
    return;
  }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}
