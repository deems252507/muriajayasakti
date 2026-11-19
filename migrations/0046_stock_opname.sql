-- Stok opname: cek stok fisik per kategori, jadwal cek berkala, riwayat, dan penyesuaian stok otomatis.
-- Satu barang punya satu catatan "cek terakhir" (stock_check_items). Kategori dianggap sudah dicek
-- selama setiap barangnya dicek kurang dari "interval bulan" yang lalu.

create table if not exists stock_check_settings (
  kategori_key text primary key,
  kategori text not null,
  interval_bulan int not null default 3 check (interval_bulan between 1 and 24)
);

create table if not exists stock_check_items (
  product_id bigint primary key references products(id) on delete cascade,
  checked_at timestamptz not null default now(),
  checked_by text not null default '',
  stok_sistem int not null default 0,
  stok_fisik int not null default 0
);

create table if not exists stock_check_log (
  id bigserial primary key,
  tanggal timestamptz not null default now(),
  kategori text not null,
  oleh text not null default '',
  dicek int not null default 0,
  selisih int not null default 0
);

create index if not exists stock_check_log_tanggal_idx on stock_check_log (tanggal desc, id desc);

create table if not exists stock_check_log_items (
  id bigserial primary key,
  log_id bigint not null references stock_check_log(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  kode text not null default '',
  nama text not null default '',
  satuan text not null default 'Pcs',
  stok_sistem int not null,
  stok_fisik int not null
);

create index if not exists stock_check_log_items_log_idx on stock_check_log_items (log_id);

-- Menyimpan hasil cek satu kategori dalam satu transaksi.
-- Stok barang disesuaikan dengan selisih hitungan terhadap stok sistem yang dilihat saat barang dihitung,
-- sehingga penjualan yang terjadi setelah barang dihitung tidak tertimpa.
create or replace function shop_opname_save(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_prod products%rowtype;
  v_sistem int;
  v_fisik int;
  v_log bigint;
  v_n int := 0;
  v_diff int := 0;
  v_kat text := coalesce(nullif(btrim(p->>'kategori'), ''), 'Tanpa kategori');
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(nullif(p->>'name', ''), coalesce(p->>'actor', ''));
begin
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Belum ada barang yang diisi.';
  end if;

  insert into stock_check_log (kategori, oleh) values (v_kat, v_name) returning id into v_log;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    select * into v_prod from products where id = (v_item->>'productId')::bigint for update;
    if not found then
      continue;
    end if;
    v_fisik := (v_item->>'fisik')::int;
    if v_fisik is null or v_fisik < 0 then
      raise exception 'Stok fisik % tidak valid.', v_prod.nama;
    end if;
    v_sistem := coalesce((v_item->>'sistem')::int, v_prod.stok);

    update products set stok = greatest(0, v_prod.stok + (v_fisik - v_sistem)) where id = v_prod.id;

    insert into stock_check_items (product_id, checked_at, checked_by, stok_sistem, stok_fisik)
    values (v_prod.id, now(), v_name, v_sistem, v_fisik)
    on conflict (product_id) do update
      set checked_at = now(), checked_by = excluded.checked_by,
          stok_sistem = excluded.stok_sistem, stok_fisik = excluded.stok_fisik;

    insert into stock_check_log_items (log_id, product_id, kode, nama, satuan, stok_sistem, stok_fisik)
    values (v_log, v_prod.id, v_prod.kode, v_prod.nama, v_prod.satuan, v_sistem, v_fisik);

    v_n := v_n + 1;
    if v_fisik <> v_sistem then
      v_diff := v_diff + 1;
    end if;
  end loop;

  if v_n = 0 then
    raise exception 'Barang yang dicek tidak ditemukan.';
  end if;

  update stock_check_log set dicek = v_n, selisih = v_diff where id = v_log;

  insert into audit_log (username, name, action)
  values (v_actor, v_name, 'Stok opname ' || v_kat || ': ' || v_n || ' barang dicek, ' || v_diff || ' selisih disesuaikan');

  return jsonb_build_object('logId', v_log, 'dicek', v_n, 'selisih', v_diff);
end;
$$;
