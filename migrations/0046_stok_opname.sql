-- Stok Opname (khusus Admin).
-- 1) Penanda "sudah dicek" per barang untuk putaran pengecekan yang sedang berjalan.
-- 2) Catatan pengecekan: satu baris tiap barang dicek. Hanya bertambah, tidak bisa diubah atau dihapus.

alter table products add column if not exists dicek_at timestamptz;
alter table products add column if not exists dicek_hasil text not null default '';
alter table products add column if not exists dicek_selisih int not null default 0;

create table if not exists opname_checks (
  id bigserial primary key,
  ts timestamptz not null default now(),
  product_id bigint,
  kode text not null default '',
  nama text not null,
  kategori text not null default '',
  merek text not null default '',
  part_number text not null default '',
  stok_sistem int not null,
  stok_fisik int not null,
  hasil text not null check (hasil in ('cocok', 'kurang', 'lebih', 'habis')),
  username text not null,
  name text not null
);

create index if not exists opname_checks_ts_idx on opname_checks (ts desc);
create index if not exists opname_checks_product_idx on opname_checks (product_id);
create index if not exists opname_checks_kategori_idx on opname_checks (lower(kategori));

create or replace function opname_checks_immutable() returns trigger
language plpgsql
as $$
begin
  raise exception 'Catatan stok opname tidak dapat diubah atau dihapus.';
end;
$$;

drop trigger if exists opname_checks_no_change on opname_checks;
create trigger opname_checks_no_change
  before update or delete on opname_checks
  for each row execute function opname_checks_immutable();
