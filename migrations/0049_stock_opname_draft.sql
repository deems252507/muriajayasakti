-- Hitungan Sementara (draft) per lokasi. Draft TIDAK mengubah stok sistem.
-- Stok baru berubah saat petugas menekan "Konfirmasi Total", lewat shop_opname_save yang sudah ada.

alter table stock_opname_logs add column if not exists rincian jsonb;

create table if not exists stock_opname_draft (
  id bigserial primary key,
  product_id bigint not null references products (id) on delete cascade,
  lokasi text not null,
  lokasi_key text not null,
  jumlah int not null check (jumlah >= 0),
  qty_input int not null default 0,
  satuan_input text not null default '',
  catatan text not null default '',
  petugas text not null default '',
  petugas_nama text not null default '',
  stok_saat_hitung int not null default 0,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now(),
  unique (product_id, lokasi_key)
);

create index if not exists stock_opname_draft_lokasi_idx on stock_opname_draft (lokasi_key);

-- Simpan / ganti hitungan satu lokasi. Lokasi yang sama diganti, tidak ditambah.
create or replace function shop_opname_draft_save(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint;
  v_lokasi text;
  v_stok int;
  v_row stock_opname_draft%rowtype;
begin
  if coalesce(p->>'productId', '') !~ '^[0-9]{1,15}$' then
    raise exception 'Barang tidak valid.';
  end if;
  v_pid := (p->>'productId')::bigint;
  v_lokasi := left(regexp_replace(btrim(coalesce(p->>'lokasi', '')), '\s+', ' ', 'g'), 40);
  if v_lokasi = '' then
    raise exception 'Isi lokasi hitungan, misalnya Gudang atau Toko.';
  end if;
  if coalesce(p->>'jumlah', '') !~ '^[0-9]{1,9}$' or coalesce(p->>'qty', '') !~ '^[0-9]{1,9}$' then
    raise exception 'Jumlah fisik harus bilangan bulat 0 atau lebih.';
  end if;

  select stok into v_stok from products where id = v_pid;
  if not found then
    raise exception 'Barang tidak ditemukan.';
  end if;

  insert into stock_opname_draft (product_id, lokasi, lokasi_key, jumlah, qty_input, satuan_input, catatan, petugas, petugas_nama, stok_saat_hitung)
  values (
    v_pid, v_lokasi, lower(v_lokasi), (p->>'jumlah')::int, (p->>'qty')::int,
    left(coalesce(p->>'satuanInput', ''), 40), left(btrim(coalesce(p->>'catatan', '')), 500),
    coalesce(p->>'actor', ''), coalesce(p->>'actorName', ''), v_stok
  )
  on conflict (product_id, lokasi_key) do update set
    lokasi = excluded.lokasi,
    jumlah = excluded.jumlah,
    qty_input = excluded.qty_input,
    satuan_input = excluded.satuan_input,
    catatan = excluded.catatan,
    petugas = excluded.petugas,
    petugas_nama = excluded.petugas_nama,
    stok_saat_hitung = excluded.stok_saat_hitung,
    diubah_pada = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id);
end;
$$;

-- Konfirmasi total semua lokasi satu barang: jumlahkan draft, simpan sebagai satu pemeriksaan, hapus draft.
-- Semua dalam satu transaksi. Pengamannya sama dengan shop_opname_save (baris barang dikunci, stok yang dilihat
-- harus sama dengan stok terbaru, token unik). Tambahan: jika sejak hitungan pertama ada perubahan stok,
-- konfirmasi ditahan sampai petugas menyetujui (force).
create or replace function shop_opname_draft_confirm(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint;
  v_token text := nullif(btrim(coalesce(p->>'token', '')), '');
  v_force boolean := coalesce(p->>'force', 'false') = 'true';
  v_dilihat int;
  v_prod products%rowtype;
  v_total int;
  v_count int;
  v_oldest timestamptz;
  v_rincian jsonb;
  v_mut int := 0;
  v_net int := 0;
  v_res jsonb;
  v_args jsonb;
begin
  if coalesce(p->>'productId', '') !~ '^[0-9]{1,15}$' then
    raise exception 'Barang tidak valid.';
  end if;
  v_pid := (p->>'productId')::bigint;
  if v_token is null or length(v_token) > 100 then
    raise exception 'Kode pemeriksaan tidak valid. Muat ulang halaman.';
  end if;
  if coalesce(p->>'expectedStok', '') !~ '^-?[0-9]{1,9}$' then
    raise exception 'Data pemeriksaan tidak lengkap. Muat ulang halaman.';
  end if;
  v_dilihat := (p->>'expectedStok')::int;

  select * into v_prod from products where id = v_pid for update;
  if not found then
    raise exception 'Barang tidak ditemukan.';
  end if;

  v_args := jsonb_build_object(
    'productId', v_pid, 'token', v_token, 'expectedStok', v_dilihat,
    'catatan', coalesce(p->>'catatan', ''), 'openedAt', coalesce(p->>'openedAt', ''),
    'actor', coalesce(p->>'actor', ''), 'actorName', coalesce(p->>'actorName', '')
  );

  -- Kirim ulang (klik ganda): kembalikan hasil yang sama, draft tidak disentuh lagi.
  if exists (select 1 from stock_opname_logs where request_token = v_token) then
    return shop_opname_save(v_args || jsonb_build_object('fisik', 0));
  end if;

  select coalesce(sum(jumlah), 0)::int, count(*)::int, min(diubah_pada),
         jsonb_agg(jsonb_build_object('lokasi', lokasi, 'jumlah', jumlah, 'qty', qty_input,
                                      'satuan', satuan_input, 'petugas', petugas_nama, 'diubah', diubah_pada) order by lokasi)
    into v_total, v_count, v_oldest, v_rincian
  from stock_opname_draft where product_id = v_pid;

  if v_count = 0 then
    raise exception 'Belum ada hitungan sementara untuk barang ini.';
  end if;

  if v_prod.stok <> v_dilihat then
    return jsonb_build_object('ok', false, 'konflik', true, 'stokTerbaru', v_prod.stok,
                              'stokDilihat', v_dilihat, 'jumlahMutasi', 0, 'netMutasi', 0);
  end if;

  if not v_force then
    select count(*)::int, coalesce(sum(selisih), 0)::int into v_mut, v_net
    from stock_opname_mutasi where product_id = v_pid and tanggal >= v_oldest;
    if v_mut > 0 then
      return jsonb_build_object('ok', false, 'peringatan', true, 'jumlahMutasi', v_mut, 'netMutasi', v_net,
                                'stokSekarang', v_prod.stok, 'total', v_total);
    end if;
  end if;

  v_res := shop_opname_save(v_args || jsonb_build_object('fisik', v_total));

  if coalesce((v_res->>'ok')::boolean, false) and not coalesce((v_res->>'duplikat')::boolean, false) then
    update stock_opname_logs set rincian = v_rincian where id = (v_res->>'logId')::bigint;
    delete from stock_opname_draft where product_id = v_pid;
  end if;

  return v_res || jsonb_build_object('rincian', v_rincian);
end;
$$;
