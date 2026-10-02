import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import type { Bank, Pajak, Partner, Product, Role, Shift, Staff } from "@/lib/shop/types";

const COOKIE = "mjs_session";

type StaffRow = Staff & { password_hash?: string };

let seeded = false;

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function cleanError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Gagal memproses";
  return raw.replace(/^error:\s*/i, "").split("\n")[0];
}

async function sql() {
  return getSql();
}

async function ensureStaff() {
  if (seeded) return;
  const db = await sql();
  const rows = await db.query<{ n: number }>("select count(*)::int as n from staff");
  if (Number(rows[0]?.n ?? 0) === 0) {
    const defaults: Array<[string, string, Role, string, string]> = [
      ["owner", "owner123", "Owner", "Pemilik", ""],
      ["admin", "admin123", "Admin", "Administrator", ""],
      ["pagi", "pagi123", "Kasir", "Kasir Pagi", "Kasir Pagi"],
      ["siang", "siang123", "Kasir", "Kasir Siang", "Kasir Siang"],
    ];
    for (const [username, password, role, name, shift] of defaults) {
      await db.query(
        `insert into staff (username, password_hash, role, name, shift, status)
         values ($1, $2, $3, $4, $5, 'Aktif')
         on conflict (username) do nothing`,
        [username, hashPassword(password), role, name, shift],
      );
    }
  }
  seeded = true;
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    kode: String(row.kode ?? ""),
    partNumber: String(row.part_number ?? ""),
    partNumbersAlt: String(row.part_numbers_alt ?? ""),
    nama: String(row.nama ?? ""),
    kategori: String(row.kategori ?? ""),
    merek: String(row.merek ?? ""),
    satuan: String(row.satuan ?? "Pcs"),
    stokMin: Number(row.stok_min ?? 0),
    stok: Number(row.stok ?? 0),
    hargaBeli: Number(row.harga_beli ?? 0),
    hargaJual: Number(row.harga_jual ?? 0),
    satuanAlt: String(row.satuan_alt ?? ""),
    isiSatuanAlt: Number(row.isi_satuan_alt ?? 0),
    hargaJualAlt: Number(row.harga_jual_alt ?? 0),
    pajakStatus: String(row.pajak_status ?? "Non Pajak"),
    kodePajak: String(row.kode_pajak ?? ""),
    keterangan: String(row.keterangan ?? ""),
  };
}

function mapShift(row: Record<string, unknown>): Shift {
  return {
    id: String(row.id),
    username: String(row.username ?? ""),
    cashierName: String(row.cashier_name ?? ""),
    shift: String(row.shift ?? ""),
    start: new Date(String(row.start_time)).toISOString(),
    end: row.end_time ? new Date(String(row.end_time)).toISOString() : null,
    status: String(row.status ?? ""),
    kasAwal: Number(row.kas_awal ?? 0),
    countedCash: row.counted_cash == null ? null : Number(row.counted_cash),
    kasAkhir: row.kas_akhir == null ? null : Number(row.kas_akhir),
    closedBy: String(row.closed_by ?? ""),
  };
}

async function readStaff(): Promise<Staff | null> {
  await ensureStaff();
  const token = getCookie(COOKIE);
  if (!token) return null;
  const db = await sql();
  const rows = await db.query<StaffRow>(
    `select s.username, s.role, s.name, s.shift, s.status
     from sessions e
     join staff s on s.username = e.username
     where e.token = $1 and e.expires_at > now() and s.status = 'Aktif'`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    username: row.username,
    role: row.role,
    name: row.name,
    shift: row.shift,
    status: row.status,
  };
}

async function requireStaff() {
  const me = await readStaff();
  if (!me) throw new Error("Sesi habis. Masuk lagi.");
  return me;
}

function assertAdmin(me: Staff) {
  if (me.role !== "Admin") throw new Error("Hanya Admin yang dapat mengubah data ini.");
}

async function audit(me: Staff, action: string) {
  const db = await sql();
  await db.query(
    `insert into audit_log (username, name, action) values ($1, $2, $3)`,
    [me.username, me.name, action],
  );
}

export async function getMe() {
  return readStaff();
}



export async function login(data: any) {
    await ensureStaff();
    const db = await sql();
    const rows = await db.query<StaffRow>(
      `select username, password_hash, role, name, shift, status from staff where lower(username) = lower($1)`,
      [data.username],
    );
    const row = rows[0];
    if (!row || row.status !== "Aktif" || !verifyPassword(data.password, String(row.password_hash))) {
      throw new Error("Username atau password salah.");
    }
    const token = randomBytes(32).toString("hex");
    await db.query(
      `insert into sessions (token, username, expires_at) values ($1, $2, now() + interval '14 hours')`,
      [token, row.username],
    );
    setCookie(COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 60 * 60 * 14,
    });
    await db.query(`insert into audit_log (username, name, action) values ($1, $2, 'Login')`, [
      row.username,
      row.name,
    ]);
    const me: Staff = {
      username: row.username,
      role: row.role,
      name: row.name,
      shift: row.shift,
      status: row.status,
    };
    return me;
  }



export async function logout() {
  const token = getCookie(COOKIE);
  if (token) {
    const db = await sql();
    await db.query(`delete from sessions where token = $1`, [token]);
  }
  setCookie(COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: false, maxAge: 0 });
  return { ok: true };
}



