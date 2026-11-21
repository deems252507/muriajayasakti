-- 0055: Simpan ke gudang (toko -> gudang), pasangan dari "Ambil ke toko" (gudang -> toko).
-- Tipe log baru: SETOR. Stok toko berkurang dan stok gudang bertambah dalam satu transaksi.
-- Hanya MENAMBAH tipe/fungsi; fungsi lama tetap dipakai untuk tipe lain.

-- 1. Izinkan tipe SETOR di gudang_log.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'gudang_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipe%'
  loop
    execute format('alter table gudang_log drop constraint %I', c.conname);
  end loop;
  alter table gudang_log add constraint gudang_log_tipe_check
    check (tipe in ('MASUK', 'PINDAH', 'SETOR', 'KOREKSI', 'OPNAME'));
end $$;

-- 2. Simpan ke gudang. Baris dikunci supaya dua orang bersamaan tidak membuat stok toko minus.
create or replace function shop_gudang_setor(p jsonb) returns jsonb
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
  v_toko int;
  v_g int;
  v_log bigint;
begin
  if v_jml <= 0 then
    raise exception 'Jumlah harus lebih dari 0.';
  end if;
  select stok into v_toko from products where id = v_pid for update;
  if not found then
    raise exception 'Barang tidak ditemukan di Daftar Sparepart.';
  end if;
  if v_jml > v_toko then
    return jsonb_build_object('ok', false, 'alasan', 'toko_kurang', 'sisa', v_toko);
  end if;

  insert into gudang_items (product_id, ditambah_oleh, ditambah_oleh_nama)
  values (v_pid, v_actor, v_name)
  on conflict (product_id) do nothing;

  update products set stok = stok - v_jml where id = v_pid returning stok into v_toko;
  update gudang_items set stok = stok + v_jml, diubah_pada = now()
    where product_id = v_pid returning stok into v_g;

  insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama, dicek, dicek_oleh, dicek_nama, dicek_pada)
  values (v_pid, 'SETOR', v_jml, v_qty, v_unit, v_catatan, v_actor, v_name,
          v_auto, case when v_auto then v_actor else '' end, case when v_auto then v_name else '' end, case when v_auto then now() else null end)
  returning id into v_log;

  return jsonb_build_object('ok', true, 'stokGudang', v_g, 'stokToko', v_toko, 'logId', v_log);
end;
$$;

-- 3. Edit entri riwayat: tambah penanganan SETOR (kebalikan PINDAH). Dipasang di fungsi *_core
--    yang dibungkus pemeriksaan alokasi faktur (0053).
create or replace function shop_gudang_edit_core(p jsonb) returns jsonb
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
    elsif v_log.tipe = 'SETOR' then
      -- SETOR: gudang bertambah, toko berkurang sebesar selisih.
      if v_g + v_delta < 0 then
        return jsonb_build_object('ok', false, 'alasan', 'gudang_kurang', 'sisa', v_g);
      end if;
      select stok into v_toko from products where id = v_log.product_id for update;
      if not found then
        raise exception 'Barang tidak ditemukan di Daftar Sparepart.';
      end if;
      if v_toko - v_delta < 0 then
        return jsonb_build_object('ok', false, 'alasan', 'toko_kurang', 'sisa', v_toko);
      end if;
      update gudang_items set stok = stok + v_delta, diubah_pada = now() where product_id = v_log.product_id;
      update products set stok = stok - v_delta where id = v_log.product_id;
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

-- 4. Hapus entri riwayat: SETOR dibatalkan dengan menarik barang kembali ke toko.
create or replace function shop_gudang_hapus_log_core(p jsonb) returns jsonb
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
  elsif v_log.tipe = 'SETOR' then
    if v_g - v_log.jumlah < 0 then
      return jsonb_build_object('ok', false, 'alasan', 'gudang_kurang', 'sisa', v_g);
    end if;
    perform 1 from products where id = v_log.product_id for update;
    if not found then
      raise exception 'Barang tidak ditemukan di Daftar Sparepart.';
    end if;
    update gudang_items set stok = stok - v_log.jumlah, diubah_pada = now() where product_id = v_log.product_id;
    update products set stok = stok + v_log.jumlah where id = v_log.product_id;
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

-- 5. Tanda "sudah dicek" juga berlaku untuk SETOR.
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
    where id in (select id from ids) and tipe in ('MASUK', 'PINDAH', 'SETOR') and dicek is distinct from v_nilai
    returning 1
  )
  select count(*)::int into v_n from upd;
  return jsonb_build_object('ok', true, 'jumlah', v_n);
end;
$$;
