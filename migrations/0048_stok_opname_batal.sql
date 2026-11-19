-- Stok Opname: bisa dibatalkan (stok dikembalikan) dan riwayat bisa dihapus oleh Admin.
-- Catatan tetap dilindungi: ubah/hapus HANYA lewat fungsi di bawah (yang dipanggil server dan dicatat di Riwayat Aktivitas).

alter table opname_checks add column if not exists satuan text not null default '';
alter table opname_checks add column if not exists batal_at timestamptz;
alter table opname_checks add column if not exists batal_oleh text not null default '';
-- Penanda cek di barang sebelum pengecekan ini, dipakai untuk mengembalikan status "belum dicek" saat dibatalkan.
alter table opname_checks add column if not exists prev_dicek_at timestamptz;
alter table opname_checks add column if not exists prev_hasil text not null default '';
alter table opname_checks add column if not exists prev_selisih int not null default 0;
-- Waktu penanda dicek yang dipasang pengecekan ini di barang (untuk memastikan hanya pengecekan terbaru yang mengembalikan penanda).
alter table opname_checks add column if not exists flag_at timestamptz;

create index if not exists opname_checks_batal_idx on opname_checks (batal_at);

-- Pelindung: catatan hanya boleh diubah/dihapus kalau fungsi resmi di bawah yang menjalankannya.
create or replace function opname_checks_immutable() returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.opname_ok', true), '') = '1' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception 'Catatan stok opname tidak dapat diubah atau dihapus.';
end;
$$;

-- Catatan lama (sebelum migrasi ini): pengecekan terakhir tiap barang yang masih bertanda "sudah dicek"
-- dianggap pemilik penanda itu, supaya bisa dibatalkan seperti catatan baru. Satuan diisi dari data barang.
select set_config('app.opname_ok', '1', true);

update opname_checks c
   set flag_at = p.dicek_at
  from products p
 where c.product_id = p.id
   and p.dicek_at is not null
   and c.flag_at is null
   and c.id = (select max(c2.id) from opname_checks c2 where c2.product_id = p.id);

update opname_checks c
   set satuan = p.satuan
  from products p
 where c.product_id = p.id and c.satuan = '';

select set_config('app.opname_ok', '', true);

-- Batalkan satu pengecekan: stok barang dikembalikan sebesar selisih pengecekan itu
-- (penjualan yang terjadi sesudahnya tidak ikut hilang), penanda "sudah dicek" dikembalikan,
-- dan catatan diberi tanda Dibatalkan (tetap tampil di Riwayat sebagai jejak).
-- Hasil: json { ok, code, stok, satuan }. code: ok | tidak_ada | sudah_batal | stok_minus
create or replace function opname_batal(p_id bigint, p_username text) returns json
language plpgsql
as $$
declare
  c opname_checks%rowtype;
  v_delta int;
  v_stok int;
  v_new int;
  v_flag timestamptz;
begin
  select * into c from opname_checks where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'code', 'tidak_ada');
  end if;
  if c.batal_at is not null then
    return json_build_object('ok', false, 'code', 'sudah_batal');
  end if;

  v_delta := c.stok_fisik - c.stok_sistem;
  v_new := null;

  if c.product_id is not null then
    select stok, dicek_at into v_stok, v_flag from products where id = c.product_id for update;
    if found then
      v_new := v_stok - v_delta;
      if v_new < 0 then
        return json_build_object('ok', false, 'code', 'stok_minus', 'stok', v_stok);
      end if;
      update products set stok = v_new where id = c.product_id;
      -- Penanda dicek dikembalikan hanya kalau pengecekan inilah yang terakhir memasangnya.
      if c.flag_at is not null and v_flag is not null and v_flag = c.flag_at then
        update products
           set dicek_at = c.prev_dicek_at, dicek_hasil = c.prev_hasil, dicek_selisih = c.prev_selisih
         where id = c.product_id;
      end if;
    end if;
  end if;

  perform set_config('app.opname_ok', '1', true);
  update opname_checks set batal_at = now(), batal_oleh = coalesce(p_username, '') where id = p_id;
  perform set_config('app.opname_ok', '', true);

  return json_build_object('ok', true, 'code', 'ok', 'stok', v_new, 'satuan', c.satuan);
end;
$$;

-- Hapus riwayat satu kelompok (tanggal lokal WITA + kategori + Admin). Stok barang TIDAK diubah.
-- Penanda "sudah dicek" dilepas untuk barang yang penandanya berasal dari catatan yang dihapus.
-- Hasil: jumlah catatan yang dihapus.
create or replace function opname_hapus(p_tgl date, p_kategori text, p_username text) returns int
language plpgsql
as $$
declare
  v_ids bigint[];
  v_n int;
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from opname_checks
   where ((ts at time zone 'UTC') + interval '8 hours')::date = p_tgl
     and kategori = p_kategori and username = p_username;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return 0;
  end if;

  -- Lepas penanda dicek yang dipasang oleh catatan yang akan dihapus (dan masih aktif di barang).
  update products p
     set dicek_at = null, dicek_hasil = '', dicek_selisih = 0
   where p.dicek_at is not null
     and exists (
       select 1 from opname_checks c
        where c.id = any(v_ids) and c.product_id = p.id and c.flag_at = p.dicek_at
     );

  perform set_config('app.opname_ok', '1', true);
  delete from opname_checks where id = any(v_ids);
  get diagnostics v_n = row_count;
  perform set_config('app.opname_ok', '', true);

  return v_n;
end;
$$;