export async function getDashboard() {
  const me = await requireStaff();
  const db = await sql();
  const [stats] = await db.query<{
    products: number;
    stock_pcs: number;
    stock_value: number;
    habis: number;
    kritis: number;
  }>(
    `select
       count(*)::int as products,
       coalesce(sum(stok), 0)::int as stock_pcs,
       coalesce(sum(stok::bigint * harga_beli), 0)::bigint as stock_value,
       count(*) filter (where stok <= 0)::int as habis,
       count(*) filter (where stok > 0 and stok_min > 0 and stok <= stok_min)::int as kritis
     from products`,
  );
  const [today] = await db.query<{ sales: number; tunai: number; transfer: number; bon: number; masuk: number; trx: number }>(
    `select
       coalesce(sum(case when source = 'Kasir' then total else 0 end), 0)::bigint as sales,
       coalesce(sum(case when source = 'Kasir' and status_bayar = 'Lunas' and metode_bayar = 'Tunai' then total else 0 end), 0)::bigint as tunai,
       coalesce(sum(case
         when source = 'Kasir' and status_bayar = 'Lunas' and metode_bayar = 'Transfer' then total
         when source = 'Kasir' and status_bayar = 'Lunas' and metode_bayar = 'Split' then transfer_amount
         else 0 end), 0)::bigint as transfer,
       coalesce(sum(case when source = 'Kasir' and status_bayar = 'Bon' then total else 0 end), 0)::bigint as bon,
       coalesce(sum(case when source = 'Manual' and exists (
         select 1 from invoice_lines l where l.invoice_id = invoices.id and l.jenis = 'MASUK'
       ) then 1 else 0 end), 0)::int as masuk,
       count(*) filter (where source = 'Kasir')::int as trx
     from invoices
     where (timezone('Asia/Makassar', tanggal))::date = (timezone('Asia/Makassar', now()))::date`,
  );
  const [month] = await db.query<{ n: number; trx: number }>(
    `select coalesce(sum(total), 0)::bigint as n,
            count(*)::int as trx
     from invoices
     where source = 'Kasir'
       and to_char(timezone('Asia/Makassar', tanggal), 'YYYY-MM') = to_char(timezone('Asia/Makassar', now()), 'YYYY-MM')`,
  );
  const weekRows = await db.query<{ d: string; n: number }>(
    `with days as (
       select generate_series(
         (timezone('Asia/Makassar', now()))::date - 6,
         (timezone('Asia/Makassar', now()))::date,
         interval '1 day'
       )::date as d
     )
     select to_char(days.d, 'YYYY-MM-DD') as d,
            coalesce(sum(i.total), 0)::bigint as n
     from days
     left join invoices i
       on i.source = 'Kasir'
      and (timezone('Asia/Makassar', i.tanggal))::date = days.d
     group by days.d
     order by days.d`,
  );
  const lowRows = await db.query(
    `select * from products
     where stok <= 0 or (stok_min > 0 and stok <= stok_min)
     order by stok asc, nama asc
     limit 6`,
  );
  const shiftRows = await db.query(
    me.role === "Kasir"
      ? `select * from shifts where status = 'AKTIF' and username = $1 order by start_time desc limit 1`
      : `select * from shifts where status = 'AKTIF' order by start_time desc limit 1`,
    me.role === "Kasir" ? [me.username] : [],
  );
  const shift = shiftRows[0] ? mapShift(shiftRows[0] as Record<string, unknown>) : null;
  let drawer: number | null = null;
  if (shift) {
    const [d] = await db.query<{ n: number }>(`select shift_drawer($1)::bigint as n`, [shift.id]);
    drawer = Number(d?.n ?? 0);
  }
  const [cashToday] = await db.query<{ masuk: number; keluar: number }>(
    `select
       coalesce(sum(case when jenis = 'MASUK' then jumlah else 0 end), 0)::bigint as masuk,
       coalesce(sum(case when jenis = 'KELUAR' then jumlah else 0 end), 0)::bigint as keluar
     from cash_moves
     where (timezone('Asia/Makassar', tanggal))::date = (timezone('Asia/Makassar', now()))::date`,
  );
  const top = await db.query<{ nama: string; satuan: string; qty: number; total: number }>(
    `select coalesce(p.nama, l.custom_item, 'Barang') as nama,
            l.satuan,
            sum(l.jumlah)::int as qty,
            sum(l.jumlah * l.harga_satuan)::bigint as total
     from invoice_lines l
     join invoices i on i.id = l.invoice_id
     left join products p on p.id = l.product_id
     where i.source = 'Kasir' and l.jenis = 'KELUAR'
       and i.tanggal >= (timezone('Asia/Makassar', now()) - interval '30 days')
     group by 1, 2
     order by total desc
     limit 6`,
  );
  const recentIn = await db.query<{ nama: string; satuan: string; qty: number; tujuan: string; tanggal: string }>(
    `select coalesce(p.nama, 'Barang') as nama, l.satuan, l.jumlah::int as qty, i.tujuan, i.tanggal::text as tanggal
     from invoice_lines l
     join invoices i on i.id = l.invoice_id
     left join products p on p.id = l.product_id
     where i.source = 'Manual' and l.jenis = 'MASUK'
       and to_char(timezone('Asia/Makassar', i.tanggal), 'YYYY-MM') = to_char(timezone('Asia/Makassar', now()), 'YYYY-MM')
     order by i.tanggal desc
     limit 4`,
  );
  const [monthIn] = await db.query<{ qty: number; nilai: number; nota: number }>(
    `select coalesce(sum(l.jumlah_dasar), 0)::int as qty,
            coalesce(sum(l.jumlah_dasar::bigint * coalesce(p.harga_beli, 0)), 0)::bigint as nilai,
            count(distinct i.id)::int as nota
     from invoice_lines l
     join invoices i on i.id = l.invoice_id
     left join products p on p.id = l.product_id
     where i.source = 'Manual' and l.jenis = 'MASUK'
       and to_char(timezone('Asia/Makassar', i.tanggal), 'YYYY-MM') = to_char(timezone('Asia/Makassar', now()), 'YYYY-MM')`,
  );
  return {
    products: Number(stats?.products ?? 0),
    stockPcs: Number(stats?.stock_pcs ?? 0),
    stockValue: Number(stats?.stock_value ?? 0),
    habis: Number(stats?.habis ?? 0),
    kritis: Number(stats?.kritis ?? 0),
    today: {
      sales: Number(today?.sales ?? 0),
      tunai: Number(today?.tunai ?? 0),
      transfer: Number(today?.transfer ?? 0),
      bon: Number(today?.bon ?? 0),
      trx: Number(today?.trx ?? 0),
      cashIn: Number(cashToday?.masuk ?? 0),
      cashOut: Number(cashToday?.keluar ?? 0),
    },
    month: Number(month?.n ?? 0),
    monthTrx: Number(month?.trx ?? 0),
    masuk: Number(today?.masuk ?? 0),
    monthIn: {
      qty: Number(monthIn?.qty ?? 0),
      nilai: Number(monthIn?.nilai ?? 0),
      nota: Number(monthIn?.nota ?? 0),
    },
    week: weekRows.map((row) => ({ date: String(row.d), total: Number(row.n ?? 0) })),
    low: lowRows.map((row) => mapProduct(row as Record<string, unknown>)),
    top: top.map((row) => ({ nama: row.nama, satuan: row.satuan, qty: Number(row.qty), total: Number(row.total) })),
    recentIn: recentIn.map((row) => ({
      nama: row.nama,
      satuan: row.satuan,
      qty: Number(row.qty),
      tujuan: row.tujuan || "Supplier/Gudang",
      tanggal: row.tanggal,
    })),
    shift,
    drawer,
  };
}



