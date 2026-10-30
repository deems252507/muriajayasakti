import type { LhNota } from "@/lib/shop/api";

export type LhTab = "BON" | "CASH" | "IMRON" | "MJB";

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v: number) => Number(v || 0).toLocaleString("id-ID");
const rp = (v: number) => `<span class="rp"><span>Rp</span><span>${num(v)}</span></span>`;
const ddmmyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(2, 4)}`;
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const notaTotal = (n: LhNota) => n.lines.reduce((s, l) => s + l.pcs * l.harga, 0);
/** Harga setelah persen, dibulatkan ke ribuan terdekat (sama seperti Harga Satuan 2 di Excel). */
export const hargaNet = (harga: number, persen: number) => (harga <= 0 ? 0 : Math.round((harga * (1 - persen / 100)) / 1000) * 1000);
export const sumNet = (ns: LhNota[]) => ns.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.pcs * hargaNet(l.harga, l.persen), 0), 0);
export const sumTotal = (ns: LhNota[]) => ns.reduce((s, n) => s + notaTotal(n), 0);

const CSS = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: "Times New Roman", serif; font-size: 12px; color: #000; margin: 0; }
.day { page-break-after: always; }
.day:last-child { page-break-after: auto; }
.ttl { font-style: italic; font-size: 13px; font-weight: 700; }
.sub { font-style: italic; font-weight: 700; margin-bottom: 6px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #000; padding: 3px 6px; font-weight: 700; vertical-align: middle; }
th { text-align: center; font-size: 13px; }
td.c { text-align: center; } td.r { text-align: right; }
tr.first td { border-top: 2.5px solid #000; }
.rp { display: flex; justify-content: space-between; gap: 6px; }
tr.sep td { background: #ffe5e5; color: #b00000; text-align: center; border-top: 2.5px solid #000; }
.ket { margin-top: 10px; width: 62%; border: 2px solid #000; }
.ket .t { font-size: 18px; font-weight: 700; padding: 4px 8px; border-bottom: 1px solid #000; }
.ket .row { display: flex; justify-content: space-between; padding: 3px 8px; font-size: 14px; font-weight: 700; border-top: 1px solid #000; }
.red { color: #c00; }
.foot { margin-top: 8px; font-size: 9px; color: #666; font-weight: 400; }
`;

