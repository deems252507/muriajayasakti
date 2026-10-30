-- Laporan Harian (BON / CASH / IMRON MOTOR / MJB): catatan terpisah, tidak menyentuh stok, kas, atau kasir.
create table if not exists lh_nota (
  id bigserial primary key,
  tab text not null check (tab in ('BON', 'CASH', 'IMRON', 'MJB')),
  tanggal date not null,
  customer text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists lh_nota_tab_tanggal on lh_nota (tab, tanggal);

create table if not exists lh_baris (
  id bigserial primary key,
  nota_id bigint not null references lh_nota(id) on delete cascade,
  part_number text not null default '',
  nama text not null default '',
  pcs numeric not null default 1,
  harga bigint not null default 0,
  product_id int
);
create index if not exists lh_baris_nota on lh_baris (nota_id);