export async function searchProducts(data: any) {
    await requireStaff();
    const db = await sql();
    const scan = data.q.match(/^(.*)-(pcs|dus)$/i);
    if (scan) {
      const rows = await db.query(`select * from products where lower(kode) = lower($1) limit 1`, [scan[1]]);
      return {
        unit: scan[2].toLowerCase() as "pcs" | "dus",
        items: rows.map((row) => mapProduct(row as Record<string, unknown>)),
      };
    }
    if (data.q.length < 1) return { unit: null, items: [] as Product[] };
    const like = `%${data.q}%`;
    const rows = await db.query(
      `select * from products
       where nama ilike $1 or part_number ilike $1 or part_numbers_alt ilike $1
          or kode ilike $1 or merek ilike $1 or kode_pajak ilike $1
       order by
         case when lower(part_number) = lower($2) or lower(kode) = lower($2) then 0 else 1 end,
         nama
       limit $3`,
      [like, data.q, data.limit],
    );
    return { unit: null, items: rows.map((row) => mapProduct(row as Record<string, unknown>)) };
  }



export async function listProducts(data: any) {
    await requireStaff();
    const db = await sql();
    const where: string[] = [];
    const params: unknown[] = [];
    if (data.q) {
      params.push(`%${data.q}%`);
      where.push(
        `(nama ilike $${params.length} or part_number ilike $${params.length} or part_numbers_alt ilike $${params.length} or kode ilike $${params.length} or merek ilike $${params.length} or kode_pajak ilike $${params.length} or kategori ilike $${params.length})`,
      );
    }
    if (data.kategori) {
      params.push(data.kategori);
      where.push(`kategori = $${params.length}`);
    }
    if (data.status === "Habis") where.push(`stok <= 0`);
    if (data.status === "Menipis") where.push(`stok > 0 and stok_min > 0 and stok <= stok_min`);
    if (data.status === "Aman") where.push(`not (stok <= 0 or (stok_min > 0 and stok <= stok_min))`);
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    const order =
      data.sort === "stok_asc"
        ? "stok asc, nama asc"
        : data.sort === "stok_desc"
          ? "stok desc, nama asc"
          : data.sort === "nama_desc"
            ? "nama desc"
            : "nama asc";
    const [countRow] = await db.query<{ n: number }>(
      `select count(*)::int as n from products ${clause}`,
      params,
    );
    const perPage = 15;
    const offset = (data.page - 1) * perPage;
    const rows = await db.query(
      `select * from products ${clause} order by ${order} limit ${perPage} offset ${offset}`,
      params,
    );
    const cats = await db.query<{ kategori: string }>(
      `select distinct kategori from products where kategori <> '' order by kategori`,
    );
    return {
      total: Number(countRow?.n ?? 0),
      page: data.page,
      perPage,
      categories: cats.map((row) => row.kategori),
      items: rows.map((row) => mapProduct(row as Record<string, unknown>)),
    };
  }