function openDoc(title: string, inner: string) {
  const win = window.open("", "_blank", "width=1000,height=800");
  if (!win) throw new Error("Popup diblokir browser. Izinkan popup untuk mencetak.");
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function groupByDay(ns: LhNota[]) {
  const m = new Map<string, LhNota[]>();
  for (const n of ns.filter((x) => x.lines.length > 0)) m.set(n.tanggal, [...(m.get(n.tanggal) ?? []), n]);
  return m;
}

/** Baris-baris kotak nota (NO digabung, garis tebal di atas tiap nota). Mengembalikan HTML dan nomor berikutnya. */
function notaRows(ns: LhNota[], startNo: number, withCustomer: boolean, marker = "") {
  let no = startNo;
  let html = "";
  let first = true;
  for (const n of ns) {
    const lines = n.lines.length ? n.lines : [{ id: 0, partNumber: "", nama: "", pcs: 0, harga: 0, persen: 0 }];
    lines.forEach((l, i) => {
      const empty = !l.nama;
      const pn = first && i === 0 && marker ? `${marker}${l.partNumber ? " " + l.partNumber : ""}` : l.partNumber;
      html += `<tr class="${i === 0 ? "first" : ""}">${i === 0 ? `<td class="c" rowspan="${lines.length}">${no}</td>` : ""}
        <td>${esc(pn)}</td><td>${esc(l.nama)}</td>${withCustomer ? `<td class="c">${esc(n.customer)}</td>` : ""}
        <td class="c">${empty ? "" : num(l.pcs)}</td><td>${empty ? "" : rp(l.harga)}</td><td>${empty ? "" : rp(l.pcs * l.harga)}</td></tr>`;
    });
    first = false;
    no += 1;
  }
  return { html, next: no };
}

const headRow = (withCustomer: boolean) =>
  `<tr><th style="width:34px">NO</th><th style="width:21%">PART NUMBER</th><th>NAMA BARANG</th>${withCustomer ? '<th style="width:12%">CUSTOMER</th>' : ""}<th style="width:42px">PCS</th><th style="width:15%">HARGA</th><th style="width:15%">TOTAL</th></tr>`;

function ketBox(rows: Array<[string, number]>, totalLabel: string, total: number, netto?: number) {
  return `<div class="ket"><div class="t">Keterangan :</div>${rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span>${rp(v)}</div>`).join("")}<div class="row"><span>${esc(totalLabel)}</span>${rp(total)}</div>${netto != null ? `<div class="row"><span>Total Penjualan Netto (%)</span>${rp(netto)}</div>` : ""}</div>`;
}

function dayRecap(days: Array<[string, number, number?]>) {
  if (days.length < 2) return "";
  const grand = days.reduce((s, [, v]) => s + v, 0);
  const withNet = days.some((d) => d[2] != null);
  const grandNet = days.reduce((s, d) => s + (d[2] ?? 0), 0);
  return `<div class="day"><div class="ttl">Rekap Per Tanggal</div><table style="margin-top:8px"><tr><th>TANGGAL</th><th>TOTAL PENJUALAN BRUTO</th>${withNet ? "<th>TOTAL PENJUALAN NETTO (%)</th>" : ""}</tr>
    ${days.map(([d, v, nt]) => `<tr><td class="c">${ddmmyyyy(d)}</td><td>${rp(v)}</td>${withNet ? `<td>${rp(nt ?? 0)}</td>` : ""}</tr>`).join("")}
    <tr><td class="c">TOTAL</td><td>${rp(grand)}</td>${withNet ? `<td>${rp(grandNet)}</td>` : ""}</tr></table></div>`;
}

/**
 * Cetak laporan satu tab untuk rentang tanggal (satu hari, bulan, tahun, atau bebas).
 * CASH otomatis memuat bon Imron di bagian paling bawah tiap tanggal.
 */
export function printHarian(tab: LhTab, notas: LhNota[], imron: LhNota[], start: string, end: string) {
  const byDay = groupByDay(notas);
  const imronByDay = groupByDay(imron);
  const dates = [...new Set([...byDay.keys(), ...(tab === "CASH" ? imronByDay.keys() : [])])].sort();
  if (!dates.length) throw new Error("Tidak ada data pada periode ini.");
  const label = tab === "IMRON" ? "IMRON MOTOR" : tab;
  const recap: Array<[string, number, number?]> = [];
  let body = "";

  for (const d of dates) {
    const day = byDay.get(d) ?? [];
    if (tab === "MJB") {
      const lines = day.flatMap((n) => n.lines);
      recap.push([d, 0]);
      body += `<div class="day"><div class="ttl">Pembelian MJB Per ${ddmmyy(d)}</div><div class="sub">MJB</div>
        <table><tr><th style="width:20%">TANGGAL</th><th>NAMA BARANG</th><th style="width:12%">JUMLAH</th></tr>
        ${(lines.length ? lines : [{ id: 0, partNumber: "", nama: "TIDAK ADA PEMBELIAN", pcs: 0, harga: 0, persen: 0 }]).map((l, i) => `<tr><td>${i === 0 ? `(${ddmmyyyy(d)})` : ""}</td><td>${esc(l.nama)}</td><td class="c">${num(l.pcs)}</td></tr>`).join("")}</table></div>`;
      continue;
    }
    if (tab === "BON") {
      const r = notaRows(day, 1, true);
      const total = sumTotal(day);
      const perName = new Map<string, number>();
      for (const n of day) perName.set(n.customer || "(tanpa nama)", (perName.get(n.customer || "(tanpa nama)") ?? 0) + notaTotal(n));
      recap.push([d, total]);
      body += `<div class="day"><div class="ttl">Barang Keluar Customer Per ${ddmmyy(d)}</div><div class="sub">BON</div>
        <table>${headRow(true)}${r.html}</table>${ketBox([...perName.entries()], "Total Bon", total)}</div>`;
      continue;
    }
    // CASH / IMRON
    const r = notaRows(day, 1, false, tab === "IMRON" ? `(${ddmmyyyy(d)})` : "");
    let rows = r.html;
    let total = sumTotal(day);
    let net = sumNet(day);
    let nextNo = r.next;
    if (tab === "CASH") {
      const im = imronByDay.get(d) ?? [];
      if (im.length) {
        const r2 = notaRows(im, nextNo, false, `(${ddmmyyyy(d)})`);
        rows += r2.html;
        total += sumTotal(im);
        net += sumNet(im);
        nextNo = r2.next;
      }
    }
    recap.push([d, total, net]);
    body += `<div class="day"><div class="ttl">Barang Keluar Customer Per ${ddmmyy(d)}</div><div class="sub">${label}</div>
      <table>${headRow(false)}${rows}</table>${ketBox([], "Total Penjualan Bruto", total, net)}</div>`;
  }
  if (tab !== "MJB") body += dayRecap(recap);
  openDoc(`Laporan ${label} ${start}${end !== start ? ` s/d ${end}` : ""}`, body);
}
