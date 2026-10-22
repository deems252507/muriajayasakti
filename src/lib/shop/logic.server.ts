import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { packFromName } from "@/lib/shop/format";
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

function cleanPhoto(value: unknown) {
  const photo = String(value ?? "");
  if (!photo) return "";
  if (!/^data:image\/(jpeg|png);base64,/.test(photo) || photo.length > 180000) {
    throw new Error("Foto harus gambar kecil. Pilih ulang fotonya.");
  }
  return photo;
}

const defaultPasswords: Record<string, string> = {
  owner: "owner123",
  admin: "admin123",
  pagi: "pagi123",
  siang: "siang123",
};

function stillDefault(username: string, hash: string) {
  const password = defaultPasswords[username];
  return Boolean(password && verifyPassword(password, hash));
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
    `select s.username, s.role, s.name, s.shift, s.status, s.photo, s.password_hash
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
    photo: String(row.photo ?? ""),
    mustChange: stillDefault(row.username, String(row.password_hash ?? "")),
  };
}

async function requireStaff() {
  const me = await readStaff();
  if (!me) throw new Error("Sesi habis. Masuk lagi.");
  return me;
}

function assertAdmin(me: Staff) {
  if (me.role !== "Admin") throw new Error("Hanya Admin yang dapat mengubah data ini. Owner hanya melihat laporan.");
}

function assertNotOwner(me: Staff) {
  if (me.role === "Owner") throw new Error("Owner hanya dapat melihat laporan, tidak dapat menyimpan atau menghapus.");
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
      `select username, password_hash, role, name, shift, status, photo from staff where lower(username) = lower($1)`,
      [data.username],
    );
    const row = rows[0];
    if (!row || !verifyPassword(data.password, String(row.password_hash))) {
      throw new Error("Username atau password salah.");
    }
    if (row.status !== "Aktif") {
      throw new Error("Akun ini nonaktif. Hubungi admin.");
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
    await db.query(`insert into audit_log (username, name, action) values ($1, $2, $3)`, [
      row.username,
      row.name,
      `${row.role} masuk`,
    ]);
    const me: Staff = {
      username: row.username,
      role: row.role,
      name: row.name,
      shift: row.shift,
      status: row.status,
      photo: String(row.photo ?? ""),
      mustChange: stillDefault(row.username, String(row.password_hash ?? "")),
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
  const witaNow = `(now() at time zone 'UTC') + interval '8 hours'`;
  const todayStart = `(((${witaNow})::date::timestamp - interval '8 hours') at time zone 'UTC')`;
  const tomorrowStart = `(((${witaNow})::date::timestamp + interval '1 day' - interval '8 hours') at time zone 'UTC')`;
  const weekStart = `(((${witaNow})::date::timestamp - interval '6 days' - interval '8 hours') at time zone 'UTC')`;
  const monthStart = `((date_trunc('month', ${witaNow}) - interval '8 hours') at time zone 'UTC')`;
  const nextMonth = `((date_trunc('month', ${witaNow}) + interval '1 month' - interval '8 hours') at time zone 'UTC')`;
  const since30 = `(((${witaNow})::date::timestamp - interval '30 days' - interval '8 hours') at time zone 'UTC')`;

  const [statsRows, todayRows, monthRows, weekRows, lowRows, shiftRows, cashRows, top, recentIn, monthInRows] = await Promise.all([
    db.query<{
      products: number;
      stock_pcs: number;
      stock_value: number | string;
      habis: number;
      kritis: number;
    }>(
      `select
         count(*)::int as products,
         coalesce(sum(stok), 0)::bigint as stock_pcs,
         coalesce(sum(stok::numeric * harga_beli::numeric), 0) as stock_value,
         count(*) filter (where stok <= 0)::int as habis,
         count(*) filter (where stok > 0 and stok_min > 0 and stok <= stok_min)::int as kritis
       from products`,
    ),
    db.query<{ sales: number; tunai: number; transfer: number; bon: number; masuk: number; trx: number }>(
      `select
         coalesce(sum(case when source = 'Kasir' then total else 0 end), 0)::bigint as sales,
         coalesce(sum(case when source = 'Kasir' and status_bayar = 'Lunas' and metode_bayar = 'Tunai' then total else 0 end), 0)::bigint as tunai,
         coalesce(sum(case
           when source = 'Kasir' and status_bayar = 'Lunas' and metode_bayar = 'Transfer' then total
           when source = 'Kasir' and status_bayar = 'Lunas' and metode_bayar = 'Split' then transfer_amount
           else 0 end), 0)::bigint as transfer,
         coalesce(sum(case when source in ('Kasir', 'Manual') and status_bayar = 'Bon' then total else 0 end), 0)::bigint as bon,
         count(*) filter (where source = 'Manual')::int as masuk,
         count(*) filter (where source = 'Kasir')::int as trx
       from invoices
       where tanggal >= ${todayStart} and tanggal < ${tomorrowStart}`,
    ),
    db.query<{ n: number; trx: number }>(
      `select coalesce(sum(total), 0)::bigint as n,
              count(*)::int as trx
       from invoices
       where source = 'Kasir'
         and tanggal >= ${monthStart}
         and tanggal < ${nextMonth}`,
    ),
    db.query<{ d: string; n: number }>(
      `with days as (
         select generate_series(
           (${witaNow})::date - 6,
           (${witaNow})::date,
           interval '1 day'
         )::date as d
       ),
       agg as (
         select ((i.tanggal at time zone 'UTC') + interval '8 hours')::date as d,
                sum(i.total)::bigint as n
         from invoices i
         where i.source = 'Kasir'
           and i.tanggal >= ${weekStart}
           and i.tanggal < ${tomorrowStart}
         group by 1
       )
       select to_char(days.d, 'YYYY-MM-DD') as d,
              coalesce(agg.n, 0)::bigint as n
       from days
       left join agg on agg.d = days.d
       order by days.d`,
    ),
    db.query(
      `select * from products
       where stok <= 0 or (stok_min > 0 and stok <= stok_min)
       order by stok asc, nama asc
       limit 6`,
    ),
    db.query(
      me.role === "Kasir"
        ? `select * from shifts where status = 'AKTIF' and username = $1 order by start_time desc limit 1`
        : `select * from shifts where status = 'AKTIF' order by start_time desc limit 1`,
      me.role === "Kasir" ? [me.username] : [],
    ),
    db.query<{ masuk: number; keluar: number }>(
      `select
         coalesce(sum(case when jenis = 'MASUK' then jumlah else 0 end), 0)::bigint as masuk,
         coalesce(sum(case when jenis = 'KELUAR' then jumlah else 0 end), 0)::bigint as keluar
       from cash_moves
       where tanggal >= ${todayStart} and tanggal < ${tomorrowStart}`,
    ),
    db.query<{ nama: string; satuan: string; qty: number; total: number }>(
      `select coalesce(p.nama, l.custom_item, 'Barang') as nama,
              l.satuan,
              sum(l.jumlah)::bigint as qty,
              sum(l.jumlah::numeric * l.harga_satuan::numeric) as total
       from invoices i
       join invoice_lines l on l.invoice_id = i.id and l.jenis = 'KELUAR'
       left join products p on p.id = l.product_id
       where i.source = 'Kasir'
         and i.tanggal >= ${since30}
       group by 1, 2
       order by sum(l.jumlah::numeric * l.harga_satuan::numeric) desc
       limit 6`,
    ),
    db.query<{ nama: string; satuan: string; qty: number; tujuan: string; tanggal: string }>(
      `select coalesce(p.nama, 'Barang') as nama, l.satuan, l.jumlah::int as qty, i.tujuan, i.tanggal::text as tanggal
       from invoices i
       join invoice_lines l on l.invoice_id = i.id and l.jenis = 'MASUK'
       left join products p on p.id = l.product_id
       where i.source = 'Manual'
         and i.tanggal >= ${monthStart}
         and i.tanggal < ${nextMonth}
       order by i.tanggal desc
       limit 4`,
    ),
    db.query<{ qty: number; nilai: number | string; nota: number }>(
      `select coalesce(sum(l.jumlah_dasar), 0)::bigint as qty,
              coalesce(sum(l.jumlah_dasar::numeric * coalesce(p.harga_beli, 0)), 0) as nilai,
              count(distinct i.id)::int as nota
       from invoices i
       join invoice_lines l on l.invoice_id = i.id and l.jenis = 'MASUK'
       left join products p on p.id = l.product_id
       where i.source = 'Manual'
         and i.tanggal >= ${monthStart}
         and i.tanggal < ${nextMonth}`,
    ),
  ]);

  const stats = statsRows[0];
  const today = todayRows[0];
  const month = monthRows[0];
  const cashToday = cashRows[0];
  const monthIn = monthInRows[0];
  const shift = shiftRows[0] ? mapShift(shiftRows[0] as Record<string, unknown>) : null;
  let drawer: number | null = null;
  if (shift) {
    const [d] = await db.query<{ n: number }>(`select shift_drawer($1)::bigint as n`, [shift.id]);
    drawer = Number(d?.n ?? 0);
  }
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
        exact: rows.length > 0,
        items: rows.map((row) => mapProduct(row as Record<string, unknown>)),
      };
    }
    if (data.q.length < 1) return { unit: null, exact: false, items: [] as Product[] };
    const like = `%${data.q}%`;
    const rows = await db.query(
      `select * from products
       where nama ilike $1 or part_number ilike $1 or part_numbers_alt ilike $1
          or kode ilike $1 or merek ilike $1 or kode_pajak ilike $1 or kategori ilike $1
       order by
         case when lower(part_number) = lower($2) or lower(kode) = lower($2) or lower(kode_pajak) = lower($2) then 0 else 1 end,
         nama
       limit $3`,
      [like, data.q, data.limit],
    );
    const items = rows.map((row) => mapProduct(row as Record<string, unknown>));
    const needle = String(data.q).trim().toLowerCase();
    // Hanya kode barang / part number (bukan kode pajak) yang dianggap hasil scan barcode.
    const exact = needle.length >= 5 && items.some((item) => [item.kode, item.partNumber].some((value) => value.toLowerCase() === needle));
    return { unit: null, exact, items };
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
    // Filter part number: cocok sebagian pada part number utama atau part number alternatif,
    // tanpa peduli huruf besar/kecil, spasi, strip, atau tanda baca (9004B-82002 = 9004B82002).
    const partFilter = String(data.partNumber ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (partFilter) {
      params.push(`%${partFilter}%`);
      where.push(
        `(regexp_replace(lower(part_number), '[^a-z0-9]', '', 'g') like $${params.length} or regexp_replace(lower(part_numbers_alt), '[^a-z0-9]', '', 'g') like $${params.length})`,
      );
    }
    // Hanya barang kembar: part number sama (abaikan strip/spasi/huruf besar) DAN merek sama.
    if (data.dupOnly) {
      where.push(
        `id in (
           select id from (
             select id, count(*) over (
               partition by regexp_replace(lower(part_number), '[^a-z0-9]', '', 'g'), lower(btrim(merek))
             ) as c
             from products
             where regexp_replace(lower(part_number), '[^a-z0-9]', '', 'g') <> ''
           ) dup where c > 1
         )`,
      );
    }
    const categories = Array.isArray(data.kategori) ? data.kategori.map((v: unknown) => String(v).trim().toLowerCase()).filter(Boolean) : (data.kategori ? [String(data.kategori).trim().toLowerCase()] : []);
    if (categories.length) {
      params.push(categories);
      where.push(`lower(btrim(kategori)) = any($${params.length}::text[])`);
    }
    if (data.status === "Habis") where.push(`stok <= 0`);
    if (data.status === "Menipis") where.push(`stok > 0 and stok_min > 0 and stok <= stok_min`);
    if (data.status === "Aman") where.push(`not (stok <= 0 or (stok_min > 0 and stok <= stok_min))`);
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    // Saat filter part number aktif dan urutan masih bawaan, kelompokkan per part number lalu merek
    // supaya barang dengan part number sama berdekatan (mudah cek duplikat).
    const partGrouped = Boolean(data.dupOnly) || data.sort === "part" || (Boolean(partFilter) && (!data.sort || data.sort === "nama"));
    const order =
      partGrouped
        ? "regexp_replace(lower(part_number), '[^a-z0-9]', '', 'g') asc, lower(merek) asc, lower(nama) asc"
        : data.sort === "stok_asc"
        ? "stok asc, lower(kategori) asc, lower(nama) asc"
        : data.sort === "stok_desc"
          ? "stok desc, lower(kategori) asc, lower(nama) asc"
          : data.sort === "nama_desc"
            ? "lower(kategori) asc, lower(nama) desc"
            : data.sort === "nama"
              ? "lower(kategori) asc, lower(nama) asc"
              : "lower(kategori) asc, lower(nama) asc";
    const [countRow] = await db.query<{ n: number }>(
      `select count(*)::int as n from products ${clause}`,
      params,
    );
    const perPage = data.all ? 100000 : 15;
    const offset = (data.page - 1) * perPage;
    const rows = await db.query(
      `select * from products ${clause} order by ${order}, lower(part_number) asc limit ${perPage} offset ${offset}`,
      params,
    );
    const cats = await db.query<{ kategori: string }>(
      `select kategori from (
         select distinct btrim(kategori) as kategori
         from products
         where btrim(kategori) <> ''
       ) cats
       order by lower(kategori)`,
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
    const satuanAlt = String(data.satuanAlt ?? "").trim();
    const isiSatuanAlt = satuanAlt ? Math.max(0, Math.floor(Number(data.isiSatuanAlt) || 0)) : 0;
    if (satuanAlt && isiSatuanAlt <= 0) throw new Error("Isi jumlah pcs di dalam 1 dus.");
    const hargaJualAlt = satuanAlt ? Number(data.hargaJualAlt) || 0 : 0;
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
          satuanAlt,
          isiSatuanAlt,
          hargaJualAlt,
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
        satuanAlt,
        isiSatuanAlt,
        hargaJualAlt,
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
  // Kode pajak HANYA angka (mis. "162236/NAMA BARANG" atau "NAMA BARANG /162236").
  // Huruf setelah/sebelum garis miring (C/M, /S, dst.) bukan pajak dan tetap jadi bagian nama.
  const front = nama.match(/^(\d{1,24})\s*\/\s*(.+)$/);
  const back = nama.match(/^(.+?)\s+\/\s*(\d{4,24})$/);
  if (front) {
    kodePajak = front[1];
    nama = front[2].trim();
  } else if (back) {
    kodePajak = back[2];
    nama = back[1].trim();
  }
  const dash = nama.lastIndexOf(" - ");
  if (dash > 0) {
    const left = nama.slice(0, dash).trim();
    const right = nama.slice(dash + 3).trim();
    // Merek tidak mengandung angka. "... - N120 12V 120AH" adalah spesifikasi, bukan merek.
    if (left && right && right.length <= 48 && !/\d/.test(right)) {
      nama = left;
      merek = right;
    }
  }
  // Kurung berisi satu kode tanpa spasi = part number alt, dipindah dari nama:
  // yang mengandung angka ((T2310), (YLCMT-005), (STM-0525-001)) atau satu huruf ((Y), (U)).
  // Kurung berisi kata/kalimat biasa seperti (KIRI) atau (DEPAN KIRI) tetap di nama.
  const alts: string[] = [];
  nama = nama.replace(/\(\s*([A-Za-z0-9.\-]+)\s*\)/g, (all, code: string) => {
    if (!/\d/.test(code) && !/^[A-Za-z]$/.test(code)) return all;
    alts.push(code);
    return " ";
  }).replace(/\s{2,}/g, " ").trim();
  return { nama, merek, kodePajak, partNumbersAlt: alts.join(", ") };
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
      const kodeKolom = (row["KODE PAJAK"] || "").replace(/\s/g, "");
      const kodePajak = /^\d+$/.test(kodeKolom) ? kodeKolom : parsed.kodePajak; // huruf bukan kode pajak
      const merek = row["MEREK"] || parsed.merek;
      const partNumbersAlt = row["PN ALT"] || row["PART NUMBER ALT"] || row["PART NUMBER LAIN"] || parsed.partNumbersAlt;
      const nama = parsed.nama;
      if (!partNumber && !nama) continue;
      const status = kodePajak || (row["STATUS PAJAK"] || "").toLowerCase() === "pajak" ? "Pajak" : "Non Pajak";
      const harga = moneyId(row["HARGA"] || row["HARGA JUAL"] || "0");
      const pack = packFromName(nama);
      const satuanAlt = row["SATUAN ALT"] || row["SATUAN KONVERSI"] || (pack ? "Dus" : "");
      const isiAlt = Number(String(row["ISI ALT"] || row["ISI SATUAN ALT"] || "0").replace(/\D/g, "")) || pack?.pcs || 0;
      const hargaDus = row["HARGA JUAL ALT"] || row["HARGA DUS"] || "";
      rows.push({
        partNumber,
        nama,
        kategori: row["JENIS BARANG"] || row["JENIS"] || row["KATEGORI"] || "Umum",
        merek,
        stok: Number(String(row["STOK"] ?? row["STOK AWAL"] ?? "0").replace(/[^\d-]/g, "")) || 0,
        harga,
        hargaBeli: moneyId(row["HARGA BELI"] || "0"),
        satuan: row["SATUAN"] || "Pcs",
        satuanAlt,
        isiAlt,
        hargaAlt: hargaDus ? moneyId(hargaDus) : 0, // harga dus hanya dari kolom HARGA DUS, tidak dihitung otomatis
        status,
        kodePajak,
        partNumbersAlt,
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
    if (!data.nama?.trim()) throw new Error("Nama wajib diisi.");
    const tipe = data.tipe === "Supplier" ? "Supplier" : "Pelanggan";
    const creatingCustomer = !data.id && tipe === "Pelanggan";
    if (!creatingCustomer) assertAdmin(me);
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
  const [profile] = await db.query<{ nama: string; alamat: string; telepon: string; tagline: string; logo: string }>(
    `select nama, alamat, telepon, coalesce(tagline, 'INTEGRATED BUSINESS SYSTEM') as tagline, coalesce(logo, '') as logo from shop_profile where id = 1`,
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
    profile: profile ?? { nama: "MURIA JAYA SAKTI", alamat: "Jl. Raja Alam RT.13 No.22", telepon: "0852-4717-7445", tagline: "INTEGRATED BUSINESS SYSTEM", logo: "" },
  };
}

export async function saveShopProfile(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const nama = String(data.nama ?? "").trim();
  if (!nama) throw new Error("Nama toko wajib diisi.");
  const logo = String(data.logo ?? "");
  if (logo.length > 500000) throw new Error("Logo terlalu besar. Pilih gambar yang lebih kecil.");
  const db = await sql();
  await db.query(
    `insert into shop_profile (id, nama, alamat, telepon, tagline, logo)
     values (1, $1, $2, $3, $4, $5)
     on conflict (id) do update set nama = excluded.nama, alamat = excluded.alamat, telepon = excluded.telepon, tagline = excluded.tagline, logo = excluded.logo`,
    [nama, String(data.alamat ?? "").trim(), String(data.telepon ?? "").trim(), String(data.tagline ?? "").trim() || "INTEGRATED BUSINESS SYSTEM", logo],
  );
  await audit(me, `Ubah profil toko ${nama}`);
  return { ok: true, nama, alamat: String(data.alamat ?? "").trim(), telepon: String(data.telepon ?? "").trim(), tagline: String(data.tagline ?? "").trim() || "INTEGRATED BUSINESS SYSTEM", logo };
}

export async function publicShop() {
  const db = await sql();
  const [profile] = await db.query<{ nama: string; alamat: string; telepon: string; tagline: string; logo: string }>(
    `select nama, alamat, telepon, coalesce(tagline, 'INTEGRATED BUSINESS SYSTEM') as tagline, coalesce(logo, '') as logo from shop_profile where id = 1`,
  );
  return profile ?? { nama: "MURIA JAYA SAKTI", alamat: "Jl. Raja Alam RT.13 No.22", telepon: "0852-4717-7445", tagline: "INTEGRATED BUSINESS SYSTEM", logo: "" };
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
      ? `select * from shifts where status = 'AKTIF' and (username = $1 or shift = (select shift from staff where username = $1)) order by start_time desc limit 5`
      : `select * from shifts order by start_time desc limit 80`,
    me.role === "Kasir" ? [me.username] : [],
  );
  const shifts = rows.map((row) => mapShift(row as Record<string, unknown>));
  const drawers: Record<string, number> = {};
  for (const shift of shifts) {
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
    const [current] = await db.query<{ status: string }>(`select status from shifts where id = $1`, [data.id]);
    if (!current) throw new Error("Shift tidak ditemukan.");
    if (current.status !== "AKTIF") throw new Error("Shift ini sudah selesai.");
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



export async function deleteClosedShift(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  const rows = await db.query<{ id: string; status: string }>(`select id, status from shifts where id = $1`, [data.id]);
  const shift = rows[0];
  if (!shift) throw new Error("Shift tidak ditemukan.");
  if (shift.status === "AKTIF") throw new Error("Shift masih aktif. Tutup dulu, baru bisa dihapus.");

  // Hapus semua transaksi kas (masuk & keluar) milik shift ini
  // supaya tidak nyangkut di Laporan Kas Harian
  await db.query(`delete from cash_moves where shift_id = $1`, [data.id]);

  // Baru hapus arsip shift
  await db.query(`delete from shifts where id = $1`, [data.id]);

  await audit(me, `Hapus arsip shift ${data.id} beserta kas masuk/keluarnya`);
  return { ok: true };
}



export async function addCashMove(data: any) {
    const me = await requireStaff();
    assertNotOwner(me);
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
    const [move] = await db.query<{ jenis: string; jumlah: number; keterangan: string }>(`select jenis, jumlah, keterangan from cash_moves where id = $1`, [data.id]);
    if (!move) throw new Error("Transaksi kas tidak ditemukan.");
    await db.query(`delete from cash_moves where id = $1`, [data.id]);
    await audit(me, `Hapus kas ${move.jenis} Rp ${Number(move.jumlah).toLocaleString("id-ID")} · ${move.keterangan}`);
    return { ok: true };
  }



export async function checkout(data: any): Promise<any> {
    const me = await requireStaff();
    assertNotOwner(me);
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
    assertNotOwner(me);
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



export async function editSale(data: any): Promise<any> {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  try {
    const [row] = await db.query<{ shop_edit_sale: unknown }>(`select shop_edit_sale($1::jsonb) as shop_edit_sale`, [
      JSON.stringify(data),
    ]);
    await audit(me, `Ubah nota ${String(data.nomor ?? "")}`);
    return row?.shop_edit_sale;
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



export async function editManualBon(data: any): Promise<any> {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  try {
    const [row] = await db.query<{ shop_edit_manual_bon: unknown }>(`select shop_edit_manual_bon($1::jsonb) as shop_edit_manual_bon`, [
      JSON.stringify(data),
    ]);
    await audit(me, `Edit bon manual ${String(data.nomor ?? "")}`);
    return row?.shop_edit_manual_bon;
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function editManual(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  try {
    await db.query(`select shop_edit_manual($1::jsonb) as shop_edit_manual`, [
      JSON.stringify({
        nomor: data.nomor,
        tujuan: data.tujuan ?? "",
        keterangan: data.keterangan ?? "",
        lines: (data.lines ?? []).map((line: any) => ({
          id: line.id,
          qty: line.qty,
          jenis: line.jenis,
          ...(line.harga === undefined ? {} : { harga: line.harga }),
          productId: line.productId || null,
          isAlt: Boolean(line.isAlt),
        })),
        add: data.add ?? [],
      }),
    ]);
    await audit(me, `Ubah nota manual ${data.nomor}`);
    return { ok: true, nomor: String(data.nomor) };
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function deleteRetur(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  try {
    await db.query(`select shop_delete_retur($1)`, [String(data.id ?? "")]);
    await audit(me, `Hapus retur ${data.id}`);
    return { ok: true };
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



export async function findRetur(data: any) {
  await requireStaff();
  const db = await sql();
  const [inv] = await db.query<{ parent_invoice: string; retur_id: string; total: string; nomor: string; source: string }>(
    `select nomor, source, parent_invoice, coalesce(retur_id, '') as retur_id, total::text as total from invoices where nomor = $1`,
    [String(data.nomor ?? "")],
  );
  if (!inv) return null;
  const parent = inv.source === "Retur" ? inv.parent_invoice : inv.nomor;
  const [row] = await db.query<Record<string, unknown>>(
    `select * from returs
     where ($1 <> '' and id = $1)
        or parent_invoice = $2
     order by case when id = $1 then 0 else 1 end,
              case when exchange_value = $3::bigint then 0 else 1 end,
              tanggal desc
     limit 1`,
    [inv.retur_id || "", parent, inv.total || 0],
  );
  if (!row) return null;
  return {
    id: String(row.id ?? ""),
    parent_invoice: String(row.parent_invoice ?? ""),
    tanggal: row.tanggal ? new Date(String(row.tanggal)).toISOString() : "",
    kasir: String(row.kasir ?? ""),
    pelanggan: String(row.pelanggan ?? ""),
    items: row.items ?? [],
    exchange_items: row.exchange_items ?? [],
    metode_bayar: String(row.metode_bayar ?? ""),
    bank_transfer: String(row.bank_transfer ?? ""),
    retur_value: Number(row.retur_value ?? 0),
    exchange_value: Number(row.exchange_value ?? 0),
    net_amount: Number(row.net_amount ?? 0),
    payment_direction: String(row.payment_direction ?? ""),
    cash_amount: Number(row.cash_amount ?? 0),
    transfer_amount: Number(row.transfer_amount ?? 0),
  };
}

export async function getInvoice(data: any): Promise<any> {
    await requireStaff();
    const db = await sql();
    const [inv] = await db.query(`select * from invoices where lower(nomor) = lower($1)`, [data.nomor]);
    if (!inv) return null;
    const lines = await db.query(
      `select l.*, p.nama as product_nama, p.kode,
              p.part_number as product_part, p.part_numbers_alt as product_alt, p.merek as product_merek,
              p.kode_pajak, p.kategori,
              p.satuan as product_satuan, p.satuan_alt as product_satuan_alt, p.isi_satuan_alt as product_isi_alt,
              p.harga_jual as product_harga_jual, p.harga_jual_alt as product_harga_jual_alt, p.stok as product_stok
       from invoice_lines l
       left join products p on p.id = l.product_id
       where l.invoice_id = $1
       order by l.id`,
      [(inv as { id: number }).id],
    );
    return { invoice: inv, lines };
  }



export async function createSupplierReceipt(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  const invoiceNo = String(data.invoiceNo ?? '').trim();
  const supplierId = Number(data.supplierId);
  const receivedAt = String(data.receivedAt ?? '').trim();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!invoiceNo) throw new Error('Nomor invoice barang masuk wajib diisi.');
  if (!Number.isInteger(supplierId) || supplierId <= 0) throw new Error('Pemasok wajib dipilih.');
  if (!items.length) throw new Error('Minimal satu barang harus dimasukkan.');
  try {
    const [row] = await db.query<{ shop_receive_supplier: unknown }>(
      `select shop_receive_supplier($1::jsonb) as shop_receive_supplier`,
      [JSON.stringify({
        invoiceNo,
        supplierId,
        receivedAt: receivedAt ? `${receivedAt}T12:00:00+08:00` : '',
        notes: String(data.notes ?? '').trim(),
        createdBy: me.name,
        items: items.map((item: any) => ({
          productId: Number(item.productId),
          qty: Number(item.qty),
          satuan: String(item.satuan ?? 'Pcs'),
          hargaBeli: Number(item.hargaBeli ?? 0),
        })),
      })],
    );
    const result = row?.shop_receive_supplier as { id?: number; invoiceNo?: string };
    await audit(me, `Barang masuk pemasok ${result?.invoiceNo ?? invoiceNo}`);
    return { ok: true, id: Number(result?.id ?? 0), invoiceNo: String(result?.invoiceNo ?? invoiceNo) };
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function updateSupplierReceipt(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  const id = Number(data.id);
  const invoiceNo = String(data.invoiceNo ?? '').trim();
  const supplierId = Number(data.supplierId);
  const receivedAt = String(data.receivedAt ?? '').trim();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!Number.isInteger(id) || id <= 0) throw new Error('Penerimaan tidak ditemukan.');
  if (!invoiceNo) throw new Error('Nomor invoice barang masuk wajib diisi.');
  if (!Number.isInteger(supplierId) || supplierId <= 0) throw new Error('Pemasok wajib dipilih.');
  if (!items.length) throw new Error('Minimal satu barang harus dimasukkan.');
  try {
    const [row] = await db.query<{ shop_update_supplier_receipt: unknown }>(
      `select shop_update_supplier_receipt($1::jsonb) as shop_update_supplier_receipt`,
      [JSON.stringify({
        id,
        invoiceNo,
        supplierId,
        receivedAt: receivedAt ? `${receivedAt}T12:00:00+08:00` : '',
        notes: String(data.notes ?? '').trim(),
        items: items.map((item: any) => ({
          productId: Number(item.productId),
          qty: Number(item.qty),
          satuan: String(item.satuan ?? 'Pcs'),
          hargaBeli: Number(item.hargaBeli ?? 0),
        })),
      })],
    );
    const result = row?.shop_update_supplier_receipt as { invoiceNo?: string };
    await audit(me, `Ubah barang masuk pemasok ${result?.invoiceNo ?? invoiceNo}`);
    return { ok: true, id, invoiceNo: String(result?.invoiceNo ?? invoiceNo) };
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function deleteSupplierReceipt(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  const id = Number(data.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Penerimaan tidak ditemukan.');
  try {
    const [row] = await db.query<{ shop_delete_supplier_receipt: unknown }>(
      `select shop_delete_supplier_receipt($1::bigint) as shop_delete_supplier_receipt`,
      [id],
    );
    const result = row?.shop_delete_supplier_receipt as { invoiceNo?: string };
    await audit(me, `Hapus barang masuk pemasok ${result?.invoiceNo ?? id}`);
    return { ok: true, id };
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function listSupplierReceipts(data: any) {
  await requireStaff();
  const db = await sql();
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (data.supplierId) {
    params.push(Number(data.supplierId));
    where.push(`r.supplier_id = $${params.length}`);
  }
  if (data.start) {
    params.push(String(data.start));
    where.push(`r.received_at >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.end) {
    params.push(String(data.end));
    where.push(`r.received_at < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.q) {
    params.push(`%${String(data.q).trim()}%`);
    where.push(`(r.invoice_no ilike $${params.length} or p.nama ilike $${params.length} or exists (select 1 from supplier_receipt_lines lq join products pq on pq.id = lq.product_id where lq.receipt_id = r.id and (pq.nama ilike $${params.length} or pq.part_number ilike $${params.length})))`);
  }
  const clause = where.join(' and ');
  const perPage = data.all ? 100000 : 15;
  const page = Math.max(1, Number(data.page ?? 1) || 1);
  const [countRow] = await db.query<{ n: number }>(`select count(*)::int as n from supplier_receipts r join partners p on p.id = r.supplier_id where ${clause}`, params);
  const rows = await db.query<Record<string, unknown>>(
    `select r.id, r.invoice_no, r.received_at, r.notes, r.created_by, p.id as supplier_id, p.nama as supplier_name,
      coalesce((select sum(l.qty_dasar) from supplier_receipt_lines l where l.receipt_id = r.id), 0) as total_qty,
      coalesce((select sum(l.harga_beli * l.qty) from supplier_receipt_lines l where l.receipt_id = r.id), 0) as total_value,
      coalesce((select json_agg(json_build_object(
        'productId', l.product_id, 'nama', pr.nama, 'partNumber', pr.part_number, 'kategori', pr.kategori,
        'qty', l.qty, 'satuan', l.satuan, 'qtyDasar', l.qty_dasar, 'hargaBeli', l.harga_beli
      ) order by lower(pr.nama)) from supplier_receipt_lines l join products pr on pr.id = l.product_id where l.receipt_id = r.id), '[]'::json) as items
     from supplier_receipts r join partners p on p.id = r.supplier_id
     where ${clause}
     order by r.received_at desc, lower(p.nama) asc, lower(r.invoice_no) asc
     limit ${perPage} offset ${(page - 1) * perPage}`, params);
  return {
    total: Number(countRow?.n ?? 0),
    page,
    perPage,
    items: rows.map((row) => ({
      id: Number(row.id), invoiceNo: String(row.invoice_no), receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : '',
      supplierId: Number(row.supplier_id), supplierName: String(row.supplier_name ?? ''), notes: String(row.notes ?? ''), createdBy: String(row.created_by ?? ''),
      totalQty: Number(row.total_qty ?? 0), totalValue: Number(row.total_value ?? 0), items: Array.isArray(row.items) ? row.items : [],
    })),
  };
}


/** Pencarian per kata: tiap kata harus ketemu di salah satu kolom; spasi/strip pada part number diabaikan. */
function tokenClauses(q: string, params: unknown[], build: (m: (hay: string) => string) => string): string[] {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  return tokens.map((tok) => {
    params.push(`%${tok.replace(/[\\%_]/g, "\\$&")}%`);
    const a = params.length;
    const norm = tok.replace(/[^a-z0-9]/g, "");
    let b = 0;
    if (norm.length >= 3) {
      params.push(`%${norm}%`);
      b = params.length;
    }
    const m = (hay: string) => (b ? `(${hay} like $${a} or regexp_replace(${hay}, '[^a-z0-9]', '', 'g') like $${b})` : `${hay} like $${a}`);
    return build(m);
  });
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
      where.push(...tokenClauses(String(data.q), params, (m) =>
        `(${m(`lower(concat_ws(' ', nomor, tujuan, kasir, keterangan))`)} or exists (select 1 from invoice_lines lq left join products pq on pq.id = lq.product_id where lq.invoice_id = invoices.id and ${m(`lower(concat_ws(' ', pq.nama, pq.part_number, pq.part_numbers_alt, pq.merek, pq.kode_pajak, lq.custom_item, lq.merek, lq.part_numbers_alt))`)}))`));
    }
    if (data.tujuan) {
      params.push(String(data.tujuan).trim().toLowerCase());
      where.push(`lower(tujuan) = $${params.length}`);
    }
    if (data.jenis === "MASUK" || data.jenis === "KELUAR") {
      params.push(data.jenis);
      where.push(`exists (select 1 from invoice_lines l where l.invoice_id = invoices.id and l.jenis = $${params.length})`);
    }
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    const [countRow] = await db.query<{ n: number }>(`select count(*)::int as n from invoices ${clause}`, params);
    const perPage = data.all ? 100000 : 12;
    const rows = await db.query(
      `select * from invoices ${clause} order by tanggal desc, id desc limit ${perPage} offset ${(data.page - 1) * perPage}`,
      params,
    );
    return { total: Number(countRow?.n ?? 0), page: data.page, perPage, items: rows };
  }



export async function listHistoryLines(data: any) {
  await requireStaff();
  const db = await sql();
  const where = ["true"];
  const params: unknown[] = [];
  if (data.q) {
    where.push(...tokenClauses(String(data.q), params, (m) =>
      m(`lower(concat_ws(' ', i.nomor, i.tujuan, i.kasir, i.keterangan, p.nama, p.part_number, p.part_numbers_alt, p.merek, p.kode_pajak, l.custom_item, l.merek, l.part_numbers_alt))`)));
  }
  if (data.tujuan) {
    params.push(String(data.tujuan).trim().toLowerCase());
    where.push(`lower(i.tujuan) = $${params.length}`);
  }
  if (data.source) {
    params.push(data.source);
    where.push(`i.source = $${params.length}`);
  }
  if (data.status) {
    params.push(data.status);
    where.push(`i.status_bayar = $${params.length}`);
  }
  if (data.jenis === "MASUK" || data.jenis === "KELUAR") {
    params.push(data.jenis);
    where.push(`l.jenis = $${params.length}`);
  }
  if (data.start) {
    params.push(data.start);
    where.push(`i.tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.end) {
    params.push(data.end);
    where.push(`i.tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
  }
  const rows = await db.query<Record<string, unknown>>(
    `select i.tanggal, i.nomor, i.source, i.metode_bayar, i.status_bayar, l.jenis, l.jumlah, l.satuan, l.harga_satuan,
            coalesce(nullif(l.custom_item, ''), p.nama, 'Barang') as nama,
            coalesce(p.part_number, '') as part_number,
            coalesce(p.kode_pajak, '') as kode_pajak
     from invoice_lines l
     join invoices i on i.id = l.invoice_id
     left join products p on p.id = l.product_id
     where ${where.join(" and ")}
     order by i.tanggal desc, l.id
     limit 5000`,
    params,
  );
  return rows.map((row) => ({
    tanggal: row.tanggal ? new Date(String(row.tanggal)).toISOString() : "",
    nomor: String(row.nomor ?? ""),
    source: String(row.source ?? ""),
    metode_bayar: String(row.metode_bayar ?? ""),
    status_bayar: String(row.status_bayar ?? ""),
    jenis: String(row.jenis ?? ""),
    jumlah: Number(row.jumlah ?? 0),
    satuan: String(row.satuan ?? ""),
    harga_satuan: Number(row.harga_satuan ?? 0),
    nama: String(row.nama ?? ""),
    part_number: String(row.part_number ?? ""),
    kode_pajak: String(row.kode_pajak ?? ""),
  }));
}

export async function listHistoryItems(data: any) {
  await requireStaff();
  const db = await sql();
  const where: string[] = ["true"];
  const params: unknown[] = [];
  if (data.q) {
    where.push(...tokenClauses(String(data.q), params, (m) =>
      m(`lower(concat_ws(' ', nomor, tujuan, kasir, keterangan, nama, part_number, pn_alt, merek, kode_pajak))`)));
  }
  if (data.source) {
    params.push(data.source);
    where.push(`source = $${params.length}`);
  }
  if (data.status) {
    params.push(data.status);
    where.push(`status_bayar = $${params.length}`);
  }
  if (data.jenis === "MASUK" || data.jenis === "KELUAR") {
    params.push(data.jenis);
    where.push(`jenis = $${params.length}`);
  }
  if (data.tujuan) {
    params.push(String(data.tujuan).trim().toLowerCase());
    where.push(`lower(tujuan) = $${params.length}`);
  }
  if (data.start) {
    params.push(data.start);
    where.push(`tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.end) {
    params.push(data.end);
    where.push(`tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
  }
  const base = `with all_lines as (
      select i.tanggal, l.id::bigint as line_id, i.id::bigint as inv_id, i.nomor::text as nomor, i.source::text as source, l.jenis::text as jenis,
             coalesce(nullif(l.custom_item, ''), p.nama, 'Barang')::text as nama,
             coalesce(p.part_number, '')::text as part_number,
             coalesce(nullif(l.part_numbers_alt, ''), p.part_numbers_alt, '')::text as pn_alt,
             coalesce(nullif(l.merek, ''), p.merek, '')::text as merek,
             coalesce(p.kode_pajak, '')::text as kode_pajak,
             l.jumlah::int as jumlah, l.satuan::text as satuan, l.harga_satuan::bigint as harga_satuan,
             i.tujuan::text as tujuan, i.kasir::text as kasir, i.keterangan::text as keterangan,
             i.status_bayar::text as status_bayar, i.metode_bayar::text as metode_bayar
      from invoice_lines l
      join invoices i on i.id = l.invoice_id
      left join products p on p.id = l.product_id
      union all
      select r.received_at, l.id::bigint, r.id::bigint, r.invoice_no::text, 'Pemasok'::text, 'MASUK'::text,
             pr.nama::text, coalesce(pr.part_number, '')::text, coalesce(pr.part_numbers_alt, '')::text,
             coalesce(pr.merek, '')::text, coalesce(pr.kode_pajak, '')::text,
             l.qty::int, l.satuan::text, l.harga_beli::bigint,
             pt.nama::text, r.created_by::text, r.notes::text, ''::text, ''::text
      from supplier_receipt_lines l
      join supplier_receipts r on r.id = l.receipt_id
      join partners pt on pt.id = r.supplier_id
      join products pr on pr.id = l.product_id
    )`;
  const clause = where.join(" and ");
  const [countRow] = await db.query<{ n: number }>(`${base} select count(*)::int as n from all_lines where ${clause}`, params);
  const perPage = data.all ? 5000 : 30;
  const page = Math.max(1, Number(data.page ?? 1) || 1);
  const offset = data.all ? 0 : (page - 1) * perPage;
  const rows = await db.query<Record<string, unknown>>(
    `${base} select * from all_lines where ${clause} order by tanggal desc, inv_id desc, line_id asc limit ${perPage} offset ${offset}`,
    params,
  );
  return {
    total: Number(countRow?.n ?? 0),
    page,
    perPage,
    items: rows.map((row) => ({
      tanggal: row.tanggal ? new Date(String(row.tanggal)).toISOString() : "",
      line_id: Number(row.line_id ?? 0),
      nomor: String(row.nomor ?? ""),
      source: String(row.source ?? ""),
      jenis: String(row.jenis ?? ""),
      nama: String(row.nama ?? ""),
      part_number: String(row.part_number ?? ""),
      pn_alt: String(row.pn_alt ?? ""),
      merek: String(row.merek ?? ""),
      kode_pajak: String(row.kode_pajak ?? ""),
      jumlah: Number(row.jumlah ?? 0),
      satuan: String(row.satuan ?? ""),
      harga_satuan: Number(row.harga_satuan ?? 0),
      tujuan: String(row.tujuan ?? ""),
      status_bayar: String(row.status_bayar ?? ""),
      metode_bayar: String(row.metode_bayar ?? ""),
    })),
  };
}

export async function listSalesNotes(data: any) {
  await requireStaff();
  const db = await sql();
  const src = data.source === "Manual" ? ["Manual"] : data.source === "Semua" ? ["Kasir", "Manual"] : ["Kasir"];
  const params: unknown[] = [src];
  const where = [`i.source = any($1::text[])`];
  if (data.start) {
    params.push(data.start);
    where.push(`i.tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.end) {
    params.push(data.end);
    where.push(`i.tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.q) {
    params.push(`%${data.q}%`);
    where.push(`(i.nomor ilike $${params.length} or i.tujuan ilike $${params.length} or i.kasir ilike $${params.length} or exists (select 1 from invoice_lines lq left join products pq on pq.id = lq.product_id where lq.invoice_id = i.id and (coalesce(nullif(lq.custom_item, ''), pq.nama, '') ilike $${params.length} or coalesce(pq.part_number, '') ilike $${params.length})))`);
  }
  const notes = await db.query<Record<string, unknown>>(
    `select i.id, i.nomor, i.tanggal, i.source, i.kasir, i.tujuan, i.metode_bayar, i.status_bayar, i.total, i.diskon
     from invoices i where ${where.join(" and ")} order by i.tanggal asc, i.id asc limit 2000`,
    params,
  );
  const ids = notes.map((n) => Number(n.id));
  const lines = ids.length
    ? await db.query<Record<string, unknown>>(
        `select l.invoice_id, l.jenis, l.jumlah, l.satuan, l.harga_satuan,
                coalesce(nullif(l.custom_item, ''), p.nama, 'Barang') as nama,
                coalesce(p.part_number, '') as part_number
         from invoice_lines l left join products p on p.id = l.product_id
         where l.invoice_id = any($1::bigint[]) order by l.id`,
        [ids],
      )
    : [];
  const byInv = new Map<number, Array<Record<string, unknown>>>();
  for (const l of lines) {
    const key = Number(l.invoice_id);
    byInv.set(key, [...(byInv.get(key) ?? []), { jenis: String(l.jenis ?? ""), jumlah: Number(l.jumlah ?? 0), satuan: String(l.satuan ?? ""), harga_satuan: Number(l.harga_satuan ?? 0), nama: String(l.nama ?? ""), part_number: String(l.part_number ?? "") }]);
  }
  return notes.map((n) => ({
    nomor: String(n.nomor ?? ""),
    tanggal: n.tanggal ? new Date(String(n.tanggal)).toISOString() : "",
    source: String(n.source ?? ""),
    kasir: String(n.kasir ?? ""),
    tujuan: String(n.tujuan ?? ""),
    metode_bayar: String(n.metode_bayar ?? ""),
    status_bayar: String(n.status_bayar ?? ""),
    total: Number(n.total ?? 0),
    diskon: Number(n.diskon ?? 0),
    lines: byInv.get(Number(n.id)) ?? [],
  }));
}

export async function listSoldItems(data: any) {
  await requireStaff();
  const db = await sql();
  const where = [`l.jenis = 'KELUAR'`];
  const params: unknown[] = [];
  const src = data.source === "Manual" ? ["Manual"] : data.source === "Semua" ? ["Kasir", "Manual"] : ["Kasir"];
  params.push(src);
  where.push(`i.source = any($${params.length}::text[])`);
  if (data.start) {
    params.push(data.start);
    where.push(`i.tanggal >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.end) {
    params.push(data.end);
    where.push(`i.tanggal < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.q) {
    params.push(`%${data.q}%`);
    where.push(`(coalesce(nullif(l.custom_item, ''), p.nama, '') ilike $${params.length} or coalesce(p.part_number, '') ilike $${params.length} or coalesce(p.kode_pajak, '') ilike $${params.length})`);
  }
  const clause = where.join(" and ");
  const from = `from invoice_lines l join invoices i on i.id = l.invoice_id left join products p on p.id = l.product_id where ${clause}`;
  const items = await db.query<Record<string, unknown>>(
    `select coalesce(nullif(l.custom_item, ''), p.nama, 'Barang') as nama,
            coalesce(p.part_number, '') as part_number,
            coalesce(p.kode_pajak, '') as kode_pajak,
            coalesce(p.satuan, max(l.satuan)) as satuan,
            sum(coalesce(nullif(l.jumlah_dasar, 0), l.jumlah))::bigint as qty,
            sum(l.harga_satuan * l.jumlah)::bigint as nilai,
            count(distinct i.id)::int as nota
     ${from}
     group by l.product_id, coalesce(nullif(l.custom_item, ''), p.nama, 'Barang'), p.part_number, p.kode_pajak, p.satuan
     order by qty desc, nama
     limit 5000`,
    params,
  );
  const days = await db.query<Record<string, unknown>>(
    `select to_char((i.tanggal at time zone 'UTC') + interval '8 hours', 'YYYY-MM-DD') as hari,
            count(distinct i.id)::int as nota,
            sum(coalesce(nullif(l.jumlah_dasar, 0), l.jumlah))::bigint as qty,
            sum(l.harga_satuan * l.jumlah)::bigint as nilai
     ${from}
     group by 1
     order by 1 desc`,
    params,
  );
  const map = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" || v == null ? (v ?? "") : Number(v)]));
  const dateWhere: string[] = [`source = 'Kasir'`];
  const dateParams: unknown[] = [];
  if (data.start) {
    dateParams.push(data.start);
    dateWhere.push(`tanggal >= ($${dateParams.length}::date::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.end) {
    dateParams.push(data.end);
    dateWhere.push(`tanggal < (($${dateParams.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
  }
  const [sum] = await db.query<Record<string, unknown>>(
    `select count(*)::int as nota,
            coalesce(sum(total), 0)::bigint as omzet,
            coalesce(sum(diskon), 0)::bigint as diskon,
            coalesce(sum(case when status_bayar = 'Lunas' and metode_bayar = 'Tunai' then total else 0 end), 0)::bigint as tunai,
            coalesce(sum(case
              when status_bayar = 'Lunas' and metode_bayar = 'Transfer' then total
              when status_bayar = 'Lunas' and metode_bayar = 'Split' then transfer_amount
              else 0 end), 0)::bigint as transfer,
            coalesce(sum(case when status_bayar = 'Bon' then total else 0 end), 0)::bigint as bon
     from invoices where ${dateWhere.join(" and ")}`,
    dateParams,
  );
  return { items: items.map(map), days: days.map(map), summary: map(sum ?? {}) };
}

export async function listBon(data: any): Promise<any> {
    await requireStaff();
    const db = await sql();
    const where = [`((source = 'Kasir' and keterangan in ('Bon (Hutang)', 'Bon (Lunas)')) or (source = 'Manual' and metode_bayar = 'Bon'))`];
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
    if (data.withItems) {
      const rows = await db.query(
        `select i.nomor, i.tanggal, i.tujuan, i.status_bayar, i.keterangan, i.total, i.tanggal_lunas, i.kasir,
           coalesce((
             select json_agg(json_build_object(
               'nama', coalesce(nullif(l.custom_item, ''), p.nama, 'Barang'),
               'kode_pajak', coalesce(p.kode_pajak, ''),
               'qty', l.jumlah,
               'satuan', l.satuan,
               'harga', l.harga_satuan
             ) order by l.id)
             from invoice_lines l
             left join products p on p.id = l.product_id
             where l.invoice_id = i.id
           ), '[]'::json) as items
         from invoices i
         where ${where.join(" and ")}
         order by i.tanggal desc, i.id desc
         limit 5000`,
        params,
      );
      return rows;
    }
    const rows = await db.query(
      `select * from invoices where ${where.join(" and ")} order by tanggal desc, id desc limit 5000`,
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
      `select * from tax_lines where ${where.join(" and ")} order by tanggal desc limit 5000`,
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
    const invoices = await db.query(`select * from invoices where source = 'Kasir' and ${filter} order by tanggal desc limit 5000`, params);
    const moves = await db.query(`select * from cash_moves where ${filter} order by tanggal desc limit 5000`, params);
    const returs = await db.query(`select * from returs where ${filter} order by tanggal desc limit 5000`, params);
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
  const rows = await db.query<Staff & { password_hash: string }>(
    `select username, role, name, shift, status, photo, password_hash from staff order by username`,
  );
  return rows.map((row) => ({
    username: row.username,
    role: row.role,
    name: row.name,
    shift: row.shift,
    status: row.status,
    photo: String(row.photo ?? ""),
    mustChange: stillDefault(row.username, String(row.password_hash ?? "")),
  }));
}



export async function saveStaff(data: any) {
    const me = await requireStaff();
    assertAdmin(me);
    const username = data.username.trim().toLowerCase();
    if (!username || !data.name?.trim()) throw new Error("Username dan nama wajib diisi.");
    const status = data.status === "Nonaktif" ? "Nonaktif" : "Aktif";
    if (username === me.username && status === "Nonaktif") {
      throw new Error("Akun yang sedang digunakan tidak dapat dinonaktifkan.");
    }
    const role: Role = data.role === "Owner" || data.role === "Admin" ? data.role : "Kasir";
    const db = await sql();
    const existing = await db.query<{ role: string; status: string }>(`select role, status from staff where username = $1`, [username]);
    if (existing.length && existing[0].role === "Owner" && (role !== "Owner" || status !== "Aktif")) {
      const [left] = await db.query<{ n: number }>(
        `select count(*)::int as n from staff where role = 'Owner' and status = 'Aktif' and username <> $1`,
        [username],
      );
      if (Number(left?.n ?? 0) === 0) throw new Error("Harus tetap ada satu akun Owner yang aktif.");
    }
    const photo = cleanPhoto(data.photo);
    if (existing.length) {
      if (data.password) {
        await db.query(
          `update staff set name=$2, role=$3, shift=$4, status=$5, password_hash=$6, photo=$7 where username=$1`,
          [username, data.name.trim(), role, data.shift ?? "", status, hashPassword(data.password), photo],
        );
      } else {
        await db.query(`update staff set name=$2, role=$3, shift=$4, status=$5, photo=$6 where username=$1`, [
          username,
          data.name.trim(),
          role,
          data.shift ?? "",
          status,
          photo,
        ]);
      }
    } else {
      if (!data.password) throw new Error("Password wajib untuk akun baru.");
      await db.query(
        `insert into staff (username, password_hash, role, name, shift, status, photo) values ($1,$2,$3,$4,$5,$6,$7)`,
        [username, hashPassword(data.password), role, data.name.trim(), data.shift ?? "", status, photo],
      );
    }
    await audit(me, `Simpan akun ${username}`);
    return { ok: true };
  }



export async function updateOwnProfile(data: any) {
  const me = await requireStaff();
  const name = String(data.name ?? "").trim();
  if (!name) throw new Error("Nama wajib diisi.");
  const photo = cleanPhoto(data.photo);
  const db = await sql();
  await db.query(`update staff set name = $2, photo = $3 where username = $1`, [me.username, name, photo]);
  await audit(me, "Ubah nama atau foto akun sendiri");
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




// ---------------------------------------------------------------------------
// Chat pribadi antar staff
// ---------------------------------------------------------------------------

/** Daftar staff aktif (selain saya) beserta pesan terakhir dan jumlah belum dibaca. */
export async function chatContacts() {
  const me = await requireStaff();
  const db = await sql();
  const rows = await db.query<Record<string, unknown>>(
    `select s.username, s.name, s.role, s.photo,
            (select case when m.deleted_at is null then m.body else 'Pesan dihapus' end from chat_messages m
              where ((m.sender = s.username and m.recipient = $1) or (m.sender = $1 and m.recipient = s.username))
              and not exists (select 1 from mjs_chat_hidden h where h.kind = 'dm' and h.message_id = m.id and h.username = $1)
              order by m.id desc limit 1) as last_body,
            (select m.created_at from chat_messages m
              where ((m.sender = s.username and m.recipient = $1) or (m.sender = $1 and m.recipient = s.username))
              and not exists (select 1 from mjs_chat_hidden h where h.kind = 'dm' and h.message_id = m.id and h.username = $1)
              order by m.id desc limit 1) as last_at,
            (select m.sender from chat_messages m
              where ((m.sender = s.username and m.recipient = $1) or (m.sender = $1 and m.recipient = s.username))
              and not exists (select 1 from mjs_chat_hidden h where h.kind = 'dm' and h.message_id = m.id and h.username = $1)
              order by m.id desc limit 1) as last_sender,
            (select count(*)::int from chat_messages m
              where m.sender = s.username and m.recipient = $1 and m.read_at is null and m.deleted_at is null
              and not exists (select 1 from mjs_chat_hidden h where h.kind = 'dm' and h.message_id = m.id and h.username = $1)) as unread
     from staff s
     where s.status = 'Aktif' and s.username <> $1
     order by last_at desc nulls last, case s.role when 'Owner' then 0 when 'Admin' then 1 else 2 end, s.name`,
    [me.username],
  );
  return rows.map((row) => ({
    username: String(row.username),
    name: String(row.name ?? ""),
    role: String(row.role ?? ""),
    photo: String(row.photo ?? ""),
    lastBody: row.last_body == null ? "" : String(row.last_body),
    lastAt: row.last_at ? new Date(String(row.last_at)).toISOString() : "",
    lastMine: row.last_sender != null && String(row.last_sender) === me.username,
    unread: Number(row.unread ?? 0),
  }));
}

/** Total pesan belum dibaca (pribadi + grup) dan pesan terbaru, untuk badge dan notifikasi. */
export async function chatUnread() {
  type Latest = { ts: number; kind: "dm" | "group"; target: string; fromName: string; title: string; body: string };
  const me = await readStaff();
  if (!me) return { unread: 0, latest: null as Latest | null };
  const db = await sql();
  const [dm] = await db.query<{ n: number }>(
    `select count(*)::int as n from chat_messages where recipient = $1 and read_at is null and deleted_at is null`,
    [me.username],
  );
  const [grp] = await db.query<{ n: number }>(
    `select count(*)::int as n from chat_group_messages m
     join chat_group_members gm on gm.group_id = m.group_id and gm.username = $1
     where m.sender <> $1 and m.id > gm.last_read_id and m.deleted_at is null`,
    [me.username],
  );
  const unread = Number(dm?.n ?? 0) + Number(grp?.n ?? 0);
  if (!unread) return { unread, latest: null as Latest | null };
  const [d] = Number(dm?.n ?? 0)
    ? await db.query<Record<string, unknown>>(
        `select m.sender, s.name, m.body, m.created_at from chat_messages m join staff s on s.username = m.sender
         where m.recipient = $1 and m.read_at is null and m.deleted_at is null order by m.id desc limit 1`,
        [me.username],
      )
    : [];
  const [g] = Number(grp?.n ?? 0)
    ? await db.query<Record<string, unknown>>(
        `select m.group_id, gr.nama as group_name, s.name, m.body, m.created_at
         from chat_group_messages m
         join chat_group_members gm on gm.group_id = m.group_id and gm.username = $1
         join chat_groups gr on gr.id = m.group_id
         join staff s on s.username = m.sender
         where m.sender <> $1 and m.id > gm.last_read_id and m.deleted_at is null order by m.created_at desc, m.id desc limit 1`,
        [me.username],
      )
    : [];
  const cand: Latest[] = [];
  if (d) cand.push({ ts: new Date(String(d.created_at)).getTime(), kind: "dm", target: String(d.sender), fromName: String(d.name ?? ""), title: String(d.name ?? ""), body: String(d.body ?? "") });
  if (g) cand.push({ ts: new Date(String(g.created_at)).getTime(), kind: "group", target: `g:${Number(g.group_id)}`, fromName: String(g.name ?? ""), title: `${String(g.group_name ?? "")} · ${String(g.name ?? "")}${String(g.body ?? "").toLowerCase().includes(`@${me.name}`.toLowerCase()) ? " menyebut Anda" : ""}`, body: String(g.body ?? "") });
  cand.sort((x, y) => y.ts - x.ts);
  return { unread, latest: cand[0] ?? null };
}

/** Percakapan dengan satu staff (200 pesan terakhir). Pesan masuk otomatis ditandai terbaca. */
export async function chatMessages(data: { with: string }) {
  const me = await requireStaff();
  const db = await sql();
  const other = String(data.with ?? "");
  if (!other || other === me.username) throw new Error("Pilih staff lawan bicara.");
  await db.query(
    `update chat_messages set read_at = now() where sender = $1 and recipient = $2 and read_at is null`,
    [other, me.username],
  );
  const rows = await db.query<Record<string, unknown>>(
    `select * from (
       select id, sender, body, created_at, read_at, deleted_at from chat_messages
       where (sender = $1 and recipient = $2) or (sender = $2 and recipient = $1)
       order by id desc limit 200
     ) t order by id asc`,
    [me.username, other],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    mine: String(row.sender) === me.username,
    body: row.deleted_at ? "" : String(row.body ?? ""),
    deleted: row.deleted_at != null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    read: row.read_at != null,
  }));
}

export async function chatSend(data: { to: string; body: string }) {
  const me = await requireStaff();
  const db = await sql();
  const to = String(data.to ?? "");
  const body = String(data.body ?? "").trim();
  if (!body) throw new Error("Pesan kosong.");
  if (body.length > 2000) throw new Error("Pesan terlalu panjang (maksimal 2000 huruf).");
  if (!to || to === me.username) throw new Error("Pilih staff lawan bicara.");
  const target = await db.query(`select 1 from staff where username = $1 and status = 'Aktif'`, [to]);
  if (!target.length) throw new Error("Staff tujuan tidak ditemukan atau tidak aktif.");
  const [row] = await db.query<{ id: number }>(
    `insert into chat_messages (sender, recipient, body) values ($1, $2, $3) returning id`,
    [me.username, to, body],
  );
  return { id: Number(row?.id ?? 0) };
}


// ---------------------------------------------------------------------------
// Grup khusus: chat grup + catatan bersama
// ---------------------------------------------------------------------------

function assertManager(me: Staff) {
  if (me.role !== "Admin" && me.role !== "Owner") throw new Error("Hanya Admin atau Owner yang dapat membuat dan mengatur grup.");
}

async function requireMember(db: Awaited<ReturnType<typeof sql>>, groupId: number, me: Staff) {
  const rows = await db.query(`select 1 from chat_group_members where group_id = $1 and username = $2`, [groupId, me.username]);
  if (!rows.length) throw new Error("Anda bukan anggota grup ini.");
}

async function syncGroupMembers(db: Awaited<ReturnType<typeof sql>>, groupId: number, me: Staff, wanted: unknown) {
  const list = new Set<string>([me.username, ...(Array.isArray(wanted) ? wanted.map((v) => String(v)) : [])]);
  const valid = await db.query<{ username: string }>(
    `select username from staff where status = 'Aktif' and username = any($1::text[])`,
    [[...list]],
  );
  const keep = valid.map((row) => row.username);
  await db.query(`delete from chat_group_members where group_id = $1 and not (username = any($2::text[]))`, [groupId, keep]);
  // Anggota baru tidak mendapat badge "belum dibaca" untuk riwayat lama.
  await db.query(
    `insert into chat_group_members (group_id, username, last_read_id)
     select $1, u, coalesce((select max(id) from chat_group_messages where group_id = $1), 0)
     from unnest($2::text[]) as u
     on conflict (group_id, username) do nothing`,
    [groupId, keep],
  );
}

function cleanGroupFields(data: { nama?: string; deskripsi?: string }) {
  const nama = String(data.nama ?? "").trim();
  if (!nama) throw new Error("Isi nama grup.");
  if (nama.length > 60) throw new Error("Nama grup maksimal 60 huruf.");
  const deskripsi = String(data.deskripsi ?? "").trim().slice(0, 300);
  return { nama, deskripsi };
}

export async function groupList() {
  const me = await requireStaff();
  const db = await sql();
  const rows = await db.query<Record<string, unknown>>(
    `select g.id, g.nama, g.deskripsi,
            (select count(*)::int from chat_group_members x where x.group_id = g.id) as member_count,
            (select case when m.deleted_at is null then m.body else 'Pesan dihapus' end from chat_group_messages m where m.group_id = g.id and not exists (select 1 from mjs_chat_hidden h where h.kind = 'group' and h.message_id = m.id and h.username = $1) order by m.id desc limit 1) as last_body,
            (select m.created_at from chat_group_messages m where m.group_id = g.id and not exists (select 1 from mjs_chat_hidden h where h.kind = 'group' and h.message_id = m.id and h.username = $1) order by m.id desc limit 1) as last_at,
            (select s.name from chat_group_messages m join staff s on s.username = m.sender where m.group_id = g.id and not exists (select 1 from mjs_chat_hidden h where h.kind = 'group' and h.message_id = m.id and h.username = $1) order by m.id desc limit 1) as last_name,
            (select count(*)::int from chat_group_messages m where m.group_id = g.id and m.sender <> $1 and m.deleted_at is null and m.id > gm.last_read_id and not exists (select 1 from mjs_chat_hidden h where h.kind = 'group' and h.message_id = m.id and h.username = $1)) as unread,
            g.created_at
     from chat_groups g
     join chat_group_members gm on gm.group_id = g.id and gm.username = $1
     order by last_at desc nulls last, g.created_at desc`,
    [me.username],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    nama: String(row.nama ?? ""),
    deskripsi: String(row.deskripsi ?? ""),
    memberCount: Number(row.member_count ?? 0),
    lastBody: row.last_body == null ? "" : String(row.last_body),
    lastName: row.last_name == null ? "" : String(row.last_name),
    lastAt: row.last_at ? new Date(String(row.last_at)).toISOString() : "",
    unread: Number(row.unread ?? 0),
  }));
}

export async function groupInfo(data: { id: number }) {
  const me = await requireStaff();
  const db = await sql();
  await requireMember(db, data.id, me);
  const [group] = await db.query<Record<string, unknown>>(`select id, nama, deskripsi, created_by from chat_groups where id = $1`, [data.id]);
  if (!group) throw new Error("Grup tidak ditemukan.");
  const members = await db.query<Record<string, unknown>>(
    `select s.username, s.name, s.role, s.photo from chat_group_members gm join staff s on s.username = gm.username
     where gm.group_id = $1 order by case s.role when 'Owner' then 0 when 'Admin' then 1 else 2 end, s.name`,
    [data.id],
  );
  return {
    id: Number(group.id),
    nama: String(group.nama ?? ""),
    deskripsi: String(group.deskripsi ?? ""),
    createdBy: group.created_by == null ? "" : String(group.created_by),
    canManage: me.role === "Admin" || me.role === "Owner",
    members: members.map((m) => ({ username: String(m.username), name: String(m.name ?? ""), role: String(m.role ?? ""), photo: String(m.photo ?? "") })),
  };
}

export async function groupCreate(data: { nama: string; deskripsi?: string; members: string[] }) {
  const me = await requireStaff();
  assertManager(me);
  const db = await sql();
  const { nama, deskripsi } = cleanGroupFields(data);
  const [row] = await db.query<{ id: number }>(
    `insert into chat_groups (nama, deskripsi, created_by) values ($1, $2, $3) returning id`,
    [nama, deskripsi, me.username],
  );
  const id = Number(row?.id);
  await syncGroupMembers(db, id, me, data.members);
  await audit(me, `Buat grup chat ${nama}`);
  return { id };
}

export async function groupUpdate(data: { id: number; nama: string; deskripsi?: string; members: string[] }) {
  const me = await requireStaff();
  assertManager(me);
  const db = await sql();
  await requireMember(db, data.id, me);
  const { nama, deskripsi } = cleanGroupFields(data);
  await db.query(`update chat_groups set nama = $2, deskripsi = $3 where id = $1`, [data.id, nama, deskripsi]);
  await syncGroupMembers(db, data.id, me, data.members);
  await audit(me, `Ubah grup chat ${nama}`);
  return { ok: true };
}

export async function groupDelete(data: { id: number }) {
  const me = await requireStaff();
  assertManager(me);
  const db = await sql();
  await requireMember(db, data.id, me);
  const [g] = await db.query<{ nama: string }>(`select nama from chat_groups where id = $1`, [data.id]);
  await db.query(`delete from chat_groups where id = $1`, [data.id]);
  await pruneChatFiles(db);
  await audit(me, `Hapus grup chat ${String(g?.nama ?? data.id)}`);
  return { ok: true };
}

export async function groupMessages(data: { id: number }) {
  const me = await requireStaff();
  const db = await sql();
  await requireMember(db, data.id, me);
  const rows = await db.query<Record<string, unknown>>(
    `select * from (
       select m.id, m.sender, s.name, m.body, m.created_at, m.deleted_at from chat_group_messages m join staff s on s.username = m.sender
       where m.group_id = $1 order by m.id desc limit 200
     ) t order by id asc`,
    [data.id],
  );
  await db.query(
    `update chat_group_members set last_read_id = greatest(last_read_id, coalesce((select max(id) from chat_group_messages where group_id = $1), 0))
     where group_id = $1 and username = $2`,
    [data.id, me.username],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    mine: String(row.sender) === me.username,
    name: String(row.name ?? ""),
    body: row.deleted_at ? "" : String(row.body ?? ""),
    deleted: row.deleted_at != null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function groupSend(data: { id: number; body: string }) {
  const me = await requireStaff();
  const db = await sql();
  await requireMember(db, data.id, me);
  const body = String(data.body ?? "").trim();
  if (!body) throw new Error("Pesan kosong.");
  if (body.length > 2000) throw new Error("Pesan terlalu panjang (maksimal 2000 huruf).");
  const [row] = await db.query<{ id: number }>(
    `insert into chat_group_messages (group_id, sender, body) values ($1, $2, $3) returning id`,
    [data.id, me.username, body],
  );
  return { id: Number(row?.id ?? 0) };
}

export async function noteList(data: { groupId: number }) {
  const me = await requireStaff();
  const db = await sql();
  await requireMember(db, data.groupId, me);
  const rows = await db.query<Record<string, unknown>>(
    `select n.id, n.judul, n.isi, n.pinned, n.created_at, n.updated_at, cs.name as created_name, us.name as updated_name
     from chat_group_notes n
     left join staff cs on cs.username = n.created_by
     left join staff us on us.username = n.updated_by
     where n.group_id = $1 order by n.pinned desc, n.updated_at desc, n.id desc`,
    [data.groupId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    judul: String(row.judul ?? ""),
    isi: String(row.isi ?? ""),
    pinned: Boolean(row.pinned),
    createdName: String(row.created_name ?? "-"),
    updatedName: String(row.updated_name ?? "-"),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

export async function noteSave(data: { groupId: number; id?: number | null; judul: string; isi: string; pinned?: boolean }) {
  const me = await requireStaff();
  const db = await sql();
  await requireMember(db, data.groupId, me);
  const judul = String(data.judul ?? "").trim().slice(0, 120);
  const isi = String(data.isi ?? "").trim();
  if (!judul && !isi) throw new Error("Catatan kosong. Isi judul atau isi catatan.");
  if (isi.length > 10000) throw new Error("Isi catatan terlalu panjang (maksimal 10.000 huruf).");
  if (data.id) {
    const rows = await db.query(
      `update chat_group_notes set judul = $3, isi = $4, pinned = $5, updated_by = $6, updated_at = now()
       where id = $1 and group_id = $2 returning id`,
      [data.id, data.groupId, judul, isi, Boolean(data.pinned), me.username],
    );
    if (!rows.length) throw new Error("Catatan tidak ditemukan.");
    return { id: Number(data.id) };
  }
  const [row] = await db.query<{ id: number }>(
    `insert into chat_group_notes (group_id, judul, isi, pinned, created_by, updated_by) values ($1, $2, $3, $4, $5, $5) returning id`,
    [data.groupId, judul, isi, Boolean(data.pinned), me.username],
  );
  return { id: Number(row?.id) };
}

export async function noteDelete(data: { groupId: number; id: number }) {
  const me = await requireStaff();
  const db = await sql();
  await requireMember(db, data.groupId, me);
  const rows = await db.query<{ created_by: string | null }>(`select created_by from chat_group_notes where id = $1 and group_id = $2`, [data.id, data.groupId]);
  if (!rows.length) throw new Error("Catatan tidak ditemukan.");
  if (rows[0].created_by !== me.username && me.role !== "Admin" && me.role !== "Owner") {
    throw new Error("Catatan hanya bisa dihapus oleh pembuatnya, Admin, atau Owner.");
  }
  await db.query(`delete from chat_group_notes where id = $1 and group_id = $2`, [data.id, data.groupId]);
  return { ok: true };
}


/** Hapus pesan pribadi milik sendiri (isi pesan hilang untuk kedua pihak). */
export async function chatDeleteMessage(data: { id: number }) {
  const me = await requireStaff();
  const db = await sql();
  const rows = await db.query(
    `update chat_messages set deleted_at = now() where id = $1 and sender = $2 and deleted_at is null returning id`,
    [data.id, me.username],
  );
  if (!rows.length) throw new Error("Pesan tidak ditemukan atau bukan pesan Anda.");
  return { ok: true };
}

/** Hapus pesan grup: pengirim boleh menghapus pesannya sendiri; Admin/Owner anggota grup boleh menghapus pesan siapa saja. */
export async function groupDeleteMessage(data: { id: number }) {
  const me = await requireStaff();
  const db = await sql();
  const [msg] = await db.query<{ group_id: number; sender: string; deleted_at: string | null }>(
    `select group_id, sender, deleted_at from chat_group_messages where id = $1`,
    [data.id],
  );
  if (!msg || msg.deleted_at) throw new Error("Pesan tidak ditemukan.");
  await requireMember(db, Number(msg.group_id), me);
  if (msg.sender !== me.username && me.role !== "Admin" && me.role !== "Owner") {
    throw new Error("Anda hanya bisa menghapus pesan Anda sendiri.");
  }
  await db.query(`update chat_group_messages set deleted_at = now() where id = $1`, [data.id]);
  return { ok: true };
}


/** Hapus beberapa pesan pribadi milik sendiri sekaligus. */
export async function chatDeleteMessages(data: { ids: number[] }) {
  const me = await requireStaff();
  const db = await sql();
  const ids = [...new Set((data.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!ids.length) throw new Error("Pilih pesan yang mau dihapus.");
  const marks = ids.map((_, i) => `$${i + 2}`).join(",");
  const rows = await db.query(
    `update chat_messages set deleted_at = now() where sender = $1 and deleted_at is null and id in (${marks}) returning id`,
    [me.username, ...ids],
  );
  if (!rows.length) throw new Error("Pesan tidak ditemukan atau bukan pesan Anda.");
  const doneIds = rows.map((r) => Number((r as { id: number }).id));
  const doneMarks = doneIds.map((_, i) => `$${i + 1}`).join(",");
  await db.query(`delete from mjs_chat_files where id in (select file_id from chat_messages where file_id is not null and id in (${doneMarks}))`, doneIds);
  return { deleted: rows.length };
}

/** Hapus beberapa pesan grup sekaligus (aturan hak sama dengan hapus satu pesan). */
export async function groupDeleteMessages(data: { ids: number[] }) {
  const me = await requireStaff();
  const db = await sql();
  const ids = [...new Set((data.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!ids.length) throw new Error("Pilih pesan yang mau dihapus.");
  const marks = ids.map((_, i) => `$${i + 1}`).join(",");
  const msgs = await db.query<{ id: number; group_id: number; sender: string }>(
    `select id, group_id, sender from chat_group_messages where deleted_at is null and id in (${marks})`,
    ids,
  );
  if (!msgs.length) throw new Error("Pesan tidak ditemukan.");
  const isMod = me.role === "Admin" || me.role === "Owner";
  for (const gid of new Set(msgs.map((m) => Number(m.group_id)))) await requireMember(db, gid, me);
  if (!isMod && msgs.some((m) => m.sender !== me.username)) throw new Error("Anda hanya bisa menghapus pesan Anda sendiri.");
  const okIds = msgs.map((m) => Number(m.id));
  const okMarks = okIds.map((_, i) => `$${i + 1}`).join(",");
  await db.query(`update chat_group_messages set deleted_at = now() where id in (${okMarks})`, okIds);
  await db.query(`delete from mjs_chat_files where id in (select file_id from chat_group_messages where file_id is not null and id in (${okMarks}))`, okIds);
  return { deleted: okIds.length };
}

/** Hapus seluruh percakapan pribadi dengan satu staff (hilang untuk kedua pihak). */
export async function chatClear(data: { with: string }) {
  const me = await requireStaff();
  await assertChatAdmin(me);
  const db = await sql();
  const other = String(data.with ?? "");
  if (!other || other === me.username) throw new Error("Pilih staff lawan bicara.");
  const rows = await db.query(
    `delete from chat_messages where (sender = $1 and recipient = $2) or (sender = $2 and recipient = $1) returning id`,
    [me.username, other],
  );
  await pruneChatFiles(db);
  await audit(me, `Hapus semua chat pribadi dengan ${other} (${rows.length} pesan)`);
  return { deleted: rows.length };
}

/** Admin atau Owner saja: hapus seluruh percakapan pribadi untuk kedua pihak. */
function assertChatAdmin(me: Staff) {
  if (me.role !== "Admin" && me.role !== "Owner") throw new Error("Hanya Admin atau Owner yang bisa menghapus chat untuk semua orang.");
}

/** "Hapus untuk saya": sembunyikan pesan terpilih hanya dari tampilan saya. Boleh untuk pesan siapa pun di percakapan saya. */
export async function chatHideMessages(data: { kind: string; ids: number[] }) {
  const me = await requireStaff();
  const db = await sql();
  const kind = asChatKind(data.kind);
  const ids = [...new Set((data.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);
  if (!ids.length) throw new Error("Pilih pesan yang mau dihapus.");
  const table = chatTable(kind);
  const access = kind === "group"
    ? `m.group_id in (select group_id from chat_group_members where username = $1)`
    : `(m.sender = $1 or m.recipient = $1)`;
  const rows = await db.query(
    `insert into mjs_chat_hidden (kind, message_id, username)
     select $2, m.id, $1 from ${table} m where m.id = any($3::bigint[]) and ${access}
     on conflict do nothing returning message_id`,
    [me.username, kind, ids],
  );
  return { deleted: rows.length || ids.length };
}

/** "Kosongkan chat": sembunyikan semua pesan satu percakapan hanya untuk saya. */
export async function chatHideAll(data: { kind: string; target: string }) {
  const me = await requireStaff();
  const db = await sql();
  const scope = await chatScope(db, me, data.kind, data.target);
  const table = chatTable(scope.kind);
  const tw = chatThreadWhere(scope, me, "m");
  const rows = await db.query(
    `insert into mjs_chat_hidden (kind, message_id, username)
     select '${scope.kind}', m.id, $${tw.params.length + 1} from ${table} m where ${tw.sql}
     on conflict do nothing returning message_id`,
    [...tw.params, me.username],
  );
  return { deleted: rows.length };
}

/** Hapus semua pesan chat di satu grup (catatan grup tidak ikut terhapus). Khusus Admin/Owner anggota grup. */
export async function groupClearMessages(data: { id: number }) {
  const me = await requireStaff();
  assertManager(me);
  const db = await sql();
  await requireMember(db, data.id, me);
  const rows = await db.query(`delete from chat_group_messages where group_id = $1 returning id`, [data.id]);
  await db.query(`update chat_group_members set last_read_id = 0 where group_id = $1`, [data.id]);
  const [g] = await db.query<{ nama: string }>(`select nama from chat_groups where id = $1`, [data.id]);
  await pruneChatFiles(db);
  await audit(me, `Hapus semua chat grup ${String(g?.nama ?? data.id)} (${rows.length} pesan)`);
  return { deleted: rows.length };
}


// ---------------------------------------------------------------------------
// Chat lanjutan: lampiran, balas, ubah, bagikan data toko, sematkan, reaksi
// ---------------------------------------------------------------------------

type ChatKind = "dm" | "group";
type ChatDb = Awaited<ReturnType<typeof sql>>;
type ChatScope = { kind: ChatKind; other: string; groupId: number };

const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const CHAT_FILE_MAX_BYTES = 2_500_000;
const CHAT_ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|zip)|application\/vnd\.openxmlformats-officedocument\.[a-z.\-]+)$/;

const asChatKind = (value: unknown): ChatKind => (value === "group" ? "group" : "dm");
const chatTable = (kind: ChatKind) => (kind === "group" ? "chat_group_messages" : "chat_messages");
const isoDate = (value: unknown) => new Date(String(value)).toISOString();
const rupiahText = (value: unknown) => `Rp ${String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

async function chatScope(db: ChatDb, me: Staff, kindIn: unknown, targetIn: unknown): Promise<ChatScope> {
  const kind = asChatKind(kindIn);
  if (kind === "group") {
    const groupId = Number(targetIn);
    if (!Number.isInteger(groupId) || groupId <= 0) throw new Error("Grup tidak valid.");
    await requireMember(db, groupId, me);
    return { kind, other: "", groupId };
  }
  const other = String(targetIn ?? "");
  if (!other || other === me.username) throw new Error("Pilih staff lawan bicara.");
  const rows = await db.query(`select 1 from staff where username = $1`, [other]);
  if (!rows.length) throw new Error("Staff tidak ditemukan.");
  return { kind, other, groupId: 0 };
}

/** Kondisi SQL "pesan ini milik percakapan ini" dengan parameter mulai dari $1. */
function chatThreadWhere(scope: ChatScope, me: Staff, alias: string) {
  if (scope.kind === "group") return { sql: `${alias}.group_id = $1`, params: [scope.groupId] as unknown[] };
  return {
    sql: `((${alias}.sender = $1 and ${alias}.recipient = $2) or (${alias}.sender = $2 and ${alias}.recipient = $1))`,
    params: [me.username, scope.other] as unknown[],
  };
}

/** Isi percakapan: pesan (dengan balasan, lampiran, reaksi), pesan tersemat, dan status baca anggota grup. */
export async function chatThread(data: { kind: string; target: string; limit?: number; since?: number | null }) {
  const me = await requireStaff();
  const db = await sql();
  const scope = await chatScope(db, me, data.kind, data.target);
  const table = chatTable(scope.kind);
  const tw = chatThreadWhere(scope, me, "m");
  const tx = chatThreadWhere(scope, me, "x");
  const n = tw.params.length;
  const limit = Math.min(Math.max(Math.floor(Number(data.limit) || 40), 10), 1000);
  const since = Number(data.since) > 0 ? Math.floor(Number(data.since)) : 0;
  const win = since
    ? `m.id >= $${n + 1} and m.id in (select x.id from ${table} x where ${tx.sql} order by x.id desc limit 1000)`
    : `m.id in (select x.id from ${table} x where ${tx.sql} order by x.id desc limit ${limit})`;
  const params = since ? [...tw.params, since] : tw.params;
  const hid = `not exists (select 1 from mjs_chat_hidden h where h.kind = '${scope.kind}' and h.message_id = m.id and h.username = $${params.length + 1})`;
  const hiddenParams = [...params, me.username];

  const rows = await db.query<Record<string, unknown>>(
    `select m.id, m.sender, s.name as sender_name, m.body, m.body_auto, m.created_at, m.deleted_at, m.edited_at, m.pinned_at,
            ${scope.kind === "dm" ? "m.read_at" : "null::timestamptz as read_at"},
            m.reply_to, m.file_id, f.name as file_name, f.mime as file_mime, f.size as file_size,
            m.share_kind, m.share_ref, m.share_title, m.share_sub,
            r.sender as r_sender, rs.name as r_name, r.body as r_body, r.deleted_at as r_deleted
     from ${table} m
     join staff s on s.username = m.sender
     left join mjs_chat_files f on f.id = m.file_id
     left join ${table} r on r.id = m.reply_to
     left join staff rs on rs.username = r.sender
     where ${tw.sql} and ${win} and ${hid}
     order by m.id asc`,
    hiddenParams,
  );

  let myLast = 0;
  let readers: Array<{ username: string; name: string; lastReadId: number }> = [];
  if (scope.kind === "group") {
    const members = await db.query<{ username: string; name: string; last_read_id: number }>(
      `select gm.username, s.name, gm.last_read_id from chat_group_members gm join staff s on s.username = gm.username where gm.group_id = $1 order by s.name`,
      [scope.groupId],
    );
    myLast = Number(members.find((x) => x.username === me.username)?.last_read_id ?? 0);
    readers = members
      .filter((x) => x.username !== me.username)
      .map((x) => ({ username: String(x.username), name: String(x.name ?? ""), lastReadId: Number(x.last_read_id ?? 0) }));
  }

  const maxId = rows.length ? Number(rows[rows.length - 1].id) : 0;
  if (maxId) {
    if (scope.kind === "dm") {
      await db.query(
        `update chat_messages set read_at = now() where sender = $1 and recipient = $2 and read_at is null and id <= $3`,
        [scope.other, me.username, maxId],
      );
    } else {
      await db.query(
        `update chat_group_members set last_read_id = greatest(last_read_id, $3) where group_id = $1 and username = $2`,
        [scope.groupId, me.username, maxId],
      );
    }
  }

  const ids = rows.map((row) => Number(row.id));
  const reactRows = ids.length
    ? await db.query<{ message_id: number; emoji: string; username: string; name: string }>(
        `select cr.message_id, cr.emoji, cr.username, s.name from mjs_chat_reactions cr join staff s on s.username = cr.username
         where cr.kind = $1 and cr.message_id = any($2::bigint[]) order by cr.created_at`,
        [scope.kind, ids],
      )
    : [];
  const reactMap = new Map<number, Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>>();
  for (const r of reactRows) {
    const mid = Number(r.message_id);
    const byEmoji = reactMap.get(mid) ?? new Map();
    const entry = byEmoji.get(r.emoji) ?? { emoji: String(r.emoji), count: 0, mine: false, names: [] as string[] };
    entry.count += 1;
    entry.names.push(String(r.name ?? r.username));
    if (r.username === me.username) entry.mine = true;
    byEmoji.set(r.emoji, entry);
    reactMap.set(mid, byEmoji);
  }

  const pinRows = await db.query<Record<string, unknown>>(
    `select m.id, s.name, m.body from ${table} m join staff s on s.username = m.sender
     where ${tw.sql} and m.pinned_at is not null and m.deleted_at is null
       and not exists (select 1 from mjs_chat_hidden h where h.kind = '${scope.kind}' and h.message_id = m.id and h.username = $${n + 1})
     order by m.pinned_at desc limit 10`,
    [...tw.params, me.username],
  );

  const minId = rows.length ? Number(rows[0].id) : 0;
  const older = minId
    ? await db.query(
        `select 1 from ${table} m where ${tw.sql} and m.id < $${n + 1}
           and not exists (select 1 from mjs_chat_hidden h where h.kind = '${scope.kind}' and h.message_id = m.id and h.username = $${n + 2}) limit 1`,
        [...tw.params, minId, me.username],
      )
    : [];

  const messages = rows.map((row) => {
    const id = Number(row.id);
    const mine = String(row.sender) === me.username;
    const deleted = row.deleted_at != null;
    const fresh = !mine && !deleted && (scope.kind === "dm" ? row.read_at == null : id > myLast);
    const replyGone = row.r_sender == null || row.r_deleted != null;
    return {
      id,
      mine,
      deleted,
      fresh,
      sender: String(row.sender),
      name: String(row.sender_name ?? ""),
      body: deleted ? "" : String(row.body ?? ""),
      auto: !deleted && Boolean(row.body_auto),
      createdAt: isoDate(row.created_at),
      editedAt: row.edited_at && !deleted ? isoDate(row.edited_at) : "",
      read: row.read_at != null,
      pinned: row.pinned_at != null && !deleted,
      reply: !deleted && row.reply_to != null
        ? {
            id: Number(row.reply_to),
            name: replyGone ? "" : String(row.r_sender) === me.username ? "Anda" : String(row.r_name ?? ""),
            body: replyGone ? "" : String(row.r_body ?? ""),
            deleted: replyGone,
          }
        : null,
      file: !deleted && row.file_id != null
        ? { id: Number(row.file_id), name: String(row.file_name ?? "file"), mime: String(row.file_mime ?? ""), size: Number(row.file_size ?? 0) }
        : null,
      share: !deleted && row.share_kind
        ? { kind: String(row.share_kind), ref: String(row.share_ref ?? ""), title: String(row.share_title ?? ""), sub: String(row.share_sub ?? "") }
        : null,
      reactions: deleted ? [] : [...(reactMap.get(id)?.values() ?? [])],
    };
  });

  return {
    messages,
    hasMore: older.length > 0,
    pins: pinRows.map((p) => ({ id: Number(p.id), name: String(p.name ?? ""), body: String(p.body ?? "") })),
    readers,
  };
}

function parseChatFile(file: unknown) {
  if (!file || typeof file !== "object") return null;
  const f = file as { name?: unknown; data?: unknown };
  const data = String(f.data ?? "");
  const head = /^data:([a-z0-9.+\-/]+);base64,/i.exec(data.slice(0, 160));
  if (!head) throw new Error("File tidak valid.");
  const mime = head[1].toLowerCase();
  if (!CHAT_ALLOWED_MIME.test(mime)) throw new Error("Jenis file ini tidak didukung. Gunakan foto, PDF, Word, Excel, CSV, atau teks.");
  const b64 = data.slice(head[0].length);
  const size = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  if (size <= 0) throw new Error("File kosong.");
  if (size > CHAT_FILE_MAX_BYTES) throw new Error("File terlalu besar (maksimal 2,5 MB).");
  const name = String(f.name ?? "file").replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, 120) || "file";
  return { name, mime, size, data };
}

/** Data toko yang dibagikan disusun ulang dari database (bukan dari kiriman klien). */
async function buildChatShare(db: ChatDb, share: { type?: unknown; ref?: unknown } | null | undefined) {
  if (!share) return null;
  const type = String(share.type ?? "");
  const ref = String(share.ref ?? "").trim();
  if (!ref) return null;
  if (type === "barang") {
    const [p] = await db.query<Record<string, unknown>>(
      `select kode, part_number, nama, merek, stok, satuan, harga_jual from products where kode = $1`,
      [ref],
    );
    if (!p) throw new Error("Barang tidak ditemukan.");
    const pn = String(p.part_number ?? "");
    const merek = String(p.merek ?? "");
    return {
      kind: "barang",
      ref: pn || String(p.nama),
      title: String(p.nama),
      sub: `${pn || String(p.kode)}${merek ? ` · ${merek}` : ""} · Stok ${Number(p.stok ?? 0)} ${String(p.satuan ?? "")} · ${rupiahText(p.harga_jual)}`,
    };
  }
  if (type === "transaksi") {
    const [i] = await db.query<Record<string, unknown>>(
      `select nomor, tujuan, total, status_bayar from invoices where nomor = $1`,
      [ref],
    );
    if (!i) throw new Error("Transaksi tidak ditemukan.");
    return {
      kind: "transaksi",
      ref: String(i.nomor),
      title: `Transaksi ${String(i.nomor)}`,
      sub: `${String(i.tujuan || "Umum")} · ${rupiahText(i.total)} · ${String(i.status_bayar ?? "")}`,
    };
  }
  throw new Error("Jenis data tidak dikenal.");
}

const autoBodyFor = (file: { name: string; mime: string } | null, title: string) =>
  file ? (file.mime.startsWith("image/") ? "📷 Foto" : `📎 ${file.name}`) : `🧾 ${title}`;

/** Kirim pesan: teks, foto/file, balasan, atau data toko yang dibagikan. */
export async function chatPost(data: {
  kind: string;
  target: string;
  body?: string;
  replyTo?: number | null;
  file?: unknown;
  share?: { type?: unknown; ref?: unknown } | null;
}) {
  const me = await requireStaff();
  const db = await sql();
  const scope = await chatScope(db, me, data.kind, data.target);
  if (scope.kind === "dm") {
    const active = await db.query(`select 1 from staff where username = $1 and status = 'Aktif'`, [scope.other]);
    if (!active.length) throw new Error("Staff tujuan tidak ditemukan atau tidak aktif.");
  }
  const caption = String(data.body ?? "").trim();
  if (caption.length > 2000) throw new Error("Pesan terlalu panjang (maksimal 2000 huruf).");
  const file = parseChatFile(data.file);
  const share = await buildChatShare(db, data.share);
  if (!caption && !file && !share) throw new Error("Pesan kosong.");
  const body = caption || autoBodyFor(file, share?.title ?? "");

  let replyTo: number | null = null;
  const rid = Number(data.replyTo);
  if (Number.isInteger(rid) && rid > 0) {
    const tw = chatThreadWhere(scope, me, "m");
    const ok = await db.query(`select 1 from ${chatTable(scope.kind)} m where m.id = $${tw.params.length + 1} and ${tw.sql}`, [...tw.params, rid]);
    if (ok.length) replyTo = rid;
  }

  let fileId: number | null = null;
  if (file) {
    const [f] = await db.query<{ id: number }>(
      `insert into mjs_chat_files (owner, name, mime, size, data) values ($1, $2, $3, $4, $5) returning id`,
      [me.username, file.name, file.mime, file.size, file.data],
    );
    fileId = Number(f?.id ?? 0) || null;
  }

  const extra = [!caption, replyTo, fileId, share?.kind ?? null, share?.ref ?? null, share?.title ?? null, share?.sub ?? null];
  let newId = 0;
  if (scope.kind === "dm") {
    const [row] = await db.query<{ id: number }>(
      `insert into chat_messages (sender, recipient, body, body_auto, reply_to, file_id, share_kind, share_ref, share_title, share_sub)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [me.username, scope.other, body, ...extra],
    );
    newId = Number(row?.id ?? 0);
  } else {
    const [row] = await db.query<{ id: number }>(
      `insert into chat_group_messages (group_id, sender, body, body_auto, reply_to, file_id, share_kind, share_ref, share_title, share_sub)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [scope.groupId, me.username, body, ...extra],
    );
    newId = Number(row?.id ?? 0);
  }
  await notifyChatPush(db, me, scope, body, { caption, hasImage: Boolean(file?.mime.startsWith("image/")), hasFile: Boolean(file) });
  return { id: newId };
}

/** Ubah isi pesan sendiri (untuk pesan dengan foto/file, yang diubah adalah keterangannya). */
export async function chatEdit(data: { kind: string; id: number; body: string }) {
  const me = await requireStaff();
  const db = await sql();
  const kind = asChatKind(data.kind);
  const table = chatTable(kind);
  const id = Number(data.id);
  const [m] = await db.query<Record<string, unknown>>(
    `select m.sender, m.deleted_at, m.file_id, m.share_title, f.name as file_name, f.mime as file_mime${kind === "group" ? ", m.group_id" : ""}
     from ${table} m left join mjs_chat_files f on f.id = m.file_id where m.id = $1`,
    [id],
  );
  if (!m || m.deleted_at) throw new Error("Pesan tidak ditemukan.");
  if (String(m.sender) !== me.username) throw new Error("Anda hanya bisa mengubah pesan Anda sendiri.");
  if (kind === "group") await requireMember(db, Number(m.group_id), me);
  const text = String(data.body ?? "").trim();
  if (text.length > 2000) throw new Error("Pesan terlalu panjang (maksimal 2000 huruf).");
  const hasAttach = m.file_id != null || m.share_title != null;
  if (!text && !hasAttach) throw new Error("Pesan tidak boleh kosong.");
  const body = text || autoBodyFor(m.file_id != null ? { name: String(m.file_name ?? "file"), mime: String(m.file_mime ?? "") } : null, String(m.share_title ?? ""));
  await db.query(`update ${table} set body = $2, body_auto = $3, edited_at = now() where id = $1`, [id, body, !text]);
  return { ok: true };
}

async function chatMessageAccess(db: ChatDb, me: Staff, kind: ChatKind, id: number) {
  const [m] = await db.query<Record<string, unknown>>(
    kind === "group"
      ? `select id, group_id, sender, deleted_at, pinned_at from chat_group_messages where id = $1`
      : `select id, sender, recipient, deleted_at, pinned_at from chat_messages where id = $1`,
    [id],
  );
  if (!m || m.deleted_at) throw new Error("Pesan tidak ditemukan.");
  if (kind === "group") await requireMember(db, Number(m.group_id), me);
  else if (String(m.sender) !== me.username && String(m.recipient) !== me.username) throw new Error("Pesan tidak ditemukan.");
  return m;
}

/** Beri atau cabut reaksi emoji (satu reaksi per orang per pesan; emoji yang sama = cabut). */
export async function chatReact(data: { kind: string; id: number; emoji: string }) {
  const me = await requireStaff();
  const db = await sql();
  const kind = asChatKind(data.kind);
  const id = Number(data.id);
  const emoji = String(data.emoji ?? "");
  if (!emoji || emoji.length > 16 || !/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200d\ufe0f\u20e3\u{1f3fb}-\u{1f3ff}#*0-9])+$/u.test(emoji)) throw new Error("Emoji tidak valid.");
  await chatMessageAccess(db, me, kind, id);
  const [existing] = await db.query<{ emoji: string }>(
    `select emoji from mjs_chat_reactions where kind = $1 and message_id = $2 and username = $3`,
    [kind, id, me.username],
  );
  if (existing && existing.emoji === emoji) {
    await db.query(`delete from mjs_chat_reactions where kind = $1 and message_id = $2 and username = $3`, [kind, id, me.username]);
    return { on: false };
  }
  await db.query(
    `insert into mjs_chat_reactions (kind, message_id, username, emoji) values ($1, $2, $3, $4)
     on conflict (kind, message_id, username) do update set emoji = excluded.emoji, created_at = now()`,
    [kind, id, me.username, emoji],
  );
  return { on: true };
}

/** Sematkan atau lepas sematan pesan (maksimal 5 per percakapan). */
export async function chatPin(data: { kind: string; id: number; pinned: boolean }) {
  const me = await requireStaff();
  const db = await sql();
  const kind = asChatKind(data.kind);
  const id = Number(data.id);
  const m = await chatMessageAccess(db, me, kind, id);
  const pinned = Boolean(data.pinned);
  if (pinned && m.pinned_at == null) {
    const [c] = kind === "group"
      ? await db.query<{ n: number }>(`select count(*)::int as n from chat_group_messages where group_id = $1 and pinned_at is not null and deleted_at is null`, [Number(m.group_id)])
      : await db.query<{ n: number }>(
          `select count(*)::int as n from chat_messages where ((sender = $1 and recipient = $2) or (sender = $2 and recipient = $1)) and pinned_at is not null and deleted_at is null`,
          [String(m.sender), String(m.recipient)],
        );
    if (Number(c?.n ?? 0) >= 5) throw new Error("Maksimal 5 pesan disematkan. Lepas salah satu dulu.");
  }
  await db.query(
    `update ${chatTable(kind)} set pinned_at = case when $2::boolean then now() else null end, pinned_by = case when $2::boolean then $3 else null end where id = $1`,
    [id, pinned, me.username],
  );
  return { ok: true };
}

/** Isi foto/file. Hanya bisa dibuka oleh peserta percakapan yang pesannya belum dihapus. */
export async function chatFileGet(data: { id: number }) {
  const me = await requireStaff();
  const db = await sql();
  const [f] = await db.query<Record<string, unknown>>(
    `select f.name, f.mime, f.size, f.data from mjs_chat_files f
     where f.id = $1 and (
       exists (select 1 from chat_messages m where m.file_id = f.id and m.deleted_at is null and (m.sender = $2 or m.recipient = $2))
       or exists (select 1 from chat_group_messages g join chat_group_members gm on gm.group_id = g.group_id and gm.username = $2
                  where g.file_id = f.id and g.deleted_at is null)
     )`,
    [Number(data.id), me.username],
  );
  if (!f) throw new Error("File tidak ditemukan atau sudah dihapus.");
  return { name: String(f.name), mime: String(f.mime), size: Number(f.size ?? 0), dataUrl: String(f.data) };
}

/** Cari kata di dalam satu percakapan (isi pesan, nama file, data toko yang dibagikan). */
export async function chatSearch(data: { kind: string; target: string; q: string }) {
  const me = await requireStaff();
  const db = await sql();
  const scope = await chatScope(db, me, data.kind, data.target);
  const q = String(data.q ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const tw = chatThreadWhere(scope, me, "m");
  const rows = await db.query<Record<string, unknown>>(
    `select m.id, s.name, m.body, m.created_at
     from ${chatTable(scope.kind)} m
     join staff s on s.username = m.sender
     left join mjs_chat_files f on f.id = m.file_id
     where ${tw.sql} and m.deleted_at is null
       and position(lower($${tw.params.length + 1}) in lower(m.body || ' ' || coalesce(m.share_title, '') || ' ' || coalesce(m.share_sub, '') || ' ' || coalesce(f.name, ''))) > 0
     order by m.id desc limit 50`,
    [...tw.params, q],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    body: String(r.body ?? ""),
    createdAt: isoDate(r.created_at),
  }));
}

/** Cari barang atau transaksi untuk dibagikan ke chat. */
export async function chatShareFind(data: { type: string; q: string }) {
  await requireStaff();
  const db = await sql();
  const tokens = String(data.q ?? "").trim().toLowerCase().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 4);
  const params: unknown[] = [];
  const where = (expr: string) => {
    const conds = tokens.map((t) => { params.push(t); return `position($${params.length} in ${expr}) > 0`; });
    return conds.length ? `where ${conds.join(" and ")}` : "";
  };
  if (data.type === "transaksi") {
    const rows = await db.query<Record<string, unknown>>(
      `select i.nomor, i.tujuan, i.total, i.status_bayar from invoices i
       ${where("lower(i.nomor || ' ' || i.tujuan || ' ' || i.keterangan)")} order by i.tanggal desc, i.id desc limit 15`,
      params,
    );
    return rows.map((r) => ({
      ref: String(r.nomor),
      title: `Transaksi ${String(r.nomor)}`,
      sub: `${String(r.tujuan || "Umum")} · ${rupiahText(r.total)} · ${String(r.status_bayar ?? "")}`,
    }));
  }
  const rows = await db.query<Record<string, unknown>>(
    `select p.kode, p.part_number, p.nama, p.merek, p.stok, p.satuan, p.harga_jual from products p
     ${where("lower(p.nama || ' ' || p.part_number || ' ' || p.merek || ' ' || p.kode)")} order by p.nama limit 15`,
    params,
  );
  return rows.map((r) => ({
    ref: String(r.kode),
    title: String(r.nama),
    sub: `${String(r.part_number || r.kode)}${r.merek ? ` · ${String(r.merek)}` : ""} · Stok ${Number(r.stok ?? 0)} ${String(r.satuan ?? "")} · ${rupiahText(r.harga_jual)}`,
  }));
}

/** Hapus file lampiran yang sudah tidak dipakai pesan mana pun. */
async function pruneChatFiles(db: ChatDb) {
  await db.query(
    `delete from mjs_chat_files f where f.created_at < now() - interval '1 minute'
       and not exists (select 1 from chat_messages m where m.file_id = f.id)
       and not exists (select 1 from chat_group_messages g where g.file_id = f.id)`,
  );
}


// ---------------------------------------------------------------------------
// Notifikasi di luar aplikasi (Web Push)
// ---------------------------------------------------------------------------

async function loadWebPush() {
  const mod: any = await import("web-push");
  return mod.default ?? mod;
}

/** Kunci VAPID: dari environment kalau ada, kalau tidak dibuat otomatis sekali lalu disimpan di database. */
async function ensureVapid(db: ChatDb): Promise<{ pub: string; priv: string }> {
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) return { pub: envPub, priv: envPriv };
  const read = async () => {
    const rows = await db.query<{ key: string; value: string }>(`select key, value from mjs_push_config where key in ('vapid_public', 'vapid_private')`);
    const map = new Map(rows.map((r) => [String(r.key), String(r.value)]));
    const pub = map.get("vapid_public");
    const priv = map.get("vapid_private");
    return pub && priv ? { pub, priv } : null;
  };
  const have = await read();
  if (have) return have;
  const webpush = await loadWebPush();
  const keys = webpush.generateVAPIDKeys();
  await db.query(
    `insert into mjs_push_config (key, value) values ('vapid_public', $1), ('vapid_private', $2) on conflict (key) do nothing`,
    [keys.publicKey, keys.privateKey],
  );
  const after = await read();
  if (!after) throw new Error("Gagal menyiapkan kunci notifikasi.");
  return after;
}

export async function pushPublicKey() {
  await requireStaff();
  const db = await sql();
  const keys = await ensureVapid(db);
  return { key: keys.pub };
}

export async function pushSubscribe(data: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
  const me = await requireStaff();
  const db = await sql();
  const endpoint = String(data.endpoint ?? "");
  const p256dh = String(data.p256dh ?? "");
  const auth = String(data.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) throw new Error("Data langganan notifikasi tidak valid.");
  await db.query(
    `insert into mjs_push_subscriptions (endpoint, username, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set username = excluded.username, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [endpoint, me.username, p256dh, auth, String(data.userAgent ?? "").slice(0, 200)],
  );
  return { ok: true };
}

export async function pushUnsubscribe(data: { endpoint: string }) {
  const me = await requireStaff();
  const db = await sql();
  await db.query(`delete from mjs_push_subscriptions where endpoint = $1 and username = $2`, [String(data.endpoint ?? ""), me.username]);
  return { ok: true };
}

async function sendChatPush(db: ChatDb, usernames: string[], payload: { title: string; body: string; tag: string; target: string; mention?: boolean }) {
  if (!usernames.length) return;
  const subs = await db.query<{ endpoint: string; p256dh: string; auth: string }>(
    `select endpoint, p256dh, auth from mjs_push_subscriptions where username = any($1::text[])`,
    [usernames],
  );
  if (!subs.length) return;
  const webpush = await loadWebPush();
  const keys = await ensureVapid(db);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@muriajayasakti.com", keys.pub, keys.priv);
  const text = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, text, { TTL: 21600, urgency: "high" });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await db.query(`delete from mjs_push_subscriptions where endpoint = $1`, [s.endpoint]);
      }
    }),
  );
}

/** Kirim notifikasi ke penerima pesan. Tidak boleh menggagalkan pengiriman pesan. */
async function notifyChatPush(db: ChatDb, me: Staff, scope: ChatScope, body: string, info: { caption: string; hasImage: boolean; hasFile: boolean }) {
  try {
    // Foto/file yang diberi keterangan: tampilkan ikon + keterangannya, bukan hanya teks.
    const icon = info.hasImage ? "📷 " : info.hasFile ? "📎 " : "";
    const text = info.hasFile && info.caption ? `${icon}${info.caption}` : body;
    const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    if (scope.kind === "dm") {
      await Promise.race([
        sendChatPush(db, [scope.other], { title: me.name, body: preview, tag: `chat-${me.username}`, target: me.username }),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
      return;
    }
    const members = await db.query<{ username: string; name: string }>(
      `select gm.username, s.name from chat_group_members gm join staff s on s.username = gm.username where gm.group_id = $1 and gm.username <> $2`,
      [scope.groupId, me.username],
    );
    const [g] = await db.query<{ nama: string }>(`select nama from chat_groups where id = $1`, [scope.groupId]);
    const groupName = String(g?.nama ?? "Grup");
    const lower = body.toLowerCase();
    const mentioned = members.filter((m) => m.name && lower.includes(`@${String(m.name).toLowerCase()}`)).map((m) => String(m.username));
    const others = members.map((m) => String(m.username)).filter((u) => !mentioned.includes(u));
    const base = { body: preview, tag: `chat-g${scope.groupId}`, target: `g:${scope.groupId}` };
    await Promise.race([
      Promise.allSettled([
        sendChatPush(db, others, { ...base, title: `${groupName} · ${me.name}` }),
        sendChatPush(db, mentioned, { ...base, title: `${me.name} menyebut Anda di ${groupName}`, mention: true }),
      ]),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    /* notifikasi gagal tidak masalah; pesan tetap terkirim */
  }
}


/** Semua foto yang pernah dikirim di satu percakapan (terbaru dulu), untuk tab Foto. */
export async function chatPhotos(data: { kind: string; target: string }) {
  const me = await requireStaff();
  const db = await sql();
  const scope = await chatScope(db, me, data.kind, data.target);
  const table = chatTable(scope.kind);
  const tw = chatThreadWhere(scope, me, "m");
  const rows = await db.query<Record<string, unknown>>(
    `select m.id, m.sender, s.name as sender_name, m.created_at, f.id as file_id, f.name as file_name, f.size as file_size
     from ${table} m
     join staff s on s.username = m.sender
     join mjs_chat_files f on f.id = m.file_id
     where ${tw.sql} and m.deleted_at is null and f.mime like 'image/%'
       and not exists (select 1 from mjs_chat_hidden h where h.kind = '${scope.kind}' and h.message_id = m.id and h.username = $${tw.params.length + 1})
     order by m.id desc limit 200`,
    [...tw.params, me.username],
  );
  return rows.map((r) => ({
    messageId: Number(r.id),
    fileId: Number(r.file_id),
    name: String(r.file_name ?? "foto"),
    size: Number(r.file_size ?? 0),
    sender: String(r.sender_name ?? ""),
    mine: String(r.sender) === me.username,
    createdAt: isoDate(r.created_at),
  }));
}
