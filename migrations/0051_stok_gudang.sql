-- Stok Gudang: gudang menyimpan stok berlebih, toko memakai products.stok (tidak diubah strukturnya).
-- Hanya MENAMBAH kolom/tabel/fungsi baru. Semua jumlah disimpan dalam satuan dasar (mis. Pcs);
-- tampilan Dus dihitung dari isi_satuan_alt di Master Data.

-- 1. Izin staf: staf yang dipilih Admin boleh menambah barang/stok gudang dan mengambil barang dari gudang.
alter table staff add column if not exists can_gudang boolean not null default false;

-- 2. Barang yang disimpan di gudang. Tidak semua barang master ada di sini: barang harus ditambahkan dulu.
create table if not exists gudang_items (
  product_id bigint primary key references products (id) on delete cascade,
  stok int not null default 0 check (stok >= 0),
  ditambah_pada timestamptz not null default now(),
  ditambah_oleh text not null default '',
  ditambah_oleh_nama text not null default '',
  diubah_pada timestamptz not null default now()
);

-- 3. Riwayat. MASUK = tambah stok gudang, PINDAH = gudang ke toko, KOREKSI = penyesuaian Admin (jumlah bertanda),
--    OPNAME = hasil hitung fisik gudang (jumlah = selisih bertanda, qty_input = hasil hitung fisik).
create table if not exists gudang_log (
  id bigserial primary key,
  product_id bigint not null,
  tipe text not null check (tipe in ('MASUK', 'PINDAH', 'KOREKSI', 'OPNAME')),
  jumlah int not null,
  qty_input int not null default 0,
  satuan_input text not null default 'base' check (satuan_input in ('base', 'alt')),
  catatan text not null default '',
  oleh text not null default '',
  oleh_nama text not null default '',
  tanggal timestamptz not null default now(),
  dicek boolean not null default false,
  dicek_oleh text not null default '',
  dicek_nama text not null default '',
  dicek_pada timestamptz,
  diubah_pada timestamptz,
  diubah_nama text not null default ''
);

create index if not exists gudang_log_product_idx on gudang_log (product_id, tanggal desc);
create index if not exists gudang_log_tanggal_idx on gudang_log (tanggal desc, id desc);

-- 4. Tambah barang / tambah stok gudang. Jumlah 0 hanya mendaftarkan barang baru ke daftar gudang.
create or replace function shop_gudang_tambah(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint := (p->>'productId')::bigint;
  v_jml int := coalesce((p->>'jumlah')::int, 0);
  v_qty int := coalesce((p->>'qty')::int, 0);
  v_unit text := case when p->>'unit' = 'alt' then 'alt' else 'base' end;
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 300);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_auto boolean := coalesce((p->>'autoCek')::boolean, false);
  v_ada boolean;
  v_stok int;
  v_log bigint;
begin
  if v_jml < 0 then
    raise exception 'Jumlah tidak boleh negatif.';
  end if;
  perform 1 from products where id = v_pid;
  if not found then
    raise exception 'Barang tidak ditemukan di Daftar Sparepart.';
  end if;

  select exists (select 1 from gudang_items where product_id = v_pid) into v_ada;
  if v_ada and v_jml = 0 then
    raise exception 'Barang sudah ada di daftar gudang. Isi jumlah untuk menambah stok.';
  end if;

  insert into gudang_items (product_id, ditambah_oleh, ditambah_oleh_nama)
  values (v_pid, v_actor, v_name)
  on conflict (product_id) do nothing;

  select stok into v_stok from gudang_items where product_id = v_pid for update;

  if v_jml > 0 then
    if v_stok + v_jml > 999999999 then
      raise exception 'Jumlah terlalu besar.';
    end if;
    update gudang_items set stok = stok + v_jml, diubah_pada = now()
      where product_id = v_pid returning stok into v_stok;
    insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama, dicek, dicek_oleh, dicek_nama, dicek_pada)
    values (v_pid, 'MASUK', v_jml, v_qty, v_unit, v_catatan, v_actor, v_name,
            v_auto, case when v_auto then v_actor else '' end, case when v_auto then v_name else '' end, case when v_auto then now() else null end)
    returning id into v_log;
  end if;

  return jsonb_build_object('ok', true, 'baru', not v_ada, 'stokGudang', v_stok, 'logId', v_log);