type ProductInput = {
  id?: number | null;
  partNumber: string;
  partNumbersAlt: string;
  nama: string;
  kategori: string;
  merek: string;
  satuan: string;
  stokMin: number;
  stok: number;
  hargaBeli: number;
  hargaJual: number;
  satuanAlt: string;
  isiSatuanAlt: number;
  hargaJualAlt: number;
  pajakStatus: string;
  kodePajak: string;
  keterangan: string;
};

async function nextKode(db: Awaited<ReturnType<typeof sql>>) {
  const [row] = await db.query<{ n: number }>(
    `select coalesce(max((substring(kode from 4))::int), 0)::int as n
     from products where kode ~ '^SP-[0-9]+$'`,
  );
  return `SP-${String(Number(row?.n ?? 0) + 1).padStart(4, "0")}`;
}

export async function saveProduct(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    if (!data.nama?.trim()) throw new Error("Nama barang wajib diisi.");
    const db = await sql();
    const pajak = data.pajakStatus === "Pajak" ? "Pajak" : "Non Pajak";
    const kodePajak = pajak === "Pajak" ? String(data.kodePajak ?? "").trim() : "";
    if (data.id) {
      await db.query(
        `update products set
           part_number=$2, part_numbers_alt=$3, nama=$4, kategori=$5, merek=$6, satuan=$7,
           stok_min=$8, stok=$9, harga_beli=$10, harga_jual=$11, satuan_alt=$12,
           isi_satuan_alt=$13, harga_jual_alt=$14, pajak_status=$15, kode_pajak=$16, keterangan=$17
         where id=$1`,
        [
          data.id,
          data.partNumber ?? "",
          data.partNumbersAlt ?? "",
          data.nama.trim(),
          data.kategori || "SPAREPART",
          data.merek ?? "",
          data.satuan || "Pcs",
          Number(data.stokMin) || 0,
          Number(data.stok) || 0,
          Number(data.hargaBeli) || 0,
          Number(data.hargaJual) || 0,
          data.satuanAlt ?? "",
          Number(data.isiSatuanAlt) || 0,
          Number(data.hargaJualAlt) || 0,
          pajak,
          kodePajak,
          data.keterangan ?? "",
        ],
      );
      await audit(me, `Ubah barang ${data.nama.trim()}`);
      return { ok: true };
    }
    const kode = await nextKode(db);
    await db.query(
      `insert into products (
         kode, part_number, part_numbers_alt, nama, kategori, merek, satuan, stok_min, stok,
         harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak, keterangan
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        kode,
        data.partNumber ?? "",
        data.partNumbersAlt ?? "",
        data.nama.trim(),
        data.kategori || "SPAREPART",
        data.merek ?? "",
        data.satuan || "Pcs",
        Number(data.stokMin) || 0,
        Number(data.stok) || 0,
        Number(data.hargaBeli) || 0,
        Number(data.hargaJual) || 0,
        data.satuanAlt ?? "",
        Number(data.isiSatuanAlt) || 0,
        Number(data.hargaJualAlt) || 0,
        pajak,
        kodePajak,
        data.keterangan ?? "",
      ],
    );
    await audit(me, `Tambah barang ${kode} ${data.nama.trim()}`);
    return { ok: true, kode };
  }



export async function deleteProduct(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    const used = await db.query<{ n: number }>(
      `select count(*)::int as n from invoice_lines where product_id = $1`,
      [data.id],
    );
    if (Number(used[0]?.n ?? 0) > 0) throw new Error("Barang sudah pernah ditransaksikan, tidak bisa dihapus.");
    await db.query(`delete from products where id = $1`, [data.id]);
    await audit(me, `Hapus barang #${data.id}`);
    return { ok: true };
  }



function moneyId(raw: string) {
  const compact = String(raw ?? "").replace(/rp/gi, "").replace(/\s/g, "");
  if (!compact) return 0;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)) return Math.round(Number(compact.replace(/\./g, "").replace(",", "."))) || 0;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) return Math.round(Number(compact.replace(/,/g, ""))) || 0;
  return Number(compact.replace(/[^\d]/g, "")) || 0;
}

function splitCatalogName(raw: string) {
  let nama = raw.trim();
  let kodePajak = "";
  let merek = "";
  const slash = nama.indexOf(" / ");
  if (slash > 0) {
    const left = nama.slice(0, slash).trim();
    const right = nama.slice(slash + 3).trim();
    if (left && !/\s/.test(left) && left.length <= 24) {
      kodePajak = left;
      nama = right;
    }
  }
  const dash = nama.lastIndexOf(" - ");
  if (dash > 0) {
    const left = nama.slice(0, dash).trim();
    const right = nama.slice(dash + 3).trim();
    if (left && right && right.length <= 48) {
      nama = left;
      merek = right;
    }
  }
  return { nama, merek, kodePajak };
}

