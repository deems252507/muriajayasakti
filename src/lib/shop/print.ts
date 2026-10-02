const shop = {
  nama: "MURIA JAYA SAKTI",
  alamat: "Jl. Raja Alam RT.13 No.22",
  telepon: "0852-4717-7445",
  tagline: "INTEGRATED BUSINESS SYSTEM",
  logo: "",
};

export function setShopProfile(next: Partial<typeof shop>) {
  const before = `${shop.nama}|${shop.alamat}|${shop.telepon}|${shop.tagline}|${shop.logo}`;
  if (next.nama) shop.nama = next.nama;
  if (next.alamat != null) shop.alamat = next.alamat;
  if (next.telepon != null) shop.telepon = next.telepon;
  if (next.tagline != null) shop.tagline = next.tagline;
  if (next.logo != null) shop.logo = next.logo;
  const after = `${shop.nama}|${shop.alamat}|${shop.telepon}|${shop.tagline}|${shop.logo}`;
  if (before === after) return;
  if (typeof document !== "undefined") document.title = shop.nama;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mjs-shop", { detail: { ...shop } }));
}

export function shopBrand() {
  return shop;
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function openPrint(title: string, inner: string, landscape = false) {
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) throw new Error("Popup diblokir browser. Izinkan popup untuk mencetak.");
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: ${landscape ? "A4 landscape" : "A4"}; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .head { text-align: center; border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .head h1 { margin: 0; font-size: 18px; letter-spacing: .04em; }
  .head p { margin: 2px 0; font-size: 11px; }
  h2 { text-align: center; margin: 0 0 10px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #222; padding: 5px 6px; vertical-align: top; }
  th { background: #f0f0f0; text-align: left; }
  .right { text-align: right; white-space: nowrap; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .info { display: flex; justify-content: space-between; gap: 16px; border: 1px solid #000; padding: 8px; margin-bottom: 12px; }
  .sum { border: 1px solid #000; margin-bottom: 12px; }
  .sum div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 8px; border-bottom: 1px dashed #ccc; }
  .sum .total { font-weight: 800; color: #b91c1c; border-top: 2px solid #111; border-bottom: 0; }
  .invoice-head td { background: #e7eef8; font-weight: 700; }
  .invoice-total td { background: #eef2ff; font-weight: 700; }
  .cash { color: #15803d; }
  .bon { color: #b91c1c; }
  .foot { margin-top: 16px; text-align: center; font-size: 9px; color: #555; }
  @media print { thead { display: table-header-group; } tr { break-inside: avoid; } }
</style></head><body>
  <div class="head"><h1>${esc(shop.nama)}</h1><p>${esc([shop.alamat, shop.telepon].filter(Boolean).join(" | "))}</p></div>
  ${inner}
  <div class="foot">Dicetak pada: ${esc(new Date().toLocaleString("id-ID"))}</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

export type TaxLine = Record<string, unknown>;

export function printTaxNotes(rows: TaxLine[], start: string, end: string, onlyNomor?: string) {
  const source = onlyNomor ? rows.filter((row) => String(row.nomor) === onlyNomor) : rows;
  if (!source.length) throw new Error("Tidak ada data pajak untuk dicetak.");
  const groups = new Map<string, TaxLine[]>();
  for (const row of source) {
    const key = String(row.nomor || "-");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const money = (value: unknown) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
  let body = "";
  let no = 1;
  let dpp = 0;
  let ppn = 0;
  let bruto = 0;
  for (const [nomor, items] of groups) {
    const first = items[0];
    const status = String(first.status_bayar) === "Bon" ? "BON" : "CASH";
    body += `<tr class="invoice-head"><td colspan="9">NOTA ${esc(nomor)}<span style="margin-left:12px">${esc(first.tanggal ? new Date(String(first.tanggal)).toLocaleString("id-ID") : "")}</span><span style="margin-left:12px">${esc(first.pelanggan || "Umum")}</span><span class="${status === "CASH" ? "cash" : "bon"}" style="margin-left:12px">${status}</span></td></tr>`;
    let gdpp = 0;
    let gppn = 0;
    let gbruto = 0;
    for (const item of items) {
      const total = Number(item.harga_satuan) * Number(item.jumlah);
      gdpp += Number(item.dpp);
      gppn += Number(item.nilai_pajak);
      gbruto += total;
      body += `<tr><td class="center">${no++}</td><td>${esc(item.nama)}</td><td>${esc(item.part_number || "-")}</td><td class="center">${esc(item.kode_pajak || "-")}</td><td class="center">${esc(item.jumlah)} ${esc(item.satuan || "")}</td><td class="right">${money(item.dpp)}</td><td class="center">${esc(item.persentase)}%</td><td class="right">${money(item.nilai_pajak)}</td><td class="right bold">${money(total)}</td></tr>`;
    }
    dpp += gdpp;
    ppn += gppn;
    bruto += gbruto;
    body += `<tr class="invoice-total"><td colspan="5" class="right">TOTAL NOTA ${esc(nomor)}</td><td class="right">${money(gdpp)}</td><td class="center">—</td><td class="right">${money(gppn)}</td><td class="right">${money(gbruto)}</td></tr>`;
  }
  openPrint(
    onlyNomor ? `Nota Pajak ${onlyNomor}` : "Laporan Pajak Internal",
    `<h2>LAPORAN PAJAK INTERNAL</h2>
    <p class="period" style="text-align:center;margin:0 0 10px;color:#555">Periode: ${esc(start || "-")} s/d ${esc(end || "-")}</p>
    <div class="summary" style="display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #222;margin-bottom:10px">
      <div style="text-align:center;padding:7px 5px;border-right:1px solid #222"><span style="display:block;font-size:8px;color:#555">TOTAL NOTA</span><strong>${groups.size}</strong></div>
      <div style="text-align:center;padding:7px 5px;border-right:1px solid #222"><span style="display:block;font-size:8px;color:#555">TOTAL DPP</span><strong>${money(dpp)}</strong></div>
      <div style="text-align:center;padding:7px 5px;border-right:1px solid #222"><span style="display:block;font-size:8px;color:#555">TOTAL PPN INTERNAL</span><strong>${money(ppn)}</strong></div>
      <div style="text-align:center;padding:7px 5px"><span style="display:block;font-size:8px;color:#555">TOTAL PENJUALAN</span><strong>${money(bruto)}</strong></div>
    </div>
    <table><thead><tr><th>No</th><th>Barang</th><th>Part Number</th><th>Kode Pajak</th><th>Qty</th><th>DPP</th><th>PPN</th><th>Nilai PPN</th><th>Total</th></tr></thead><tbody>${body}</tbody></table>
    <p class="foot">DPP + Nilai PPN = Total Barang &nbsp;•&nbsp; Dicetak pada: ${esc(new Date().toLocaleString("id-ID"))}</p>`,
    true,
  );
}

export function printShiftReport(input: {
  shift: string;
  kasir: string;
  status: string;
  mulai: string;
  selesai: string;
  kasAwal: number;
  penjualanTunai: number;
  uangMasuk: number;
  uangKeluar: number;
  transfer: number;
  bon: number;
  kasAkhir: number;
  closedBy?: string;
  invoices: Array<Record<string, unknown>>;
  moves: Array<Record<string, unknown>>;
  returs: Array<Record<string, unknown>>;
}) {
  const money = (value: number) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
  const jam = (value: unknown) => {
    if (!value) return "-";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };
  const num = (value: unknown) => Number(value || 0).toLocaleString("id-ID");
  const tunaiRows = input.invoices.filter((inv) => inv.metode_bayar === "Tunai" || inv.metode_bayar === "Split");
  const tfRows = input.invoices.filter((inv) => inv.metode_bayar === "Transfer" || inv.metode_bayar === "Split");
  const masukRows = input.moves.filter((move) => move.jenis === "MASUK");
  const keluarRows = input.moves.filter((move) => move.jenis === "KELUAR");
  const totalJual = input.invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const kosong = (cols: number, text: string) => `<tr><td colspan="${cols}" class="center" style="color:#999">${text}</td></tr>`;
  const cashRows = tunaiRows.map((inv, i) => `<tr><td class="center">${i + 1}</td><td>${esc(jam(inv.tanggal))}</td><td>${esc(inv.nomor)}</td><td class="right">${num(inv.total)}</td><td class="right">${num(inv.bayar_tunai)}</td><td class="right">${num(inv.kembalian)}</td></tr>`).join("") || kosong(6, "Tidak ada transaksi tunai");
  const bankRows = tfRows.map((inv, i) => `<tr><td class="center">${i + 1}</td><td>${esc(jam(inv.tanggal))}</td><td>${esc(inv.nomor)}</td><td>${esc(inv.metode_bayar || "Transfer")}</td><td class="right">${esc(inv.bank_transfer || "-")}</td><td class="right">${num(inv.metode_bayar === "Split" ? inv.transfer_amount : inv.total)}</td></tr>`).join("") || kosong(6, "Tidak ada transaksi transfer");
  const inRows = masukRows.map((move, i) => `<tr><td class="center">${i + 1}</td><td>${esc(jam(move.tanggal))}</td><td>${esc(move.keterangan || "-")}</td><td class="right">${num(move.jumlah)}</td></tr>`).join("") || kosong(4, "Tidak ada tambahan modal");
  const outRows = keluarRows.map((move, i) => `<tr><td class="center">${i + 1}</td><td>${esc(jam(move.tanggal))}</td><td>${esc(move.keterangan || "-")}</td><td class="right">${num(move.jumlah)}</td></tr>`).join("") || kosong(4, "Tidak ada pengeluaran");
  const returRows = input.returs.map((retur, i) => {
    const net = Number(retur.net_amount || 0);
    const text = net > 0 ? `(Refund) ${money(net)}` : net < 0 ? `(Tambah) ${money(Math.abs(net))}` : money(0);
    return `<tr><td class="center">${i + 1}</td><td>${esc(jam(retur.tanggal))}</td><td>${esc(retur.id)}</td><td>${esc(retur.pelanggan || "Umum")}</td><td class="right">${esc(text)}</td></tr>`;
  }).join("") || kosong(5, "Tidak ada retur barang");
  openPrint(
    `Laporan Kas ${input.shift}`,
    `<h2>LAPORAN KAS KASIR (SHIFT)</h2>
    <div class="info">
      <div>
        <p><b>Shift:</b> ${esc(input.shift)}</p>
        <p><b>Kasir:</b> ${esc(input.kasir)}</p>
        <p><b>Mulai:</b> ${esc(input.mulai)} • <b>Kasir Mulai:</b> ${esc(input.kasir)}</p>
        <p><b>Selesai:</b> ${esc(input.selesai || "-")} • <b>Kasir Selesai:</b> ${esc(input.closedBy || input.kasir)}</p>
      </div>
      <div style="text-align:right"><p><b>Status:</b> ${esc(input.status)}</p><p><b>Tgl Cetak:</b> ${esc(new Date().toLocaleString("id-ID"))}</p></div>
    </div>
    <div class="sum">
      <div><span>Kas Awal (Modal Awal Shift)</span><b>${money(input.kasAwal)}</b></div>
      <div><span>Penjualan Cash (nilai barang)</span><span>${money(input.penjualanTunai)}</span></div>
      <div><span>Total Uang Masuk Laci</span><span>${money(input.uangMasuk)}</span></div>
      <div><span>Total Uang Keluar Laci</span><span>(${money(input.uangKeluar)})</span></div>
      <div><span>Total Penjualan Transfer Bersih</span><span>${money(input.transfer)}</span></div>
      <div><span>Total Bon / Piutang</span><span>${money(input.bon)}</span></div>
      <div><span>Total Penjualan Keseluruhan</span><span>${money(totalJual)}</span></div>
      <div class="total"><span>SISA KAS FISIK DI LACI</span><span>${money(input.kasAkhir)}</span></div>
    </div>
    <h3>1. Rincian Pemasukan Kas (Tunai)</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Invoice</th><th class="right">Total Belanja</th><th class="right">Uang Diterima</th><th class="right">Kembalian</th></tr></thead><tbody>${cashRows}</tbody></table>
    <h3>2. Rincian Penjualan Transfer / QRIS</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Invoice</th><th>Metode</th><th>Bank / Rekening</th><th class="right">Nominal Transfer</th></tr></thead><tbody>${bankRows}</tbody></table>
    <h3>3. Uang Masuk Tambahan — untuk apa</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Keterangan</th><th class="right">Jumlah</th></tr></thead><tbody>${inRows}</tbody></table>
    <h3>4. Uang Keluar — untuk apa</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Keterangan</th><th class="right">Jumlah</th></tr></thead><tbody>${outRows}</tbody></table>
    <h3>5. Rincian Retur & Tukar Barang</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>No Retur</th><th>Pelanggan</th><th class="right">Selisih</th></tr></thead><tbody>${returRows}</tbody></table>
    <p class="foot">Gunakan tutup shift untuk menyimpan arsip laporan ini.</p>`,
  );
}

function money(value: unknown) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function whenText(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("id-ID");
}

function asList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function openSlip(title: string, body: string, plain = false) {
  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) throw new Error("Popup diblokir browser. Izinkan popup untuk mencetak.");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; color: #111; font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; line-height: 1.35; }
  .shop { text-align: center; }
  .brand { font-size: 15px; font-weight: 800; letter-spacing: .04em; }
  .sub { margin-top: 2px; font-size: 10px; font-weight: 700; letter-spacing: .06em; }
  .addr { margin-top: 4px; font-size: 11px; }
  .meta { margin-top: 2px; font-size: 10px; line-height: 1.35; }
  .rule { border: 0; border-top: 1px dashed #222; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  td:last-child { text-align: right; white-space: nowrap; }
  .item { margin: 0 0 7px; }
  .name { font-weight: 700; }
  .line { display: flex; justify-content: space-between; gap: 8px; }
  .strong { font-weight: 800; font-size: 14px; }
  .bon { margin-top: 4px; border: 1.5px solid #8f2d2d; color: #8f2d2d; text-align: center; font-weight: 800; padding: 6px; }
  .copy { text-align: center; font-size: 10px; font-weight: 800; letter-spacing: .08em; margin-top: 6px; }
  .thanks { text-align: center; margin: 8px 0 0; font-size: 11px; }
</style></head><body>
  <div class="shop"><div class="brand">${esc(shop.nama)}</div>${plain || !shop.tagline ? "" : `<div class="sub">${esc(shop.tagline)}</div>`}<div class="addr">${esc(shop.alamat)}${shop.telepon ? `<br>${esc(shop.telepon)}` : ""}</div></div>
  <hr class="rule">${body}${plain ? "" : `<p class="thanks">Terima kasih</p>`}
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

function slipRow(label: string, value: string, strong = false) {
  return `<tr><td>${esc(label)}</td><td class="${strong ? "strong" : ""}">${esc(value)}</td></tr>`;
}

function itemIdentity(line: { merek?: string; partNumber?: string; partNumbersAlt?: string }) {
  const bits = [
    line.merek ? `Merek: ${esc(line.merek)}` : "",
    line.partNumber ? `PN: ${esc(line.partNumber)}` : "",
    line.partNumbersAlt ? `PN Alt: ${esc(line.partNumbersAlt)}` : "",
  ].filter(Boolean);
  return bits.length ? `<div class="meta">${bits.join("<br>")}</div>` : "";
}

export function printSaleReceipt(result: {
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
  waktu?: string;
  reprint?: boolean;
  lines: Array<{ nama: string; qty: number; satuan: string; harga: number; kodePajak?: string; merek?: string; partNumber?: string; partNumbersAlt?: string; alt?: string }>;
}) {
  const lines = Array.isArray(result.lines) ? result.lines : [];
  const items = lines
    .map((line) => {
      const title = `${line.nama || "-"}${line.kodePajak ? ` (${line.kodePajak})` : ""}`;
      return `<div class="item"><div class="name">${esc(title)}</div>${itemIdentity({ merek: line.merek, partNumber: line.partNumber, partNumbersAlt: line.partNumbersAlt || line.alt })}<div class="line"><span>${esc(line.qty)} ${esc(line.satuan)} x ${esc(money(line.harga))}</span><span>${esc(money(Number(line.harga) * Number(line.qty)))}</span></div></div>`;
    })
    .join("");
  const pay =
    result.status === "Bon"
      ? `<div class="bon">BON / BELUM LUNAS</div>`
      : `<table>${slipRow("Metode", result.metode)}${result.bank ? slipRow("Bank", result.bank) : ""}${result.metode === "Tunai" ? `${slipRow("Terima", money(result.bayarTunai))}${slipRow("Kembali", money(result.kembalian))}` : ""}${result.metode === "Split" ? `${slipRow("Tunai", money(result.bayarTunai))}${slipRow("Transfer", money(result.transfer))}` : ""}${result.metode === "Transfer" ? slipRow("Transfer", money(result.transfer || result.total)) : ""}</table>`;
  openSlip(
    result.nomor,
    `${result.reprint ? `<div class="copy">SALINAN / CETAK ULANG</div>` : ""}
    <table>
      ${slipRow("No", result.nomor)}
      ${slipRow("Waktu", whenText(result.waktu || new Date().toISOString()))}
      ${slipRow("Kasir", result.kasir)}
      ${slipRow("Pelanggan", result.customer || "Umum")}
    </table>
    <hr class="rule">
    ${items || `<div class="item">Tidak ada barang</div>`}
    <hr class="rule">
    <table>
      ${slipRow("Subtotal", money(result.subtotal))}
      ${Number(result.diskon) > 0 ? slipRow("Diskon", `- ${money(result.diskon)}`) : ""}
      ${slipRow("TOTAL", money(result.total), true)}
    </table>
    <hr class="rule">${pay}`,
  );
}

export function printStoredSale(invoice: Record<string, unknown>, lines: Array<Record<string, unknown>>) {
  printSaleReceipt({
    nomor: String(invoice.nomor || ""),
    waktu: String(invoice.tanggal || ""),
    kasir: String(invoice.kasir || "-"),
    customer: String(invoice.tujuan || "Umum"),
    subtotal: Number(invoice.subtotal || 0),
    diskon: Number(invoice.diskon || 0),
    total: Number(invoice.total || 0),
    status: String(invoice.status_bayar || ""),
    metode: String(invoice.metode_bayar || ""),
    bank: String(invoice.bank_transfer || ""),
    bayarTunai: Number(invoice.bayar_tunai || 0),
    kembalian: Number(invoice.kembalian || 0),
    transfer: Number(invoice.transfer_amount || 0),
    reprint: true,
    lines: lines.map((line) => ({
      nama: String(line.custom_item || line.product_nama || line.nama || "Barang"),
      qty: Number(line.jumlah || line.qty || 0),
      satuan: String(line.satuan || ""),
      harga: Number(line.harga_satuan || line.harga || 0),
      kodePajak: String(line.kode_pajak || line.kodePajak || ""),
      merek: String(line.merek || line.product_merek || ""),
      partNumber: String(line.part_number || line.product_part || line.partNumber || ""),
      partNumbersAlt: String(line.part_numbers_alt || line.product_alt || line.alt || ""),
    })),
  });
}

export function printStoredManual(invoice: Record<string, unknown>, lines: Array<Record<string, unknown>>) {
  const items = lines
    .map((line) => {
      const nama = String(line.custom_item || line.product_nama || "Barang");
      const arah = line.jenis === "MASUK" ? "MASUK (+)" : "KELUAR (-)";
      const tujuan = String(line.tujuan || invoice.tujuan || (line.jenis === "MASUK" ? "Supplier/Gudang" : "Pelanggan/Service"));
      return `<div style="margin-bottom:9px"><div style="font-weight:bold">${esc(nama)}</div><div class="meta">${[line.merek ? `Merek: ${esc(line.merek)}` : "", `PN: ${esc(line.part_number || "-")}`, line.part_numbers_alt ? `PN Alt: ${esc(line.part_numbers_alt)}` : ""].filter(Boolean).join("<br>")}</div><div style="display:flex;justify-content:space-between;margin-top:3px"><span>${arah}</span><span>${esc(line.jumlah)} ${esc(line.satuan || "")}</span></div><div style="font-size:10px">${esc(tujuan)}</div></div>`;
    })
    .join("");
  const masuk = lines.filter((line) => line.jenis === "MASUK").reduce((sum, line) => sum + Number(line.jumlah_dasar || line.jumlah || 0), 0);
  const keluar = lines.filter((line) => line.jenis === "KELUAR").reduce((sum, line) => sum + Number(line.jumlah_dasar || line.jumlah || 0), 0);
  openSlip(
    String(invoice.nomor || "Nota mutasi"),
    `<div class="copy">*** NOTA MUTASI BARANG ***</div>
    <table>
      ${slipRow("No Nota", String(invoice.nomor || ""))}
      ${slipRow("Tgl", whenText(invoice.tanggal))}
      ${slipRow("Kasir", String(invoice.kasir || "-"))}
    </table>
    <hr class="rule">${items}<hr class="rule">
    <table>${slipRow("TOTAL MASUK", `+ ${masuk}`, true)}${slipRow("TOTAL KELUAR", `- ${keluar}`, true)}</table>`,
    true,
  );
}

export function printReturSlip(row: Record<string, unknown>) {
  const items = asList(row.items);
  const exchange = asList(row.exchangeItems ?? row.exchange_items);
  const itemRows = items
    .map((item) => `<div class="item"><div class="name">${esc(item.nama || "Barang")}</div>${itemIdentity({ merek: String(item.merek || ""), partNumber: String(item.part_number || item.partNumber || ""), partNumbersAlt: String(item.part_numbers_alt || item.alt || "") })}<div class="line"><span>${esc(item.qty)} ${esc(item.satuan || "")} x ${esc(money(item.harga))}</span><span>${esc(money(item.subtotal ?? Number(item.harga) * Number(item.qty)))}</span></div></div>`)
    .join("");
  const exRows = exchange
    .map((item) => `<div class="item"><div class="name">${esc(item.nama || "Barang")}</div>${itemIdentity({ merek: String(item.merek || ""), partNumber: String(item.part_number || item.partNumber || ""), partNumbersAlt: String(item.part_numbers_alt || item.alt || "") })}<div class="line"><span>${esc(item.qty)} ${esc(item.satuan || "")} x ${esc(money(item.harga))}</span><span>${esc(money(item.subtotal ?? Number(item.harga) * Number(item.qty)))}</span></div></div>`)
    .join("");
  const direction = String(row.direction || row.payment_direction || "");
  const note = direction === "REFUND" ? "Toko mengembalikan uang" : direction === "ADDITIONAL_PAYMENT" ? "Pelanggan menambah bayar" : "Nilai impas";
  openSlip(
    String(row.id || "Retur"),
    `<div class="copy">NOTA RETUR / TUKAR</div>
    <table>
      ${slipRow("No Retur", String(row.id || ""))}
      ${row.nomorTukar ? slipRow("Nota Tukar", String(row.nomorTukar)) : ""}
      ${slipRow("Nota Asal", String(row.parent || row.parent_invoice || ""))}
      ${slipRow("Waktu", whenText(row.tanggal || new Date().toISOString()))}
      ${slipRow("Kasir", String(row.kasir || "-"))}
      ${slipRow("Pelanggan", String(row.customer || row.pelanggan || "Umum"))}
    </table>
    <hr class="rule">
    <div class="name">Barang kembali</div>
    ${itemRows || `<div class="item">Tidak ada</div>`}
    <hr class="rule">
    <div class="name">Barang tukar</div>
    ${exRows || `<div class="item">Tidak ada</div>`}
    <hr class="rule">
    <table>
      ${slipRow("Nilai retur", money(row.retur ?? row.retur_value))}
      ${slipRow("Nilai tukar", money(row.exchange ?? row.exchange_value))}
      ${slipRow("Selisih", money(row.net ?? row.net_amount), true)}
      ${slipRow("Arah", note)}
      ${slipRow("Metode", String(row.metode || row.metode_bayar || "-"))}
      ${row.bank || row.bank_transfer ? slipRow("Bank", String(row.bank || row.bank_transfer)) : ""}
    </table>`,
  );
}

export function printCashDaily(input: {
  start: string;
  end: string;
  tunai: number;
  transfer: number;
  bon: number;
  masuk: number;
  keluar: number;
  refundCash: number;
  refundTf: number;
  tambahCash?: number;
  tambahTf?: number;
  laci: number;
  invoices: Array<Record<string, unknown>>;
  moves: Array<Record<string, unknown>>;
  returs: Array<Record<string, unknown>>;
}) {
  const kosong = (cols: number, text: string) => `<tr><td colspan="${cols}" class="center" style="color:#999">${text}</td></tr>`;
  const jam = (value: unknown) => whenText(value);
  const show = (value: number) => (value ? money(value) : "-");
  type Buku = { waktu: unknown; ref: string; jenis: string; kasir: string; metode: string; masuk: number; keluar: number; net: number; transfer: number; bon: number };
  const buku: Buku[] = [];
  for (const row of input.invoices) {
    const metode = String(row.metode_bayar || "-");
    const bank = String(row.bank_transfer || "");
    const diterima = Number(row.bayar_tunai || 0);
    const kembali = Number(row.kembalian || 0);
    const lunas = row.status_bayar === "Lunas";
    const tunai = lunas && (metode === "Tunai" || metode === "Split");
    const tf = !lunas ? 0 : metode === "Transfer" ? Number(row.total) : metode === "Split" ? Number(row.transfer_amount) : 0;
    buku.push({
      waktu: row.tanggal,
      ref: String(row.nomor || ""),
      jenis: `${row.keterangan === "Bon (Lunas)" ? "BON LUNAS" : row.status_bayar === "Bon" ? "BON" : "PENJUALAN"} · ${row.tujuan || "Umum"}${row.keterangan ? ` · ${row.keterangan}` : ""}`,
      kasir: String(row.kasir || "-"),
      metode: bank ? `${metode} / ${bank}` : metode,
      masuk: tunai ? diterima : 0,
      keluar: tunai ? kembali : 0,
      net: tunai ? diterima - kembali : 0,
      transfer: tf,
      bon: row.status_bayar === "Bon" ? Number(row.total) : 0,
    });
  }
  for (const row of input.moves) {
    const jumlah = Number(row.jumlah || 0);
    const masuk = row.jenis === "MASUK";
    buku.push({
      waktu: row.tanggal,
      ref: masuk ? "TAMBAHAN" : "PENGELUARAN",
      jenis: `${masuk ? "TAMBAHAN KAS" : "PENGELUARAN KAS"}${row.keterangan ? ` — ${row.keterangan}` : ""}`,
      kasir: String(row.kasir || "-"),
      metode: "Cash / Laci",
      masuk: masuk ? jumlah : 0,
      keluar: masuk ? 0 : jumlah,
      net: masuk ? jumlah : -jumlah,
      transfer: 0,
      bon: 0,
    });
  }
  for (const row of input.returs) {
    const tunai = row.metode_bayar !== "Transfer";
    const nilai = tunai ? Number(row.cash_amount) : Number(row.transfer_amount);
    const refund = row.payment_direction === "REFUND";
    const tambah = row.payment_direction === "ADDITIONAL_PAYMENT";
    buku.push({
      waktu: row.tanggal,
      ref: String(row.id || ""),
      jenis: `${refund ? "REFUND RETUR" : tambah ? "TAMBAH BAYAR" : "TUKAR IMPAS"} · ${row.pelanggan || "Umum"}${row.parent_invoice ? ` · nota ${row.parent_invoice}` : ""}`,
      kasir: String(row.kasir || "-"),
      metode: String(row.metode_bayar || "-"),
      masuk: tambah && tunai ? nilai : 0,
      keluar: refund && tunai ? nilai : 0,
      net: tunai ? (refund ? -nilai : tambah ? nilai : 0) : 0,
      transfer: tunai ? 0 : refund ? -nilai : tambah ? nilai : 0,
      bon: 0,
    });
  }
  buku.sort((a, b) => String(a.waktu).localeCompare(String(b.waktu)));
  const uangMasuk = buku.reduce((sum, row) => sum + Math.max(0, row.net), 0);
  const uangKeluar = buku.reduce((sum, row) => sum + Math.max(0, -row.net), 0);
  const bersih = buku.reduce((sum, row) => sum + row.net, 0);
  const transferBersih = input.transfer - input.refundTf + Number(input.tambahTf || 0);
  const bukuHtml = buku.map((row, index) => `<tr><td class="center">${index + 1}</td><td>${esc(jam(row.waktu))}</td><td>${esc(row.ref)}</td><td>${esc(row.jenis)}</td><td>${esc(row.kasir)}</td><td>${esc(row.metode)}</td><td class="right">${show(row.masuk)}</td><td class="right">${show(row.keluar)}</td><td class="right">${row.net ? money(row.net) : "-"}</td><td class="right">${row.transfer ? money(row.transfer) : "-"}</td><td class="right">${show(row.bon)}</td></tr>`).join("") || kosong(11, "Tidak ada transaksi");
  const jual = input.invoices.filter((row) => row.status_bayar === "Lunas" && (row.metode_bayar === "Tunai" || row.metode_bayar === "Split"));
  const jualHtml = jual.map((row, index) => `<tr><td class="center">${index + 1}</td><td>${esc(jam(row.tanggal))}</td><td>${esc(row.nomor)}</td><td>${esc(row.kasir || "-")}</td><td class="right">${money(row.total)}</td><td class="right">${money(row.bayar_tunai)}</td><td class="right">${money(row.kembalian)}</td></tr>`).join("") || kosong(7, "Tidak ada transaksi tunai");
  const masukHtml = input.moves.filter((row) => row.jenis === "MASUK").map((row, index) => `<tr><td class="center">${index + 1}</td><td>${esc(jam(row.tanggal))}</td><td>${esc(row.kasir || "-")}</td><td>${esc(row.keterangan || "-")}</td><td class="right">${money(row.jumlah)}</td></tr>`).join("") || kosong(5, "Tidak ada tambahan modal");
  const keluarHtml = input.moves.filter((row) => row.jenis === "KELUAR").map((row, index) => `<tr><td class="center">${index + 1}</td><td>${esc(jam(row.tanggal))}</td><td>${esc(row.kasir || "-")}</td><td>${esc(row.keterangan || "-")}</td><td class="right">${money(row.jumlah)}</td></tr>`).join("") || kosong(5, "Tidak ada pengeluaran");
  const returHtml = input.returs.map((row, index) => {
    const net = Number(row.net_amount || 0);
    const text = net > 0 ? `(Refund) ${money(net)}` : net < 0 ? `(Tambahan) ${money(Math.abs(net))}` : money(0);
    return `<tr><td class="center">${index + 1}</td><td>${esc(jam(row.tanggal))}</td><td>${esc(row.id)}</td><td>${esc(row.pelanggan || "Umum")}</td><td class="right">${esc(text)}</td></tr>`;
  }).join("") || kosong(5, "Tidak ada retur barang");
  openPrint(
    "Laporan Kas Harian",
    `<h2>LAPORAN KAS HARIAN</h2>
    <p style="text-align:center;margin:0 0 12px">Periode: ${esc(input.start)} s/d ${esc(input.end)}</p>
    <div style="display:flex;justify-content:space-around;gap:8px;border:1px solid #000;background:#f9f9f9;padding:12px;margin-bottom:16px;text-align:center">
      <div><span>Total Penjualan</span><p style="margin:4px 0 0;font-weight:bold;color:#dc2626">${money(input.invoices.reduce((sum, row) => sum + Number(row.total || 0), 0))}</p><small>Semua nota kasir</small></div>
      <div><span>Uang Masuk Laci</span><p style="margin:4px 0 0;font-weight:bold;color:#dc2626">${money(uangMasuk)}</p><small>Penjualan Cash + Tambahan</small></div>
      <div><span>Uang Keluar Laci</span><p style="margin:4px 0 0;font-weight:bold;color:#dc2626">${money(uangKeluar)}</p><small>Refund tunai + pengeluaran</small></div>
      <div><span>Pergerakan Bersih Laci</span><p style="margin:4px 0 0;font-weight:bold;color:#dc2626">${money(bersih)}</p></div>
      <div><span>Transfer Bersih</span><p style="margin:4px 0 0;font-weight:bold;color:#dc2626">${money(transferBersih)}</p></div>
      <div><span>Bon / Piutang</span><p style="margin:4px 0 0;font-weight:bold;color:#dc2626">${money(input.bon)}</p></div>
    </div>
    <h3>1. Buku Keuangan Harian — Semua Penambahan & Pengurangan</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Ref</th><th>Jenis</th><th>Kasir</th><th>Metode / Bank</th><th class="right">Laci Masuk</th><th class="right">Laci Keluar</th><th class="right">Net Laci</th><th class="right">Transfer</th><th class="right">Bon</th></tr></thead><tbody>${bukuHtml}</tbody></table>
    <h3>2. Rincian Pemasukan Kas (Penjualan)</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Invoice</th><th>Kasir</th><th class="right">Total Belanja</th><th class="right">Uang Diterima</th><th class="right">Kembalian</th></tr></thead><tbody>${jualHtml}</tbody></table>
    <h3>3. Uang Masuk Tambahan — untuk apa</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Kasir</th><th>Keterangan</th><th class="right">Jumlah</th></tr></thead><tbody>${masukHtml}</tbody></table>
    <h3>4. Uang Keluar — untuk apa</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>Kasir</th><th>Keterangan</th><th class="right">Jumlah</th></tr></thead><tbody>${keluarHtml}</tbody></table>
    <h3>5. Rincian Retur & Tukar Barang</h3>
    <table><thead><tr><th>No</th><th>Waktu</th><th>No Retur</th><th>Pelanggan</th><th class="right">Selisih</th></tr></thead><tbody>${returHtml}</tbody></table>`,
    true,
  );
}

export function printStockReport(items: Array<{ nama: string; merek?: string; partNumber?: string; partNumbersAlt?: string; kodePajak?: string; kategori?: string; stokMin: number; stok: number; satuan: string; hargaJual: number; hargaBeli: number }>, info?: { kategori?: string; tanggal?: string }) {
  if (!items.length) throw new Error("Tidak ada data laporan untuk dicetak.");
  const kategori = info?.kategori?.trim() || "Semua Kategori";
  const tanggal = info?.tanggal || new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const judul = `STOK ${kategori.toUpperCase()} PER TANGGAL ${tanggal.toUpperCase()}`;
  let totalStok = 0;
  let modal = 0;
  const rows = items
    .map((item, index) => {
      totalStok += Number(item.stok);
      modal += Number(item.hargaBeli) * Number(item.stok);
      const status = item.stok <= 0 ? "HABIS" : item.stokMin > 0 && item.stok <= item.stokMin ? "KRITIS" : "CUKUP";
      return `<tr><td class="center">${index + 1}</td><td>${esc(item.nama)}<br><span style="font-size:9px;color:#555">${esc(item.merek || "-")}</span></td><td>${esc(item.kategori || "-")}</td><td>${esc(item.partNumber || "-")}</td><td>${esc(item.partNumbersAlt || "-")}</td><td class="center" style="font-weight:bold;color:#7c3aed">${esc(item.kodePajak || "-")}</td><td class="center">${item.stokMin}</td><td class="center" style="font-weight:bold">${item.stok} ${esc(item.satuan)}</td><td class="right">${Number(item.hargaJual || 0).toLocaleString("id-ID")}</td><td class="center">${status}</td></tr>`;
    })
    .join("");
  openPrint(
    judul,
    `<h2 style="text-align:center;margin:0 0 4px">${esc(judul)}</h2>
    <p style="text-align:center;margin:0 0 10px">Kategori: ${esc(kategori)} · Tanggal cetak: ${esc(tanggal)} · ${items.length} barang</p>
    <table><thead><tr><th>No</th><th>Nama</th><th>Kategori</th><th>Part Number</th><th>Alt PN</th><th class="center">Kode Pajak</th><th class="center">Min Stok</th><th class="center">Stok Akhir</th><th class="right">Harga Jual</th><th class="center">Status</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="7" class="right bold">Total Stok & Nilai Modal:</td><td class="center bold">${totalStok}</td><td class="right bold">${money(modal)}</td><td></td></tr></tfoot></table>`,
    true,
  );
}

export function printDebtReport(rows: Array<Record<string, unknown>>, start: string, end: string, status = "Semua") {
  if (!rows.length) throw new Error("Tidak ada data bon untuk dicetak.");
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const name = String(row.tujuan || "Umum");
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  let sisa = 0;
  let lunas = 0;
  let cards = "";
  for (const [name, invoices] of groups) {
    const piutang = invoices.filter((inv) => inv.status_bayar === "Bon").reduce((sum, inv) => sum + Number(inv.total), 0);
    const sudah = invoices.filter((inv) => inv.status_bayar === "Lunas").reduce((sum, inv) => sum + Number(inv.total), 0);
    sisa += piutang;
    lunas += sudah;
    const notes = invoices.map((inv) => {
      const items = asList(inv.items);
      const itemRows = items.map((item) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(item.nama)} ${item.kode_pajak ? `(${esc(item.kode_pajak)})` : ""}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${esc(item.qty)} ${esc(item.satuan || "")}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${money(item.harga)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${money(Number(item.harga) * Number(item.qty))}</td></tr>`).join("");
      const color = inv.status_bayar === "Lunas" ? "#16a34a" : "#dc2626";
      const lunasInfo = inv.status_bayar === "Lunas" && inv.tanggal_lunas ? `<br><span style="font-size:9px;color:#16a34a">Lunas: ${esc(whenText(inv.tanggal_lunas))}</span>` : "";
      const ket = inv.keterangan ? `<br><b>Keterangan:</b> ${esc(inv.keterangan)}` : "";
      return `<div style="border:1px solid #ccc;margin-bottom:10px"><div style="display:flex;justify-content:space-between;padding:8px;background:#f8f9fa;border-bottom:1px solid #ccc"><div style="font-size:10px"><b>Inv:</b> ${esc(inv.nomor)}<br><b>Tgl Bon:</b> ${esc(whenText(inv.tanggal))} ${lunasInfo}${ket}</div><div style="text-align:right;font-size:10px"><b style="color:${color}">${esc(String(inv.status_bayar || "").toUpperCase())}</b><br><b>Total: ${money(inv.total)}</b></div></div><table style="width:100%;border-collapse:collapse;font-size:9px"><thead><tr><th style="padding:4px 8px;text-align:left;border-bottom:1px solid #ddd">Nama Barang</th><th style="padding:4px 8px;text-align:center;border-bottom:1px solid #ddd">Qty</th><th style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd">Harga</th><th style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd">Subtotal</th></tr></thead><tbody>${itemRows || `<tr><td colspan="4" class="center">Tidak ada barang</td></tr>`}</tbody></table></div>`;
    }).join("");
    cards += `<div style="margin-bottom:25px;border-left:4px solid #dc2626;padding-left:15px"><div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:10px"><h3 style="margin:0;font-size:14px">${esc(name)}</h3><div style="font-size:11px;text-align:right">Sisa Piutang: <b style="color:#dc2626;font-size:13px">${money(piutang)}</b> <span style="color:#999">| Histori Lunas: <b style="color:#16a34a">${money(sudah)}</b></span></div></div>${notes}</div>`;
  }
  openPrint(
    "Laporan Piutang",
    `<h2>LAPORAN BON / PIUTANG PELANGGAN</h2>
    <p style="text-align:center;margin:0 0 12px">Periode Bon: ${esc(start || "Awal")} s/d ${esc(end || "Sekarang")} | Status: ${esc(status || "Semua")}</p>
    <div style="display:flex;justify-content:space-around;border:2px solid #000;background:#f9f9f9;padding:12px;margin-bottom:20px;text-align:center">
      <div><span>Total Sisa Piutang</span><p style="margin:4px 0 0;font-size:16px;font-weight:bold;color:#dc2626">${money(sisa)}</p></div>
      <div><span>Total Histori Lunas</span><p style="margin:4px 0 0;font-size:16px;font-weight:bold;color:#16a34a">${money(lunas)}</p></div>
    </div>
    ${cards}`,
  );
}

export function printHistoryReport(rows: Array<Record<string, unknown>>, start: string, end: string) {
  if (!rows.length) throw new Error("Tidak ada transaksi untuk dicetak.");
  let cash = 0;
  let transfer = 0;
  let bon = 0;
  const body = rows
    .map((row, index) => {
      const nilai = String(row.source) === "Kasir" ? Number(row.harga_satuan || 0) * Number(row.jumlah || 0) : 0;
      if (String(row.source) === "Kasir") {
        if (row.status_bayar === "Bon") bon += nilai;
        else if (row.metode_bayar === "Tunai") cash += nilai;
        else if (row.metode_bayar === "Transfer") transfer += nilai;
      }
      return `<tr><td class="center">${index + 1}</td><td style="white-space:nowrap">${esc(whenText(row.tanggal))}</td><td>${esc(row.nomor || "-")}</td><td>${esc(row.part_number || "-")}</td><td>${esc(row.nama || "Barang")}</td><td class="center" style="font-weight:bold;color:#7c3aed">${esc(row.kode_pajak || "-")}</td><td class="center">${esc(row.source)}</td><td class="center">${esc(row.source === "Kasir" ? row.metode_bayar || "-" : "-")}</td><td class="center">${esc(row.source === "Kasir" ? row.status_bayar || "-" : "-")}</td><td class="center">${esc(row.jenis === "MASUK" ? "MASUK" : "KELUAR")}</td><td class="center" style="font-weight:bold">${esc(row.jumlah)} ${esc(row.satuan || "")}</td><td class="right">${Number(row.harga_satuan) ? money(row.harga_satuan) : "-"}</td><td class="right">${nilai > 0 ? money(nilai) : "-"}</td></tr>`;
    })
    .join("");
  openPrint(
    "Riwayat Transaksi",
    `<h2>LAPORAN RIWAYAT TRANSAKSI</h2>
    <p style="text-align:center;margin:0 0 12px">Periode: ${esc(start || "Awal")} s/d ${esc(end || "Sekarang")}</p>
    <div style="display:flex;justify-content:space-around;border:1px solid #000;background:#f9f9f9;padding:12px;margin-bottom:16px;text-align:center">
      <div><span>Total Tunai</span><p style="margin:4px 0 0;font-size:16px;font-weight:bold;color:#16a34a">${money(cash)}</p></div>
      <div><span>Total Transfer</span><p style="margin:4px 0 0;font-size:16px;font-weight:bold;color:#2563eb">${money(transfer)}</p></div>
      <div><span>Total Bon</span><p style="margin:4px 0 0;font-size:16px;font-weight:bold;color:#dc2626">${money(bon)}</p></div>
    </div>
    <table><thead><tr><th>No</th><th>Tanggal</th><th>Invoice</th><th>Part Number</th><th>Nama Barang</th><th>Kode Pajak</th><th>Sumber</th><th>Metode</th><th>Status</th><th>Jenis</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead><tbody>${body}</tbody></table>`,
    true,
  );
}
