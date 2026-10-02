create table if not exists staff (
  username text primary key,
  password_hash text not null,
  role text not null check (role in ('Owner', 'Admin', 'Kasir')),
  name text not null,
  shift text not null default '',
  status text not null default 'Aktif'
);

create table if not exists sessions (
  token text primary key,
  username text not null references staff (username) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists shop_profile (
  id int primary key default 1,
  nama text not null,
  alamat text not null,
  telepon text not null
);

insert into shop_profile (id, nama, alamat, telepon)
values (1, 'MURIA JAYA SAKTI', 'Jl. Raja Alam RT.13 No.22', '0852-4717-7445')
on conflict (id) do nothing;

create table if not exists products (
  id bigserial primary key,
  kode text not null unique,
  part_number text not null default '',
  part_numbers_alt text not null default '',
  nama text not null,
  kategori text not null default 'SPAREPART',
  merek text not null default '',
  satuan text not null default 'Pcs',
  stok_min int not null default 0,
  stok int not null default 0,
  harga_beli bigint not null default 0,
  harga_jual bigint not null default 0,
  satuan_alt text not null default '',
  isi_satuan_alt int not null default 0,
  harga_jual_alt bigint not null default 0,
  pajak_status text not null default 'Non Pajak',
  kode_pajak text not null default '',
  keterangan text not null default ''
);

create index if not exists products_nama_idx on products (lower(nama));
create index if not exists products_pn_idx on products (lower(part_number));

create table if not exists partners (
  id bigserial primary key,
  nama text not null,
  tipe text not null check (tipe in ('Pelanggan', 'Supplier')),
  telp text not null default '',
  alamat text not null default ''
);

create table if not exists shifts (
  id text primary key,
  username text not null default '',
  cashier_name text not null default '',
  shift text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  status text not null,
  kas_awal bigint not null default 0,
  counted_cash bigint,
  kas_akhir bigint,
  closed_by text not null default ''
);

create table if not exists invoices (
  id bigserial primary key,
  nomor text not null unique,
  tanggal timestamptz not null default now(),
  tujuan text not null default 'Umum',
  keterangan text not null default '',
  source text not null,
  kasir text not null default '',
  shift_id text,
  status_bayar text not null default 'Lunas',
  metode_bayar text not null default '',
  bank_transfer text not null default '',
  bayar_tunai bigint not null default 0,
  transfer_amount bigint not null default 0,
  kembalian bigint not null default 0,
  diskon bigint not null default 0,
  total bigint not null default 0,
  tanggal_lunas timestamptz,
  parent_invoice text not null default ''
);

create index if not exists invoices_tanggal_idx on invoices (tanggal desc);
create index if not exists invoices_source_idx on invoices (source, status_bayar);

create table if not exists invoice_lines (
  id bigserial primary key,
  invoice_id bigint not null references invoices (id) on delete cascade,
  product_id bigint references products (id),
  custom_item text,
  jenis text not null check (jenis in ('MASUK', 'KELUAR')),
  jumlah int not null,
  satuan text not null,
  jumlah_dasar int not null,
  harga_satuan bigint not null default 0,
  returned_qty int not null default 0,
  part_numbers_alt text not null default '',
  merek text not null default ''
);

create table if not exists cash_moves (
  id bigserial primary key,
  jenis text not null check (jenis in ('MASUK', 'KELUAR')),
  tanggal timestamptz not null default now(),
  jumlah bigint not null,
  keterangan text not null,
  kasir text not null default '',
  shift_id text
);

create index if not exists cash_moves_tanggal_idx on cash_moves (tanggal desc);

create table if not exists tax_lines (
  id bigserial primary key,
  line_id bigint,
  nomor text not null,
  tanggal timestamptz not null,
  part_number text not null default '',
  nama text not null,
  kategori text not null default '',
  merek text not null default '',
  kode_pajak text not null default '',
  status_bayar text not null,
  pelanggan text not null default '',
  jumlah int not null,
  satuan text not null,
  harga_satuan bigint not null,
  dpp bigint not null,
  persentase numeric(6, 2) not null,
  nilai_pajak bigint not null
);

create index if not exists tax_lines_nomor_idx on tax_lines (nomor);
create index if not exists tax_lines_tanggal_idx on tax_lines (tanggal desc);

create table if not exists returs (
  id text primary key,
  parent_invoice text not null,
  tanggal timestamptz not null default now(),
  kasir text not null,
  pelanggan text not null,
  items jsonb not null,
  exchange_items jsonb not null,
  shift_id text,
  metode_bayar text not null,
  bank_transfer text not null default '',
  retur_value bigint not null,
  exchange_value bigint not null,
  net_amount bigint not null,
  payment_direction text not null,
  cash_amount bigint not null default 0,
  transfer_amount bigint not null default 0
);

create table if not exists master_pajak (
  id serial primary key,
  jenis text not null unique,
  persentase numeric(6, 2) not null,
  aktif boolean not null default true
);

create table if not exists master_bank (
  id serial primary key,
  nama text not null unique,
  rekening text not null default '',
  atas_nama text not null default '',
  aktif boolean not null default true,
  keterangan text not null default ''
);

create table if not exists audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  username text not null,
  name text not null,
  action text not null
);