export async function importProducts(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    const rows = [];
    for (const raw of data.rows as Record<string, string>[]) {
      const row: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) row[key.trim().toUpperCase()] = String(value ?? "").trim();
      const partNumber = row["KODE SPAREPART"] || row["PART NUMBER"] || row["KODE"] || "";
      const parsed = splitCatalogName(row["NAMA SPAREPART"] || row["NAMA"] || "");
      const kodePajak = row["KODE PAJAK"] || parsed.kodePajak;
      const merek = row["MEREK"] || parsed.merek;
      const nama = parsed.nama;
      if (!partNumber && !nama) continue;
      const status = kodePajak || (row["STATUS PAJAK"] || "").toLowerCase() === "pajak" ? "Pajak" : "Non Pajak";
      rows.push({
        partNumber,
        nama,
        kategori: row["JENIS BARANG"] || row["JENIS"] || row["KATEGORI"] || "Umum",
        merek,
        stok: Number(String(row["STOK"] ?? row["STOK AWAL"] ?? "0").replace(/[^\d-]/g, "")) || 0,
        harga: moneyId(row["HARGA"] || row["HARGA JUAL"] || "0"),
        hargaBeli: moneyId(row["HARGA BELI"] || "0"),
        satuan: row["SATUAN"] || "Pcs",
        satuanAlt: row["SATUAN ALT"] || row["SATUAN KONVERSI"] || "",
        isiAlt: Number(String(row["ISI ALT"] || row["ISI SATUAN ALT"] || "0").replace(/\D/g, "")) || 0,
        hargaAlt: moneyId(row["HARGA JUAL ALT"] || row["HARGA DUS"] || "0"),
        status,
        kodePajak,
      });
    }
    try {
      const [result] = await db.query<{ shop_import: { created?: number; updated?: number } | string }>(
        `select shop_import($1::jsonb) as shop_import`,
        [JSON.stringify({ replaceStock: data.replaceStock, rows })],
      );
      const payload = typeof result?.shop_import === "string" ? JSON.parse(result.shop_import) as { created?: number; updated?: number } : result?.shop_import;
      const created = Number(payload?.created ?? 0);
      const updated = Number(payload?.updated ?? 0);
      await audit(me, `Impor CSV: ${created} baru, ${updated} diperbarui`);
      return { created, updated };
    } catch (error) {
      throw new Error(cleanError(error));
    }
  }



export async function listPartners() {
  await requireStaff();
  const db = await sql();
  const rows = await db.query<Partner>(
    `select id, nama, tipe, telp, alamat from partners order by nama`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    nama: row.nama,
    tipe: row.tipe,
    telp: row.telp,
    alamat: row.alamat,
  }));
}



export async function savePartner(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    if (!data.nama?.trim()) throw new Error("Nama wajib diisi.");
    const tipe = data.tipe === "Supplier" ? "Supplier" : "Pelanggan";
    const db = await sql();
    if (data.id) {
      await db.query(`update partners set nama=$2, tipe=$3, telp=$4, alamat=$5 where id=$1`, [
        data.id,
        data.nama.trim(),
        tipe,
        data.telp ?? "",
        data.alamat ?? "",
      ]);
    } else {
      await db.query(`insert into partners (nama, tipe, telp, alamat) values ($1,$2,$3,$4)`, [
        data.nama.trim(),
        tipe,
        data.telp ?? "",
        data.alamat ?? "",
      ]);
    }
    return { ok: true };
  }



export async function deletePartner(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    await db.query(`delete from partners where id = $1`, [data.id]);
    return { ok: true };
  }



export async function listMasters() {
  await requireStaff();
  const db = await sql();
  const banks = await db.query(
    `select id, nama, rekening, atas_nama, aktif, keterangan from master_bank order by id`,
  );
  const pajak = await db.query(`select id, jenis, persentase, aktif from master_pajak order by id`);
  const [profile] = await db.query<{ nama: string; alamat: string; telepon: string }>(
    `select nama, alamat, telepon from shop_profile where id = 1`,
  );
  return {
    banks: banks.map((row) => {
      const b = row as Record<string, unknown>;
      return {
        id: Number(b.id),
        nama: String(b.nama),
        rekening: String(b.rekening ?? ""),
        atasNama: String(b.atas_nama ?? ""),
        aktif: Boolean(b.aktif),
        keterangan: String(b.keterangan ?? ""),
      } satisfies Bank;
    }),
    pajak: pajak.map((row) => {
      const p = row as Record<string, unknown>;
      return {
        id: Number(p.id),
        jenis: String(p.jenis),
        persentase: Number(p.persentase),
        aktif: Boolean(p.aktif),
      } satisfies Pajak;
    }),
    profile: profile ?? { nama: "MURIA JAYA SAKTI", alamat: "", telepon: "" },
  };
}



export async function savePajak(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    for (const item of data.items ?? []) {
      await db.query(`update master_pajak set persentase = $2 where id = $1`, [
        item.id,
        Number(item.persentase) || 0,
      ]);
    }
    await audit(me, "Ubah master pajak");
    return { ok: true };
  }



export async function saveBank(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    if (!data.nama?.trim()) throw new Error("Nama bank wajib diisi.");
    const db = await sql();
    if (data.id) {
      await db.query(
        `update master_bank set nama=$2, rekening=$3, atas_nama=$4, aktif=$5, keterangan=$6 where id=$1`,
        [data.id, data.nama.trim(), data.rekening ?? "", data.atasNama ?? "", data.aktif !== false, data.keterangan ?? ""],
      );
    } else {
      await db.query(
        `insert into master_bank (nama, rekening, atas_nama, aktif, keterangan) values ($1,$2,$3,$4,$5)`,
        [data.nama.trim(), data.rekening ?? "", data.atasNama ?? "", data.aktif !== false, data.keterangan ?? ""],
      );
    }
    return { ok: true };
  }



