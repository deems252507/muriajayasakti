-- Riwayat harga barang. Setiap kali harga beli / harga jual / harga jual dus berubah (dari menu Barang,
-- penerimaan pemasok, atau impor), database otomatis mencatat harga setelah perubahan beserta tanggalnya.
-- Harga yang berlaku saat migrasi ini dipasang dicatat sebagai harga awal.

create table if not exists product_price_history (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  tanggal timestamptz not null default now(),
  harga_beli bigint not null default 0,
  harga_jual bigint not null default 0,
  harga_jual_alt bigint not null default 0,
  awal boolean not null default false
);

create index if not exists product_price_history_product_idx
  on product_price_history (product_id, tanggal desc, id desc);

create or replace function trg_product_price_history() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into product_price_history (product_id, harga_beli, harga_jual, harga_jual_alt, awal)
    values (new.id, coalesce(new.harga_beli, 0), coalesce(new.harga_jual, 0), coalesce(new.harga_jual_alt, 0), true);
  elsif coalesce(new.harga_beli, 0) is distinct from coalesce(old.harga_beli, 0)
     or coalesce(new.harga_jual, 0) is distinct from coalesce(old.harga_jual, 0)
     or coalesce(new.harga_jual_alt, 0) is distinct from coalesce(old.harga_jual_alt, 0) then
    insert into product_price_history (product_id, harga_beli, harga_jual, harga_jual_alt, awal)
    values (new.id, coalesce(new.harga_beli, 0), coalesce(new.harga_jual, 0), coalesce(new.harga_jual_alt, 0), false);
  end if;
  return new;
end;
$$;

drop trigger if exists product_price_history_trg on products;
create trigger product_price_history_trg
  after insert or update of harga_beli, harga_jual, harga_jual_alt on products
  for each row execute function trg_product_price_history();

-- Titik awal untuk barang yang sudah ada.
insert into product_price_history (product_id, harga_beli, harga_jual, harga_jual_alt, awal)
select p.id, coalesce(p.harga_beli, 0), coalesce(p.harga_jual, 0), coalesce(p.harga_jual_alt, 0), true
from products p
where not exists (select 1 from product_price_history h where h.product_id = p.id);