insert into master_pajak (jenis, persentase)
values
  ('Aki Basah', 20),
  ('Aki Kering', 11),
  ('Oli', 4),
  ('Air Radiator', 4),
  ('Minyak Rem', 4),
  ('Lainnya', 11)
on conflict (jenis) do nothing;

insert into master_bank (nama, rekening, atas_nama)
values
  ('BCA', '', ''),
  ('BRI', '', ''),
  ('BNI', '', ''),
  ('Mandiri', '', ''),
  ('BSI', '', ''),
  ('QRIS', '', '')
on conflict (nama) do nothing;

insert into products (
  kode, part_number, nama, kategori, merek, satuan, stok_min, stok,
  harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt,
  pajak_status, kode_pajak
)
values
  ('SP-0001', 'OLI-10W40', 'Oli Mesin 10W-40', 'OLI & CAIRAN', 'MHK', 'Pcs', 6, 24, 32000, 45000, 'Dus', 6, 250000, 'Pajak', 'OL01'),
  ('SP-0002', 'Busi-NGK', 'Busi', 'SPAREPART', 'NGK', 'Pcs', 4, 30, 18000, 28000, 'Dus', 10, 260000, 'Non Pajak', ''),
  ('SP-0003', 'FLT-01', 'Filter Udara', 'SPAREPART', 'MHK', 'Pcs', 2, 8, 40000, 65000, '', 0, 0, 'Pajak', 'FL12'),
  ('SP-0004', 'AKI-B', 'Aki Basah 12V', 'Aki Basah', 'GS', 'Pcs', 1, 4, 280000, 410000, '', 0, 0, 'Pajak', 'AK20'),
  ('SP-0005', 'MR-01', 'Minyak Rem', 'Minyak Rem', 'MHK', 'Pcs', 4, 12, 15000, 25000, 'Dus', 12, 270000, 'Pajak', 'MR04'),
  ('SP-0006', 'RAD-01', 'Air Radiator', 'Air Radiator', 'MHK', 'Pcs', 4, 10, 18000, 30000, 'Dus', 6, 165000, 'Pajak', 'RD04')
on conflict (kode) do nothing;

insert into partners (nama, tipe, telp)
select 'Bengkel Harapan', 'Pelanggan', '0812000001'
where not exists (select 1 from partners where nama = 'Bengkel Harapan');

insert into partners (nama, tipe, telp)
select 'Supplier Muria', 'Supplier', '0813000002'
where not exists (select 1 from partners where nama = 'Supplier Muria');

create or replace function shift_drawer(sid text) returns bigint
language sql
stable
as $$
  select
    coalesce((select kas_awal from shifts where id = sid), 0)
    + coalesce((
      select sum(
        case
          when status_bayar = 'Lunas' and metode_bayar in ('Tunai', 'Split') then bayar_tunai - kembalian
          else 0
        end
      )
      from invoices
      where source = 'Kasir' and shift_id = sid
    ), 0)
    + coalesce((
      select sum(case when jenis = 'MASUK' then jumlah else -jumlah end)
      from cash_moves cm
      where cm.shift_id = sid
         or (
           cm.shift_id is null
           and cm.kasir = (select cashier_name from shifts where id = sid)
           and cm.tanggal >= (select start_time from shifts where id = sid)
           and cm.tanggal <= coalesce((select end_time from shifts where id = sid), now())
         )
    ), 0)
    + coalesce((
      select sum(
        case
          when payment_direction = 'REFUND' and metode_bayar <> 'Transfer' then -cash_amount
          when payment_direction = 'ADDITIONAL_PAYMENT' and metode_bayar <> 'Transfer' then cash_amount
          else 0
        end
      )
      from returs
      where shift_id = sid
    ), 0);
$$;

create or replace function pajak_persen(kat text) returns numeric
language sql
stable
as $$
  select coalesce(
    (select persentase from master_pajak where aktif and lower(kat) like '%' || lower(jenis) || '%' order by length(jenis) desc limit 1),
    (select persentase from master_pajak where jenis = 'Lainnya'),
    11
  );
$$;

create or replace function tax_dpp(bruto bigint, persen numeric) returns table (dpp bigint, nilai bigint)
language plpgsql
immutable
as $$
declare
  raw numeric;
  rounded bigint;
begin
  if persen is null or persen <= 0 or bruto <= 0 then
    dpp := bruto;
    nilai := 0;
    return next;
    return;
  end if;
  raw := bruto / (1 + persen / 100);
  rounded := round(raw / 1000.0) * 1000;
  dpp := rounded;
  nilai := greatest(bruto - rounded, 0);
  return next;
end;
$$;