export async function listShifts() {
  const me = await requireStaff();
  const db = await sql();
  const rows = await db.query(
    me.role === "Kasir"
      ? `select * from shifts where username = $1 or status = 'AKTIF' order by start_time desc limit 40`
      : `select * from shifts order by start_time desc limit 80`,
    me.role === "Kasir" ? [me.username] : [],
  );
  const shifts = rows.map((row) => mapShift(row as Record<string, unknown>));
  const drawers: Record<string, number> = {};
  for (const shift of shifts.filter((s) => s.status === "AKTIF")) {
    const [d] = await db.query<{ n: number }>(`select shift_drawer($1)::bigint as n`, [shift.id]);
    drawers[shift.id] = Number(d?.n ?? 0);
  }
  const staff = me.role === "Kasir"
    ? []
    : await db.query<Staff>(`select username, role, name, shift, status from staff order by username`);
  return { shifts, drawers, staff, me };
}



export async function openShift(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    const [user] = await db.query<Staff>(
      `select username, role, name, shift, status from staff where username = $1 and role = 'Kasir' and status = 'Aktif'`,
      [data.username],
    );
    if (!user) throw new Error("Kasir tidak ditemukan.");
    const busy = await db.query(
      `select id from shifts where status = 'AKTIF' and (shift = $1 or username = $2)`,
      [data.shift, user.username],
    );
    if (busy.length) throw new Error("Shift itu atau kasir itu masih aktif. Tutup dulu.");
    const id = `SHIFT-${Date.now()}`;
    await db.query(
      `insert into shifts (id, username, cashier_name, shift, start_time, status, kas_awal)
       values ($1,$2,$3,$4, now(), 'AKTIF', $5)`,
      [id, user.username, user.name, data.shift, Number(data.kasAwal) || 0],
    );
    await db.query(`update staff set shift = $2 where username = $1`, [user.username, data.shift]);
    await audit(me, `Buka ${data.shift} untuk ${user.name}`);
    return { id };
  }



export async function closeShift(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    const [drawer] = await db.query<{ n: number }>(`select shift_drawer($1)::bigint as n`, [data.id]);
    const kasAkhir = Number(drawer?.n ?? 0);
    const counted = data.countedCash == null || Number.isNaN(Number(data.countedCash)) ? null : Number(data.countedCash);
    await db.query(
      `update shifts set status='SELESAI', end_time=now(), kas_akhir=$2, counted_cash=$3, closed_by=$4 where id=$1 and status='AKTIF'`,
      [data.id, kasAkhir, counted, me.name],
    );
    await audit(me, `Tutup shift ${data.id}`);
    return { kasAkhir, counted };
  }



export async function addCashMove(data: any) {
    const me = await requireStaff();
    const jumlah = Number(data.jumlah) || 0;
    if (jumlah <= 0 || !data.keterangan?.trim()) throw new Error("Isi jumlah dan keterangan.");
    if (data.jenis === "KELUAR") assertAdmin(me);
    else if (me.role === "Kasir") throw new Error("Kasir tidak dapat menambah kas.");
    const db = await sql();
    const [shift] = await db.query<{ cashier_name: string }>(
      `select cashier_name from shifts where id = $1 and status = 'AKTIF'`,
      [data.shiftId],
    );
    if (!shift) throw new Error("Shift belum aktif.");
    if (data.jenis === "KELUAR") {
      const [drawer] = await db.query<{ n: number }>(`select shift_drawer($1)::bigint as n`, [data.shiftId]);
      if (jumlah > Number(drawer?.n ?? 0)) throw new Error("Uang kas tidak cukup untuk dikeluarkan.");
    }
    await db.query(
      `insert into cash_moves (jenis, jumlah, keterangan, kasir, shift_id) values ($1,$2,$3,$4,$5)`,
      [data.jenis === "KELUAR" ? "KELUAR" : "MASUK", jumlah, data.keterangan.trim(), shift.cashier_name, data.shiftId],
    );
    await audit(me, `${data.jenis === "KELUAR" ? "Kas keluar" : "Kas masuk"} Rp ${jumlah.toLocaleString("id-ID")}`);
    return { ok: true };
  }



export async function deleteCashMove(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    await db.query(`delete from cash_moves where id = $1`, [data.id]);
    return { ok: true };
  }



export async function checkout(data: any): Promise<any> {
    const me = await requireStaff();
    const db = await sql();
    try {
      const [row] = await db.query<{ shop_checkout: unknown }>(`select shop_checkout($1::jsonb) as shop_checkout`, [
        JSON.stringify({ ...data, actor: me.username, role: me.role }),
      ]);
      const result = row?.shop_checkout as { nomor?: string };
      await audit(me, `Nota ${result?.nomor ?? ""}`);
      return result;
    } catch (error) {
      throw new Error(cleanError(error));
    }
  }



export async function manualNota(data: any): Promise<any> {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    try {
      const [row] = await db.query<{ shop_manual: unknown }>(`select shop_manual($1::jsonb) as shop_manual`, [
        JSON.stringify({ ...data, kasir: me.name }),
      ]);
      await audit(me, `Nota manual ${(row?.shop_manual as { nomor?: string })?.nomor ?? ""}`);
      return row?.shop_manual;
    } catch (error) {
      throw new Error(cleanError(error));
    }
  }