end;
$$;

-- 5. Ambil dari gudang: stok gudang berkurang, stok toko (products.stok) bertambah, dalam satu transaksi.
--    Baris dikunci (FOR UPDATE) supaya dua orang yang mengambil bersamaan tidak membuat stok minus.
create or replace function shop_gudang_pindah(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint := (p->>'productId')::bigint;
  v_jml int := coalesce((p->>'jumlah')::int, 0);
  v_qty int := coalesce((p->>'qty')::int, 0);
  v_unit text := case when p->>'unit' = 'alt' then 'alt' else 'base' end;
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 300);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_auto boolean := coalesce((p->>'autoCek')::boolean, false);
  v_g int;
  v_toko int;
  v_log bigint;
begin
  if v_jml <= 0 then
    raise exception 'Jumlah harus lebih dari 0.';
  end if;
  select stok into v_g from gudang_items where product_id = v_pid for update;
  if not found then
    raise exception 'Barang ini belum ada di daftar gudang.';
  end if;
  if v_jml > v_g then
    return jsonb_build_object('ok', false, 'alasan', 'gudang_kurang', 'sisa', v_g);
  end if;

  update gudang_items set stok = stok - v_jml, diubah_pada = now() where product_id = v_pid;
  update products set stok = stok + v_jml where id = v_pid returning stok into v_toko;
  if not found then
    raise exception 'Barang tidak ditemukan di Daftar Sparepart.';
  end if;

  insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama, dicek, dicek_oleh, dicek_nama, dicek_pada)
  values (v_pid, 'PINDAH', v_jml, v_qty, v_unit, v_catatan, v_actor, v_name,
          v_auto, case when v_auto then v_actor else '' end, case when v_auto then v_name else '' end, case when v_auto then now() else null end)
  returning id into v_log;

  return jsonb_build_object('ok', true, 'stokGudang', v_g - v_jml, 'stokToko', v_toko, 'logId', v_log);
end;
$$;

-- 6. Edit entri riwayat (jumlah dan catatan). Selisihnya otomatis dikoreksi ke stok gudang (dan stok toko untuk PINDAH).
create or replace function shop_gudang_edit(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint := (p->>'logId')::bigint;
  v_jml int := coalesce((p->>'jumlah')::int, 0);
  v_qty int := coalesce((p->>'qty')::int, 0);
  v_unit text := case when p->>'unit' = 'alt' then 'alt' else 'base' end;
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 300);
  v_name text := coalesce(p->>'actorName', '');
  v_log gudang_log%rowtype;
  v_g int;
  v_toko int;
  v_delta int;