export async function returNota(data: any): Promise<any> {
    const me = await requireStaff();
    const db = await sql();
    try {
      const [row] = await db.query<{ shop_retur: unknown }>(`select shop_retur($1::jsonb) as shop_retur`, [
        JSON.stringify({ ...data, actor: me.username, role: me.role }),
      ]);
      await audit(me, `Retur ${(row?.shop_retur as { id?: string })?.id ?? ""}`);
      return row?.shop_retur;
    } catch (error) {
      throw new Error(cleanError(error));
    }
  }



export async function payoffBon(data: any): Promise<any> {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    try {
      const [row] = await db.query<{ shop_payoff: unknown }>(`select shop_payoff($1, $2) as shop_payoff`, [
        data.nomor,
        me.name,
      ]);
      await audit(me, `Pelunasan ${data.nomor}`);
      return row?.shop_payoff;
    } catch (error) {
      throw new Error(cleanError(error));
    }
  }



export async function editBon(data: any): Promise<any> {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    try {
      const [row] = await db.query<{ shop_edit_bon: unknown }>(`select shop_edit_bon($1::jsonb) as shop_edit_bon`, [
        JSON.stringify(data),
      ]);
      await audit(me, `Edit struk ${String(data.nomor ?? "")}`);
      return row?.shop_edit_bon;
    } catch (error) {
      throw new Error(cleanError(error));
    }
  }



export async function removeInvoice(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const db = await sql();
    try {
      await db.query(`select shop_delete_invoice($1)`, [data.nomor]);
      await audit(me, `Hapus nota ${data.nomor}`);
      return { ok: true };
    } catch (error) {
      throw new Error(cleanError(error));
    }
  }



export async function getInvoice(data: any): Promise<any> {
    await requireStaff();
    const db = await sql();
    const [inv] = await db.query(`select * from invoices where lower(nomor) = lower($1)`, [data.nomor]);
    if (!inv) return null;
    const lines = await db.query(
      `select l.*, p.nama as product_nama, p.kode, p.part_number, p.kode_pajak, p.kategori
       from invoice_lines l
       left join products p on p.id = l.product_id
       where l.invoice_id = $1
       order by l.id`,
      [(inv as { id: number }).id],
    );
    return { invoice: inv, lines };
  }