begin
  select * into v_log from gudang_log where id = v_id for update;
  if not found then
    raise exception 'Catatan tidak ditemukan.';
  end if;
  select stok into v_g from gudang_items where product_id = v_log.product_id for update;
  if not found then
    raise exception 'Barang sudah dihapus dari daftar gudang. Tambahkan lagi dulu.';
  end if;

  if v_log.tipe in ('KOREKSI', 'OPNAME') then
    if v_jml <> v_log.jumlah then
      raise exception 'Jumlah koreksi/opname tidak bisa diubah. Hapus catatan ini lalu buat yang baru.';
    end if;
    update gudang_log set catatan = v_catatan, diubah_pada = now(), diubah_nama = v_name where id = v_id;
    return jsonb_build_object('ok', true, 'stokGudang', v_g);
  end if;

  if v_jml <= 0 then
    raise exception 'Jumlah harus lebih dari 0.';
  end if;
  v_delta := v_jml - v_log.jumlah;

  if v_delta <> 0 then
    if v_log.tipe = 'MASUK' then
      if v_g + v_delta < 0 then
        return jsonb_build_object('ok', false, 'alasan', 'gudang_kurang', 'sisa', v_g);
      end if;
      update gudang_items set stok = stok + v_delta, diubah_pada = now() where product_id = v_log.product_id;
    else
      if v_g - v_delta < 0 then
        return jsonb_build_object('ok', false, 'alasan', 'gudang_kurang', 'sisa', v_g);
      end if;
      select stok into v_toko from products where id = v_log.product_id for update;
      if not found then
        raise exception 'Barang tidak ditemukan di Daftar Sparepart.';
      end if;
      if v_toko + v_delta < 0 then
        return jsonb_build_object('ok', false, 'alasan', 'toko_kurang', 'sisa', v_toko);
      end if;
      update gudang_items set stok = stok - v_delta, diubah_pada = now() where product_id = v_log.product_id;
      update products set stok = stok + v_delta where id = v_log.product_id;
    end if;
  end if;

  update gudang_log set
    jumlah = v_jml,
    qty_input = v_qty,
    satuan_input = v_unit,
    catatan = v_catatan,
    diubah_pada = now(),
    diubah_nama = v_name,
    dicek = case when v_delta <> 0 then false else dicek end,
    dicek_oleh = case when v_delta <> 0 then '' else dicek_oleh end,
    dicek_nama = case when v_delta <> 0 then '' else dicek_nama end,
    dicek_pada = case when v_delta <> 0 then null else dicek_pada end
  where id = v_id;

  select stok into v_g from gudang_items where product_id = v_log.product_id;
  return jsonb_build_object('ok', true, 'stokGudang', v_g);
end;
$$;

-- 7. Hapus entri riwayat = membatalkan pengaruhnya pada stok.
create or replace function shop_gudang_hapus_log(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint := (p->>'logId')::bigint;
  v_log gudang_log%rowtype;
  v_g int;
  v_toko int;
  v_kode text;
  v_nama text;
begin
  select * into v_log from gudang_log where id = v_id for update;
  if not found then
    raise exception 'Catatan tidak ditemukan.';
  end if;
  select stok into v_g from gudang_items where product_id = v_log.product_id for update;
  if not found then
    raise exception 'Barang sudah dihapus dari daftar gudang. Tambahkan lagi dulu.';
  end if;
  select kode, nama into v_kode, v_nama from products where id = v_log.product_id;

  if v_log.tipe = 'PINDAH' then
    select stok into v_toko from products where id = v_log.product_id for update;
    if not found then
      raise exception 'Barang tidak ditemukan di Daftar Sparepart.';
    end if;
    if v_toko - v_log.jumlah < 0 then
      return jsonb_build_object('ok', false, 'alasan', 'toko_kurang', 'sisa', v_toko);
    end if;
    update gudang_items set stok = stok + v_log.jumlah, diubah_pada = now() where product_id = v_log.product_id;
    update products set stok = stok - v_log.jumlah where id = v_log.product_id;
  else
    if v_g - v_log.jumlah < 0 then
      return jsonb_build_object('ok', false, 'alasan', 'gudang_kurang', 'sisa', v_g);
    end if;
    update gudang_items set stok = stok - v_log.jumlah, diubah_pada = now() where product_id = v_log.product_id;
  end if;

  delete from gudang_log where id = v_id;
  select stok into v_g from gudang_items where product_id = v_log.product_id;
  return jsonb_build_object('ok', true, 'kode', v_kode, 'nama', v_nama, 'tipe', v_log.tipe, 'stokGudang', v_g);
end;
$$;

-- 8. Sesuaikan stok gudang ke angka yang benar (Admin). Tercatat sebagai KOREKSI dengan alasan.
create or replace function shop_gudang_sesuaikan(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint := (p->>'productId')::bigint;
  v_target int := (p->>'target')::int;
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 300);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_g int;
begin
  if v_target is null or v_target < 0 or v_target > 999999999 then
    raise exception 'Stok harus bilangan bulat 0 atau lebih.';
  end if;
  if v_catatan = '' then
    raise exception 'Alasan penyesuaian wajib diisi.';
  end if;
  select stok into v_g from gudang_items where product_id = v_pid for update;
  if not found then
    raise exception 'Barang ini belum ada di daftar gudang.';
  end if;
  if v_target = v_g then
    raise exception 'Stok gudang sudah sama dengan angka itu.';
  end if;
  update gudang_items set stok = v_target, diubah_pada = now() where product_id = v_pid;
  insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama)
  values (v_pid, 'KOREKSI', v_target - v_g, v_target, 'base', v_catatan, v_actor, v_name);
  return jsonb_build_object('ok', true, 'stokSebelum', v_g, 'stokGudang', v_target);
end;
$$;

-- 9. Hapus barang dari daftar gudang. Master di Daftar Sparepart tidak tersentuh; riwayat tetap tersimpan.
create or replace function shop_gudang_hapus_item(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint := (p->>'productId')::bigint;
  v_force boolean := coalesce((p->>'force')::boolean, false);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_g int;
  v_kode text;
  v_nama text;
begin
  select stok into v_g from gudang_items where product_id = v_pid for update;
  if not found then
    raise exception 'Barang ini sudah tidak ada di daftar gudang.';
  end if;
  select kode, nama into v_kode, v_nama from products where id = v_pid;
  if v_g > 0 and not v_force then
    return jsonb_build_object('ok', false, 'alasan', 'masih_ada_stok', 'sisa', v_g);
  end if;
  if v_g > 0 then
    insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama)
    values (v_pid, 'KOREKSI', -v_g, 0, 'base', 'Dihapus dari daftar gudang', v_actor, v_name);
  end if;
  delete from gudang_items where product_id = v_pid;
  return jsonb_build_object('ok', true, 'kode', v_kode, 'nama', v_nama, 'stokDihapus', v_g);
end;
$$;

-- 10. Tandai tambah stok / ambil ke toko sudah dicek Admin (atau batalkan tandanya).
--     Catatan yang dibuat Admin sendiri otomatis berstatus sudah dicek (autoCek).
create or replace function shop_gudang_cek(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_nilai boolean := coalesce((p->>'nilai')::boolean, true);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_n int;
begin
  with ids as (
    select (value)::bigint as id from jsonb_array_elements_text(coalesce(p->'logIds', '[]'::jsonb))
  ),
  upd as (
    update gudang_log set
      dicek = v_nilai,
      dicek_oleh = case when v_nilai then v_actor else '' end,
      dicek_nama = case when v_nilai then v_name else '' end,
      dicek_pada = case when v_nilai then now() else null end
    where id in (select id from ids) and tipe in ('MASUK', 'PINDAH') and dicek is distinct from v_nilai
    returning 1
  )
  select count(*)::int into v_n from upd;
  return jsonb_build_object('ok', true, 'jumlah', v_n);
end;
$$;

-- 11. Stok Opname gudang (Admin): bandingkan hitungan fisik dengan stok sistem gudang. Selisih langsung menyesuaikan
--     stok gudang dan tercatat sebagai OPNAME (juga bila selisih 0, sebagai bukti sudah dicek). expectedStok mencegah
--     tertimpa bila ada yang menambah/mengambil barang saat Admin sedang menghitung.
create or replace function shop_gudang_opname(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint := (p->>'productId')::bigint;
  v_fisik int := (p->>'fisik')::int;
  v_expected int := (p->>'expectedStok')::int;
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 300);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_g int;
  v_sel int;
begin
  if v_fisik is null or v_fisik < 0 or v_fisik > 999999999 then
    raise exception 'Hasil hitung fisik harus bilangan bulat 0 atau lebih.';
  end if;
  select stok into v_g from gudang_items where product_id = v_pid for update;
  if not found then
    raise exception 'Barang ini belum ada di daftar gudang.';
  end if;
  if v_expected is distinct from v_g then
    return jsonb_build_object('ok', false, 'alasan', 'berubah', 'sisa', v_g);
  end if;
  v_sel := v_fisik - v_g;
  if v_sel <> 0 then
    update gudang_items set stok = v_fisik, diubah_pada = now() where product_id = v_pid;
  end if;
  insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama)
  values (v_pid, 'OPNAME', v_sel, v_fisik, 'base', v_catatan, v_actor, v_name);
  return jsonb_build_object('ok', true, 'stokSebelum', v_g, 'stokFisik', v_fisik, 'selisih', v_sel);
end;
$$;