export async function listInvoices(data: any): Promise<any> {
    await requireStaff();
    const db = await sql();
    const where: string[] = [];
    const params: unknown[] = [];
    if (data.source) {
      params.push(data.source);
      where.push(`source = $${params.length}`);
    }
    if (data.status) {
      params.push(data.status);
      where.push(`status_bayar = $${params.length}`);
    }
    if (data.start) {
      params.push(data.start);
      where.push(`tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
    }
    if (data.end) {
      params.push(data.end);
      where.push(`tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
    }
    if (data.q) {
      params.push(`%${data.q}%`);
      where.push(`(nomor ilike $${params.length} or tujuan ilike $${params.length} or kasir ilike $${params.length})`);
    }
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    const [countRow] = await db.query<{ n: number }>(`select count(*)::int as n from invoices ${clause}`, params);
    const perPage = 12;
    const rows = await db.query(
      `select * from invoices ${clause} order by tanggal desc limit ${perPage} offset ${(data.page - 1) * perPage}`,
      params,
    );
    return { total: Number(countRow?.n ?? 0), page: data.page, perPage, items: rows };
  }



export async function listBon(data: any): Promise<any> {
    await requireStaff();
    const db = await sql();
    const where = [`source = 'Kasir'`, `keterangan in ('Bon (Hutang)', 'Bon (Lunas)')`];
    const params: unknown[] = [];
    if (data.status === "Bon" || data.status === "Lunas") {
      params.push(data.status);
      where.push(`status_bayar = $${params.length}`);
    }
    if (data.customer) {
      params.push(`%${data.customer}%`);
      where.push(`tujuan ilike $${params.length}`);
    }
    if (data.start) {
      params.push(data.start);
      where.push(`tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
    }
    if (data.end) {
      params.push(data.end);
      where.push(`tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
    }
    const rows = await db.query(
      `select * from invoices where ${where.join(" and ")} order by tanggal desc limit 200`,
      params,
    );
    return rows;
  }



export async function listTax(data: any): Promise<any> {
    await requireStaff();
    const db = await sql();
    const where = [`jumlah > 0`];
    const params: unknown[] = [];
    if (data.start) {
      params.push(data.start);
      where.push(`tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
    }
    if (data.end) {
      params.push(data.end);
      where.push(`tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
    }
    if (data.jenis === "Tunai") where.push(`status_bayar = 'Lunas'`);
    if (data.jenis === "Bon") where.push(`status_bayar = 'Bon'`);
    if (data.kategori && data.kategori !== "Lainnya") {
      params.push(`%${data.kategori}%`);
      where.push(`kategori ilike $${params.length}`);
    }
    if (data.kategori === "Lainnya") {
      where.push(
        `kategori not ilike '%Aki Basah%' and kategori not ilike '%Aki Kering%' and kategori not ilike '%Oli%' and kategori not ilike '%Air Radiator%' and kategori not ilike '%Minyak Rem%'`,
      );
    }
    const rows = await db.query(
      `select * from tax_lines where ${where.join(" and ")} order by tanggal desc limit 300`,
      params,
    );
    return rows;
  }



export async function shiftLedger(data: any): Promise<any> {
    await requireStaff();
    const db = await sql();
    if (data.shiftId) {
      const [shiftRow] = await db.query(`select * from shifts where id = $1`, [data.shiftId]);
      if (!shiftRow) return { drawer: 0, invoices: [], moves: [], returs: [], shift: null };
      const shift = mapShift(shiftRow as Record<string, unknown>);
      const [drawer] = await db.query<{ n: number }>(`select shift_drawer($1)::bigint as n`, [shift.id]);
      const invoices = await db.query(
        `select * from invoices where shift_id = $1 and source = 'Kasir' order by tanggal desc`,
        [shift.id],
      );
      const moves = await db.query(
        `select * from cash_moves
         where shift_id = $1
            or (shift_id is null and kasir = $2 and tanggal >= $3 and tanggal <= coalesce($4::timestamptz, now()))
         order by tanggal desc`,
        [shift.id, shift.cashierName, shift.start, shift.end],
      );
      const returs = await db.query(`select * from returs where shift_id = $1 order by tanggal desc`, [shift.id]);
      return { drawer: Number(drawer?.n ?? 0), invoices, moves, returs, shift };
    }
    const params: unknown[] = [];
    let filter = "true";
    if (data.start) {
      params.push(data.start);
      filter += ` and tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`;
    }
    if (data.end) {
      params.push(data.end);
      filter += ` and tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`;
    }
    const invoices = await db.query(`select * from invoices where source = 'Kasir' and ${filter} order by tanggal desc limit 300`, params);
    const moves = await db.query(`select * from cash_moves where ${filter} order by tanggal desc limit 200`, params);
    const returs = await db.query(`select * from returs where ${filter} order by tanggal desc limit 200`, params);
    return { drawer: null, invoices, moves, returs, shift: null };
  }



export async function listAudit(data: any): Promise<any> {
    const me = await requireStaff();
    if (me.role === "Kasir") throw new Error("Kasir tidak dapat membuka jejak aktivitas.");
    const db = await sql();
    const params: unknown[] = [];
    let where = "true";
    if (data.q) {
      params.push(`%${data.q}%`);
      where = `(action ilike $1 or username ilike $1 or name ilike $1)`;
    }
    return db.query(`select * from audit_log where ${where} order by ts desc limit 200`, params);
  }



export async function listStaff() {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  return db.query<Staff>(`select username, role, name, shift, status from staff order by username`);
}



export async function saveStaff(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const username = data.username.trim().toLowerCase();
    if (!username || !data.name?.trim()) throw new Error("Username dan nama wajib diisi.");
    const role: Role = data.role === "Owner" || data.role === "Admin" ? data.role : "Kasir";
    const db = await sql();
    const existing = await db.query(`select username from staff where username = $1`, [username]);
    if (existing.length) {
      if (data.password) {
        await db.query(
          `update staff set name=$2, role=$3, shift=$4, status=$5, password_hash=$6 where username=$1`,
          [username, data.name.trim(), role, data.shift ?? "", data.status === "Nonaktif" ? "Nonaktif" : "Aktif", hashPassword(data.password)],
        );
      } else {
        await db.query(`update staff set name=$2, role=$3, shift=$4, status=$5 where username=$1`, [
          username,
          data.name.trim(),
          role,
          data.shift ?? "",
          data.status === "Nonaktif" ? "Nonaktif" : "Aktif",
        ]);
      }
    } else {
      if (!data.password) throw new Error("Password wajib untuk akun baru.");
      await db.query(
        `insert into staff (username, password_hash, role, name, shift, status) values ($1,$2,$3,$4,$5,$6)`,
        [username, hashPassword(data.password), role, data.name.trim(), data.shift ?? "", "Aktif"],
      );
    }
    await audit(me, `Simpan akun ${username}`);
    return { ok: true };
  }



export async function changeOwnPassword(data: any) {
    const me = await requireStaff();
    if (!data.next || data.next.length < 4) throw new Error("Password baru minimal 4 karakter.");
    const db = await sql();
    const [row] = await db.query<{ password_hash: string }>(
      `select password_hash from staff where username = $1`,
      [me.username],
    );
    if (!row || !verifyPassword(data.current, row.password_hash)) throw new Error("Password sekarang salah.");
    await db.query(`update staff set password_hash = $2 where username = $1`, [me.username, hashPassword(data.next)]);
    return { ok: true };
  }

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportProducts() {
  await requireStaff();
  const db = await sql();
  const rows = await db.query<{
    kode: string;
    part_number: string;
    nama: string;
    kategori: string;
    merek: string;
    stok: number;
    harga_jual: number;
    kode_pajak: string;
  }>(
    `select kode, part_number, nama, kategori, merek, stok::int as stok, harga_jual::bigint as harga_jual, kode_pajak
     from products order by nama`,
  );
  const lines = ["KODE SPAREPART,NAMA SPAREPART,JENIS BARANG,STOK,HARGA,KODE PAJAK,MEREK,KODE BARCODE"];
  for (const row of rows) {
    lines.push([row.part_number, row.nama, row.kategori, row.stok, row.harga_jual, row.kode_pajak, row.merek, row.kode].map(csvCell).join(","));
  }
  return lines.join("\n");
}


